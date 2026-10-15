-- Extend the existing attachment metadata for reserved, direct-to-storage uploads.
ALTER TABLE message_attachments ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE message_attachments DROP CONSTRAINT message_attachments_mime_type_check;
ALTER TABLE message_attachments ADD CONSTRAINT message_attachments_mime_type_check CHECK (mime_type IN (
  'image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/mpeg','audio/wav','video/mp4','video/webm'
));
ALTER TABLE message_attachments
  ADD COLUMN upload_state text NOT NULL DEFAULT 'available'
    CHECK (upload_state IN ('pending','available','delete_pending','deleted','failed')),
  ADD COLUMN reserved_until timestamptz,
  ADD COLUMN available_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN cleanup_attempts integer NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0),
  ADD COLUMN cleanup_after timestamptz,
  ADD COLUMN cleanup_error text;
UPDATE message_attachments SET available_at=created_at WHERE upload_state='available';
ALTER TABLE message_attachments ALTER COLUMN available_at SET DEFAULT now();
ALTER TABLE message_attachments ADD CONSTRAINT attachment_state_shape CHECK (
  (upload_state='pending' AND message_id IS NULL AND reserved_until IS NOT NULL) OR
  (upload_state='available' AND message_id IS NOT NULL AND available_at IS NOT NULL) OR
  (upload_state IN ('delete_pending','deleted','failed'))
);
CREATE INDEX attachments_uploader_quota_idx ON message_attachments(uploader_id, upload_state, reserved_until);
CREATE INDEX attachments_cleanup_idx ON message_attachments(cleanup_after)
  WHERE upload_state IN ('pending','delete_pending','failed');

-- Attachment availability changes are visible through the existing polling revision.
CREATE TRIGGER realtime_attachment_changed AFTER INSERT OR UPDATE OF upload_state, deleted_at ON message_attachments
  FOR EACH ROW WHEN (NEW.message_id IS NOT NULL) EXECUTE FUNCTION bump_conversation_revision();

-- Pending rows also retain a valid uploader/conversation relationship.
ALTER TABLE message_attachments ADD CONSTRAINT attachment_uploader_member
  FOREIGN KEY (conversation_id,uploader_id) REFERENCES conversation_members(conversation_id,user_id);
