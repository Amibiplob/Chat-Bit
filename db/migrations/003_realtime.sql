-- Additive: existing messages and accounts are retained.
CREATE TABLE realtime_revisions (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO realtime_revisions (user_id) SELECT id FROM users;

-- Canonical lock order avoids cross-partner revision lock inversions.
-- Counters change transactionally, so a response can never advance past an
-- uncommitted change as it could with max(global_sequence).
CREATE FUNCTION bump_conversation_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE low_id uuid; high_id uuid; conversation uuid;
BEGIN
  IF TG_TABLE_NAME = 'conversations' THEN conversation := NEW.id;
  ELSE conversation := NEW.conversation_id; END IF;
  SELECT participant_low, participant_high INTO low_id, high_id
    FROM conversations WHERE id = conversation;
  INSERT INTO realtime_revisions (user_id) VALUES (low_id), (high_id)
    ON CONFLICT DO NOTHING;
  UPDATE realtime_revisions SET revision = revision + 1 WHERE user_id = low_id;
  UPDATE realtime_revisions SET revision = revision + 1 WHERE user_id = high_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER realtime_conversation_created AFTER INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION bump_conversation_revision();
CREATE TRIGGER realtime_message_created AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION bump_conversation_revision();
CREATE TRIGGER realtime_message_changed AFTER UPDATE OF body, edited_at, deleted_at ON messages
  FOR EACH ROW WHEN (OLD.body IS DISTINCT FROM NEW.body OR OLD.edited_at IS DISTINCT FROM NEW.edited_at
    OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) EXECUTE FUNCTION bump_conversation_revision();
CREATE TRIGGER realtime_message_read AFTER INSERT ON message_read_states
  FOR EACH ROW EXECUTE FUNCTION bump_conversation_revision();

-- Transient current state only: no typing history or keystroke content.
CREATE TABLE realtime_activity (
  session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  tab_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  conversation_id uuid,
  sequence bigint NOT NULL CHECK (sequence > 0),
  last_seen timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  typing_until timestamptz,
  PRIMARY KEY (session_hash, tab_id),
  FOREIGN KEY (conversation_id, user_id) REFERENCES conversation_members(conversation_id, user_id),
  CHECK (typing_until IS NULL OR (conversation_id IS NOT NULL AND typing_until <= expires_at))
);
CREATE INDEX realtime_activity_user_idx ON realtime_activity(user_id, expires_at DESC);
