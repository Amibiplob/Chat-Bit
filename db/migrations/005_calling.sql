-- Legacy calls were demonstration history and have no recoverable media session.
UPDATE calls SET status='failed',ended_at=now() WHERE ended_at IS NULL;
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT conname FROM pg_constraint
    WHERE conrelid='calls'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP EXECUTE format('ALTER TABLE calls DROP CONSTRAINT %I',item.conname); END LOOP;
END $$;
DROP INDEX calls_active_conversation_idx;
ALTER TABLE calls
  ADD COLUMN client_id uuid,
  ADD COLUMN caller_tab uuid,
  ADD COLUMN callee_tab uuid,
  ADD COLUMN caller_session text,
  ADD COLUMN callee_session text,
  ADD COLUMN caller_seen timestamptz,
  ADD COLUMN callee_seen timestamptz,
  ADD COLUMN connected_at timestamptz,
  ADD COLUMN ending_reason text CHECK (char_length(ending_reason)<=80),
  ADD COLUMN signal_sequence integer NOT NULL DEFAULT 0 CHECK (signal_sequence BETWEEN 0 AND 512),
  ADD CONSTRAINT calls_status_check CHECK (status IN ('ringing','connecting','active','rejected','missed','cancelled','ended','failed')),
  ADD CONSTRAINT calls_terminal_shape CHECK ((status IN ('ringing','connecting','active'))=(ended_at IS NULL)),
  ADD CONSTRAINT calls_answer_shape CHECK (status NOT IN ('connecting','active') OR answered_at IS NOT NULL),
  ADD CONSTRAINT calls_live_owner CHECK (ended_at IS NOT NULL OR (caller_tab IS NOT NULL AND caller_session IS NOT NULL AND caller_seen IS NOT NULL)),
  ADD CONSTRAINT calls_recipient_owner CHECK (status NOT IN ('connecting','active') OR (callee_tab IS NOT NULL AND callee_session IS NOT NULL AND callee_seen IS NOT NULL)),
  ADD CONSTRAINT calls_connected_shape CHECK (status<>'active' OR connected_at IS NOT NULL);
CREATE UNIQUE INDEX calls_request_idx ON calls(caller_id,client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX calls_active_conversation_idx ON calls(conversation_id) WHERE ended_at IS NULL;
CREATE INDEX calls_expiration_idx ON calls(caller_seen,callee_seen) WHERE ended_at IS NULL;

-- A unique user slot prevents conflicting calls even across conversations.
CREATE TABLE call_slots (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  call_id uuid NOT NULL REFERENCES calls(id)
);
CREATE TABLE call_signals (
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 512),
  sender_id uuid NOT NULL REFERENCES users(id),
  client_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('offer','answer','ice')),
  payload jsonb NOT NULL CHECK (octet_length(payload::text)<=60000),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
  PRIMARY KEY(call_id,sequence), UNIQUE(call_id,sender_id,client_id)
);
CREATE UNIQUE INDEX call_description_once ON call_signals(call_id,sender_id,kind) WHERE kind IN ('offer','answer');
CREATE INDEX call_signals_expiry_idx ON call_signals(expires_at);
CREATE FUNCTION manage_call_slots() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ended_at IS NULL AND TG_OP='INSERT' THEN
    INSERT INTO call_slots(user_id,call_id)
      SELECT u.id,NEW.id FROM users u WHERE u.id IN (NEW.caller_id,NEW.callee_id) ORDER BY u.id;
  ELSIF NEW.ended_at IS NOT NULL THEN
    DELETE FROM call_slots WHERE call_id=NEW.id;
    DELETE FROM call_signals WHERE call_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER call_slots_changed AFTER INSERT OR UPDATE OF status ON calls
  FOR EACH ROW EXECUTE FUNCTION manage_call_slots();
