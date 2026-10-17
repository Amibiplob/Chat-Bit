# Private PostgreSQL objects and first migration

ChatBit uses custom authentication and server-side parameterized SQL. Supabase
Auth/API roles must not read or mutate its database objects. Supabase Storage is
accessed through its server-only API key and retains its existing permissions.

## What migration 008 does

`008_security_hardening.sql` revokes all table privileges from PUBLIC and any
existing `anon`, `authenticated`, and `service_role` roles on the 14 application
tables and `chatbit_schema_migrations`. It enables RLS with no API policies and
revokes EXECUTE on the four exact zero-argument trigger functions. It changes no
rows, owners, role memberships, shared/default privileges, or managed schemas.
There are no ChatBit sequences in migrations 001–007. A plain PostgreSQL database
without Supabase roles still receives PUBLIC revokes and RLS.

Operations use the active migration schema (`public` in production), not a search
for tables across schemas. Managed auth/storage/realtime schemas are rejected.
The existing public automatic-RLS event-trigger function is not changed. RLS is
explicitly enabled because that event trigger catches and suppresses failures.
Revokes are still necessary: RLS does not protect TRUNCATE, and service_role can
bypass RLS. PUBLIC EXECUTE is revoked on the exact functions themselves; a
schema-scoped default revoke cannot remove globally granted EXECUTE.

The current server and migration connections use the same owning PostgreSQL role,
`postgres`, with BYPASSRLS. Owner permissions remain; RLS is not forced. Existing
trigger functions stay SECURITY INVOKER and execute using server permissions.
If adopting a separate runtime role later, explicitly grant schema USAGE,
application-table SELECT/INSERT/UPDATE/DELETE and required function EXECUTE, then
review its RLS strategy and test all triggers. Do not give a runtime role migration
history writes or assume that table grants alone bypass RLS.

## Atomic application and future migrations

The runner lists files in lexical order, acquires one client, sends BEGIN and the
transaction advisory lock, creates/reads migration history, executes every pending
file and history insert, then COMMITs once. Thus a fresh install runs 001–008
before any objects become visible to other sessions. A failure in 008 rolls back
001–007 and history as well. On an existing install, 008 protects existing objects
at its commit; it cannot undo earlier exposure. The runner is not called by build.

Keep migration files free of transaction-control statements and operations that
require execution outside a transaction. Never run 001–007 separately on a fresh
Supabase installation or add hardening only in a later deployment. Do not edit
applied/checksummed migration files. Add a new migration for later changes.

Default ACLs are deliberately unchanged. The observed public creators are
postgres, pg_database_owner, and supabase_admin. Each actual creator has its own
defaults; role membership does not merge creator defaults. postgres and
supabase_admin have broad public API grants. A postgres-only default change would
not cover all creators, and global function-default changes could affect future
managed objects. No such changes are authorized by this implementation.

Every future object-creation migration must explicitly revoke PUBLIC/API privileges
and enable RLS for its new private tables **in the same transaction**, regardless
of creator defaults. Handle functions by exact signature and revoke sequence
privileges if sequences are added. Preserve ownership/runtime grants. Table-level
REVOKE does not remove independent column grants: this fresh-install migration
has no column grants, but future column grants need explicit review/revocation.
Re-check effective privileges, inherited roles, column ACLs, RLS and actual denied
operations in tests. Monitor objects created outside this runner; 008 does not
protect future unrelated objects or stop privileged administrators regranting access.

## Regression checks and isolated test environment

`pnpm test` includes database-free inventory and runner transaction/failure tests.
The live security suite requires an explicit `TEST_SECURITY_DATABASE_URL` pointing
to a disposable **loopback** PostgreSQL 17 cluster; it never loads `.env` or uses
DATABASE_URL/DATABASE_MIGRATION_URL. Load `tests/fixtures/supabase-security.sql`
using an administrator on that cluster only. The fixture creates API roles, a
non-superuser BYPASSRLS owner, a PUBLIC-only probe, and managed-schema sentinels.
Do not load the fixture on Supabase or an existing shared database.

The suite creates/removes random schemas and broad schema-scoped fixture defaults.
It checks effective API and PUBLIC table/column/function access, denied SELECT
and TRUNCATE (including service_role), owner writes and all trigger functions,
RLS, before-commit invisibility, rollback and untouched sentinel schemas/defaults.
It also checks PostgreSQL major 17, stored migration checksums, declared indexes,
and real authentication/session and attachment queries under the owning role.
It models Supabase's relevant permissions, not the complete hosted Auth/Storage
stack. CI provisions PostgreSQL 17 and loads the fixture before the full suite.
Without that environment, database tests report SKIP; unit checks do not prove
live PostgreSQL execution or hosted-service compatibility.
See [verification results and GitHub Actions instructions](database-security-verification.md)
for local evidence and pending remote checks. No local database installation
is needed to use that workflow.

## Supabase Free backup prerequisites

Do not rely on paid-plan daily-backup/PITR recovery for a Free project. Supabase
recommends regular logical exports and off-site copies for Free. Verify current
plan capabilities in the dashboard before approval. See the official
[backup documentation](https://supabase.com/docs/guides/platform/backups) and
[Supabase logical backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

For server 17.6, use current PostgreSQL **17.x** pg_dump/pg_restore tools (or a
compatible newer major, with a matching restore client). pg_dump 16 cannot dump
a PostgreSQL 17 server. Install the PostgreSQL 17 client from a trusted package
source or use an official postgres:17 container if Docker is available. Check
`/path/to/postgresql-17/bin/pg_dump --version` before exporting. No installer,
backup, or restore is run by migrations/tests/build.

Configure a private libpq service file outside Git for a `chatbit_backup` service:
use the session-pooler host/port and database/user, `sslmode=verify-full`, and
`sslrootcert` pointing at the downloaded CA file. Supply the password with a
private password file (mode 0600), never a URL in arguments, shell history or
logs. Do not reuse the dotenv quoted PEM value as a libpq certificate filename.
See [libpq password files](https://www.postgresql.org/docs/17/libpq-pgpass.html).
Use restrictive file permissions and disable shell tracing. Example commands
contain no credentials:

```bash
umask 077
# Choose a private directory OUTSIDE the repository; set backup_dir to that path.
# PGSERVICEFILE and PGPASSFILE must refer to your privately prepared files.
PGSERVICE=chatbit_backup /path/to/postgresql-17/bin/pg_dump \
  --format=custom --schema=public --file="$backup_dir/chatbit-public.dump"
/path/to/postgresql-17/bin/pg_restore --list "$backup_dir/chatbit-public.dump" \
  > "$backup_dir/chatbit-public.contents"
sha256sum "$backup_dir/chatbit-public.dump" > "$backup_dir/chatbit-public.sha256"
```

This is a **public-schema** backup, not a full Supabase project backup. Preserve
ACLs/owners in the archive; capture role definitions (without role passwords),
default ACLs, extensions, platform configuration and the migration repository
revision separately. The existing public event-trigger function is included;
review the archive when restoring into a Supabase target that already has it.
Before the first migration, this archive contains no ChatBit tables and is not
by itself sufficient to protect existing Auth/Storage data.

For the project's existing managed Auth/Storage data, follow Supabase's supported
CLI logical export procedure for roles, schema and data and its managed-schema
restore rules. Verify the CLI's underlying pg_dump version is 17-compatible;
use its linked-project/private credential handling, never paste secret URLs into
commands or logs. Verify the export actually includes the needed managed data;
CLI schema exclusions and versions matter. Retain an inventory/count manifest
without copying user records into logs. Store exports encrypted off-site with
keys kept separately, and back up Storage file bytes separately: database dumps
contain metadata, not those bytes. A raw full-database restore into an initialized
Supabase project can conflict with managed objects and permissions.

## Restore rehearsal and approval gate

1. Stop or coordinate writes during the backup window if several exports must be
   mutually consistent. Record the source identity, server/client versions,
   timestamp, repository revision, migration history and object/count manifest.
2. Confirm export exit statuses, checksums, readable archive contents, encrypted
   off-site copies and recovery keys. Listing an archive is not a restore test.
3. Provision a separate disposable PostgreSQL 17/Supabase-compatible environment.
   Prepare a distinct private libpq service named `chatbit_restore_test`; verify
   its identity is not production. Recreate only reviewed roles/extensions.
4. For a plain empty rehearsal database, restore the reviewed public archive:

   ```bash
   PGSERVICE=chatbit_restore_test /path/to/postgresql-17/bin/pg_restore \
     --exit-on-error --single-transaction --dbname=service=chatbit_restore_test \
     "$backup_dir/chatbit-public.dump"
   ```

   Preserve required owners/ACLs, or explicitly map them in the isolated restore
   plan. Do not use --clean on production. For a hosted Supabase target, use the
   official restore procedure and reconcile pre-existing managed objects instead.
5. Compare schemas/counts, history/checksums, functions/triggers, ACLs, RLS and
   application operations. Rehearse 001–008 plus security tests there; validate
   Auth and Storage separately if they are in the recovery scope.
6. Only approve production migration after the restore rehearsal and isolated
   migration tests succeed. Keep a maintenance/recovery window and verified
   pre-migration exports. No live migration or permissions change is authorized
   by these instructions.

A failed migration rolls back automatically. After a successful commit there is
no automatic down migration. Prefer a reviewed corrective migration; restore a
backup only under a separate recovery plan that accounts for subsequent writes.
For permission rollback, preserve the prior ACL/RLS manifest and restore only
intentional grants. Do not blindly regrant broad API access. Reverting Git alone
does not reverse database security state.
