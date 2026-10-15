-- Additive. Apply only to an explicitly reviewed database, never during builds.
ALTER TABLE users
  ADD COLUMN notify_messages boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_calls boolean NOT NULL DEFAULT true,
  ADD COLUMN show_online boolean NOT NULL DEFAULT true,
  ADD COLUMN show_last_seen boolean NOT NULL DEFAULT true,
  ADD COLUMN avatar_version integer NOT NULL DEFAULT 0 CHECK (avatar_version>=0);
-- Small, scoped avatars share the database lifecycle; no public storage URLs.
CREATE TABLE profile_avatars (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 24 AND 262144),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp'))
);
CREATE FUNCTION bump_profile_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO realtime_revisions(user_id) SELECT DISTINCT cm.user_id
    FROM conversation_members cm WHERE cm.conversation_id IN
      (SELECT conversation_id FROM conversation_members WHERE user_id=NEW.id)
    ON CONFLICT DO NOTHING;
  -- Acquire every affected revision in canonical order, including the owner.
  PERFORM user_id FROM realtime_revisions WHERE user_id=NEW.id OR user_id IN (
    SELECT cm.user_id FROM conversation_members cm JOIN conversation_members own
      ON own.conversation_id=cm.conversation_id WHERE own.user_id=NEW.id)
    ORDER BY user_id FOR UPDATE;
  UPDATE realtime_revisions SET revision=revision+1 WHERE user_id=NEW.id OR user_id IN (
    SELECT cm.user_id FROM conversation_members cm JOIN conversation_members own
      ON own.conversation_id=cm.conversation_id WHERE own.user_id=NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER profile_revision_changed AFTER UPDATE OF display_name,avatar_version ON users
  FOR EACH ROW EXECUTE FUNCTION bump_profile_revision();
