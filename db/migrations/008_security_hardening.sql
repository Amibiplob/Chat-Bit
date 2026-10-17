-- The runner executes this before COMMIT, in the same transaction as 001-007.
-- Scope every operation to the migration schema; never change shared defaults.
-- Missing Supabase roles are allowed on plain PostgreSQL installations.
DO $hardening$
DECLARE
  schema_name text := current_schema();
  object_name text;
  grantees text := 'PUBLIC';
BEGIN
  IF schema_name IS NULL OR schema_name IN ('auth', 'storage', 'realtime', 'information_schema')
     OR schema_name LIKE 'pg_%' THEN
    RAISE EXCEPTION 'Invalid ChatBit migration schema';
  END IF;

  FOR object_name IN
    SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    grantees := grantees || ', ' || quote_ident(object_name);
  END LOOP;

  FOREACH object_name IN ARRAY ARRAY[
    'users', 'sessions', 'conversations', 'conversation_members', 'messages',
    'message_attachments', 'message_read_states', 'calls', 'auth_rate_limits',
    'realtime_revisions', 'realtime_activity', 'call_slots', 'call_signals',
    'profile_avatars', 'chatbit_schema_migrations'
  ] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %s', schema_name, object_name, grantees);
    -- Do not FORCE RLS: the owning server role must retain its SQL/trigger access.
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, object_name);
  END LOOP;

  -- Exact zero-argument trigger-function signatures from 001, 003, 005 and 006.
  FOREACH object_name IN ARRAY ARRAY[
    'validate_direct_member()', 'bump_conversation_revision()',
    'manage_call_slots()', 'bump_profile_revision()'
  ] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %I.%s FROM %s', schema_name, object_name, grantees);
  END LOOP;
END;
$hardening$;
