-- Additive migration. The migration runner supplies the transaction.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiration_idx ON sessions(expires_at);

-- Canonical UUID ordering prevents duplicate direct conversations.
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_low uuid NOT NULL REFERENCES users(id),
  participant_high uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (participant_low < participant_high),
  UNIQUE (participant_low, participant_high)
);
CREATE INDEX conversations_high_idx ON conversations(participant_high);

CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members(user_id, conversation_id);

CREATE FUNCTION validate_direct_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM conversations WHERE id = NEW.conversation_id
    AND NEW.user_id IN (participant_low, participant_high)
  ) THEN
    RAISE EXCEPTION 'Invalid direct conversation member' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER direct_member_guard BEFORE INSERT OR UPDATE ON conversation_members
  FOR EACH ROW EXECUTE FUNCTION validate_direct_member();

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sender_id uuid NOT NULL,
  client_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  reply_to_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  FOREIGN KEY (conversation_id, sender_id) REFERENCES conversation_members(conversation_id, user_id),
  UNIQUE (conversation_id, id),
  UNIQUE (conversation_id, id, sender_id),
  UNIQUE (sender_id, client_id),
  FOREIGN KEY (conversation_id, reply_to_id) REFERENCES messages(conversation_id, id),
  CHECK (reply_to_id IS DISTINCT FROM id),
  CHECK (edited_at IS NULL OR edited_at >= created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at)
);
CREATE INDEX messages_page_idx ON messages(conversation_id, created_at DESC, id DESC);
CREATE INDEX messages_reply_idx ON messages(conversation_id, reply_to_id) WHERE reply_to_id IS NOT NULL;

CREATE TABLE message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  uploader_id uuid NOT NULL,
  storage_key text NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 1 AND 512),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, message_id, uploader_id) REFERENCES messages(conversation_id, id, sender_id)
);
CREATE INDEX attachments_message_idx ON message_attachments(conversation_id, message_id);

CREATE TABLE message_read_states (
  conversation_id uuid NOT NULL,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (conversation_id, message_id) REFERENCES messages(conversation_id, id),
  FOREIGN KEY (conversation_id, user_id) REFERENCES conversation_members(conversation_id, user_id)
);
CREATE INDEX read_states_member_idx ON message_read_states(conversation_id, user_id, message_id);

CREATE TABLE calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('voice', 'video')),
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  FOREIGN KEY (conversation_id, caller_id) REFERENCES conversation_members(conversation_id, user_id),
  FOREIGN KEY (conversation_id, callee_id) REFERENCES conversation_members(conversation_id, user_id),
  CHECK (caller_id <> callee_id),
  CHECK (answered_at IS NULL OR answered_at >= created_at),
  CHECK (ended_at IS NULL OR ended_at >= COALESCE(answered_at, created_at)),
  CHECK ((status IN ('ringing', 'accepted')) = (ended_at IS NULL)),
  CHECK (status <> 'accepted' OR answered_at IS NOT NULL)
);
CREATE INDEX calls_history_idx ON calls(conversation_id, created_at DESC, id DESC);
CREATE INDEX calls_caller_idx ON calls(caller_id, created_at DESC);
CREATE INDEX calls_callee_idx ON calls(callee_id, created_at DESC);
CREATE UNIQUE INDEX calls_active_conversation_idx ON calls(conversation_id) WHERE status IN ('ringing', 'accepted');
