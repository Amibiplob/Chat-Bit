# Manual encrypted Supabase backup

This workflow reads the source database only. It never loads `.env`, runs ChatBit
migrations, deploys, or restores into Supabase. PostgreSQL and Docker run on the
GitHub-hosted runner, not your computer. There is no push, PR or scheduled trigger.

## Add five repository secrets

Open **GitHub repository → Settings → Secrets and variables → Actions →
Repository secrets → New repository secret**. Add these exact names privately:

| Secret | Value |
| --- | --- |
| `SUPABASE_BACKUP_HOST` | Host only from Supabase **Connect → Session pooler**, ending in `.pooler.supabase.com`. No URL, protocol, port or path. |
| `SUPABASE_BACKUP_USER` | Session-pooler database username, `postgres.` followed by your project reference. This is not a Supabase API key. |
| `SUPABASE_BACKUP_PASSWORD` | Existing database password, entered directly, not URL-encoded. Do not reset it just to run the backup. |
| `SUPABASE_BACKUP_CA` | Full trusted CA PEM certificate text, including BEGIN/END lines, from your existing verified Supabase certificate configuration. Actual line breaks, not literal `\n`. |
| `CHATBIT_BACKUP_PASSPHRASE` | A unique randomly generated high-entropy passphrase of at least 32 characters; recommend 48 random bytes encoded as base64. Keep a separate recovery copy in your password manager. |

The database name is fixed to `postgres` and port to **5432**, the session pooler,
not transaction pooler 6543. A direct `db.<project-reference>.supabase.co` host
with username `postgres` is also accepted, but hosted-runner IPv6 reachability
can make that fail; prefer the session pooler. TLS uses `verify-full` in libpq
and certificate/hostname verification in Node. No insecure SSL fallback exists.

You can generate the encryption secret with your existing password manager, or
locally with `openssl rand -base64 48`. Do not paste it into chat, commit it,
reuse the database password, or put it in workflow inputs/command arguments.
GitHub secrets cannot be read back later: save the recovery key separately now.

Secrets are provided only to the export/encryption step, after dependency
installation. Do not add them to the ordinary Verify ChatBit workflow. People
who can change trusted workflow code can misuse repository secrets; review the
default branch and repository access before running this production-data job.

## Run it manually

1. Push the reviewed commit yourself to the repository's default branch.
2. Check that the five secrets identify the intended Supabase project.
3. Arrange a quiet backup window: pause application writes and avoid database
   schema, permissions and role changes until export finishes. The workflow does
   not pause Vercel, other applications or Supabase services for you.
4. Open **Actions → Manual encrypted database backup → Run workflow**.
   Select the default branch, check the quiet-source confirmation, then run it.
   Other branches and an unchecked confirmation fail before secrets are used.
   If the guard reports that confirmation was not true, start a **new** dispatch
   through **Run workflow** and check the box there. **Re-run jobs** retains the
   original run's inputs; it cannot change a false confirmation to true.
   The input is a boolean in GitHub's `inputs` context and becomes the text
   `true` or `false` in `CONFIRMED`. A logged `false` is rejected intentionally;
   changing boolean/string conversion cannot turn it into valid consent.
5. Wait for export, encryption, checksum checks, restore and upload. Only a
   successful export/restore step establishes the checks described below. A
   cancelled or failed run is not a verified backup, even if it has an artifact.

This uses a 30-minute hosted job and serialized manual runs. It creates no paid
Supabase services; ordinary GitHub Actions minutes/storage and Supabase read
traffic/egress quotas still apply. No remote run has been performed by the agent.

## What is in the encrypted archive

The Node script holds a repeatable-read, read-only source transaction and exports
a PostgreSQL snapshot. All three `pg_dump` archives and the catalog/row-count
manifest use that snapshot. Export sessions also start with
`default_transaction_read_only=on`. PostgreSQL dump tools take ordinary read
locks but execute no source DDL/DML. Table creation and restore commands use a
separate hard-coded loopback `restore_test` database, never source settings.

| File inside the encrypted tar | Scope |
| --- | --- |
| `public.dump` | PostgreSQL 17 custom archive of all `public` schema objects and table/sequence data, owners, grants, default ACLs, RLS/policies, indexes, constraints, functions and triggers. Includes ChatBit migration history if it exists. No migrations are applied if it does not. |
| `auth-storage-data.dump` | Data-only archive for `auth` and `storage`, excluding `auth.schema_migrations`, `storage.migrations`, `storage.buckets_vectors` and `storage.vector_indexes`, following Supabase's managed-table exclusion approach. |
| `managed-schema-reference.dump` | Schema-only reference for `auth`, `storage` and `realtime`, including their definitions/ACLs. For reviewed recovery/customization work, not blind replay into an initialized Supabase project. Realtime runtime data is not exported. |
| `roles-reference.sql` | Role definitions and membership grants from `pg_dumpall --roles-only --no-role-passwords`. Includes reserved/platform roles for reference, not automatic replay. |
| `manifest.json` | Public row counts and normalized object/owner/ACL/RLS/index/function/policy metadata, roles without passwords, memberships, extensions, schema inventory, global default ACLs and event-trigger definitions; commit/run ID and backup time. |
| `checksums.json` | SHA-256 checksums for each payload file above. |

`pg_dumpall` cannot import a snapshot; its role export is a separate read-only
connection. Hence the explicit quiet-source confirmation, especially for role
changes. No backup can guarantee consistency with external Storage bytes or
independent platform settings from these SQL snapshots alone.

These exports use PostgreSQL 17 tools and adapt Supabase's schema/data/role
separation and managed-table exclusions without requiring the CLI. This is a
**scoped ChatBit/public + Auth/Storage recovery bundle**, not a complete physical
Supabase project backup or a drop-in copy of the CLI's filtered SQL files. Extra
application schemas need explicit inclusion before you rely on this bundle.

## Encryption and verification

Only `chatbit-backup.tar.enc` and its ciphertext `.sha256` file are uploaded.
The manifest, dumps, SQL, source identity, table names/counts and inner checksums
are inside the encrypted file. Secrets, raw SQL, URLs, database errors and tool
output are not printed. Errors identify the failed stage without exposing data.

The V1 envelope uses AES-256-GCM with a random 32-byte salt, random 12-byte nonce
and 16-byte authentication tag. Scrypt derives a 32-byte key using N=65536, r=8,
p=1. The header `CHATBIT_BACKUP_V1\n` plus salt and nonce is authenticated. The
recovery helper and envelope version should be retained with the backup.

On GitHub, the script:

1. Hashes payloads, creates a private tar and encrypts it before upload.
2. Writes and rechecks the ciphertext checksum, authenticates/decrypts the actual
   encrypted archive, compares the original/decrypted tar hashes, and rechecks
   every payload checksum. Modified/wrong-key files must fail authentication.
3. Verifies that all three custom archives can be listed by PostgreSQL 17 tools.
4. Restores the decrypted `public.dump` into a fresh disposable PostgreSQL 17
   database, with owner/ACL restoration enabled and one fail-fast transaction.
   Source roles are represented by NOLOGIN name stubs; production role SQL and
   passwords are never replayed. The local default public schema is removed
   before restoring the archived schema; the source schema is never removed.
5. Compares normalized public owners, schema/table/column/function ACLs, scoped
   default ACLs, RLS flags/policies, index definitions/validity, function inventory
   and table row counts against the source snapshot. Sequence values and data
   are restored by pg_restore; row counts are not a row-by-row data digest.

Archive hashes establish byte integrity; GCM establishes authentication with the
recovery key. Successful pg_restore plus catalog/count comparison is stronger
than a readable archive listing, but only verifies the scope above. This is not
an application/end-to-end test or a hosted Supabase recovery rehearsal.

## Supabase limitations

- Managed Auth/Storage data is exported and archive readability is checked, but
  is **not restored** into generic PostgreSQL. It needs a compatible initialized
  Supabase destination and separately reviewed recovery procedure.
- Reserved roles, login passwords, role attributes (including BYPASSRLS), role
  membership semantics, global defaults, event-trigger activation, publications,
  managed services and extension behavior are not reproduced by the public
  rehearsal. Original SQL/metadata is retained for review. Do not execute
  `roles-reference.sql` or the managed reference archive wholesale on Supabase.
- If public objects depend on managed functions, foreign keys, custom extensions
  or unavailable types, the generic restore may fail. The job fails rather than
  stripping grants, skipping SQL errors or claiming full verification. A completed
  encrypted export is still uploaded for private inspection/recovery planning.
- Storage **file bytes**, Vault/encryption root keys, API keys, Auth configuration,
  Edge Functions, Vercel settings, other custom schemas and service-level settings
  are outside this backup. Supabase migration history in `supabase_migrations`
  is not exported; ChatBit uses its own history in `public`. Preserve separately
  if your project also uses Supabase CLI migrations.
- Reference schemas/ACLs may expose managed customizations for review, but a raw
  restore can conflict with existing platform objects. Follow the supported
  Supabase restore procedure, including compatible extensions and encryption-key
  handling. Never test recovery against the source database.

Official references: [Supabase backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[Supabase Free backup guidance and Storage exclusions](https://supabase.com/docs/guides/platform/backups),
[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html).

## Download and keep an independent private copy

Artifacts expire after **7 days**, or sooner if the run/repository is deleted or
retention policy removes them. GitHub is temporary transport, not your only copy.

1. While signed in, open the run's **Summary → Artifacts** and download
   `chatbit-encrypted-backup-<run-id>-<attempt>`. Extract the downloaded ZIP using
   your file manager into a private directory **outside the repository**.
2. In that directory run:

   ```bash
   sha256sum -c chatbit-backup.tar.enc.sha256
   ```

   It must print `OK`. Save the checksum and run/commit identity independently.
3. Preserve the encrypted file, checksum and this commit's
   `scripts/backup-crypto.mjs` in at least two private locations, including an
   off-site location. Keep the encryption passphrase in a separate password
   manager/recovery location. Keep a copy of the run's verification outcome.
4. Confirm the downloaded file also authenticates/decrypts with your saved key:

   ```bash
   umask 077
   read -r -s -p 'Backup passphrase: ' CHATBIT_BACKUP_PASSPHRASE
   export CHATBIT_BACKUP_PASSPHRASE
   # Use the actual absolute path to the helper from this reviewed commit.
   node '/path/to/Chat-Bit/scripts/backup-crypto.mjs' decrypt \
     chatbit-backup.tar.enc recovered-backup.tar
   unset CHATBIT_BACKUP_PASSPHRASE
   ```

   The helper refuses to overwrite existing output or partial recovery files.
   Do not use `set -x` or paste a passphrase into a command. The recovered tar is
   **plaintext sensitive data**: keep it private and remove it when finished
   checking/recovering. Keep long-term copies encrypted. You need only your
   existing Node runtime for decryption, not PostgreSQL or Docker.

The workflow always removes its disposable container/volume and temporary files
on normal completion/failure. Hosted-runner disposal is the fallback for abrupt
cancellation; file deletion is not a claim of forensic secure erasure. No
unencrypted backup is sent to the artifact service.

## Validation boundary

Local encryption, tamper/wrong-key, overwrite-protection, source-configuration
and workflow-safety tests can run without a database. They are included in
`pnpm test`. YAML/syntax/lint checks do not prove container execution, Supabase
permissions, network/TLS reachability or a real database restore. Those require
the first manual GitHub run; no such run is claimed by this commit.

Local checks on 2026-10-17: 55 tests passed, 10 database-dependent suites skipped,
zero failures; lint, JavaScript syntax, YAML parsing and workflow security
assertions passed. The tests include real file encryption/decryption, wrong-key
and tamper rejection, recovery-file overwrite protection, source configuration
guards and the manual-trigger/encrypted-artifact allowlist. No local PostgreSQL,
Docker, production connection or remote workflow run was used for these checks.

Confirmation regression checks on 2026-10-17 execute only the first workflow
guard in Bash with a synthetic environment containing no secrets. Checked and
unchecked values, missing/malformed values, branch/tag rejection and a renamed
default branch are covered. All four backup tests passed; the full suite had
56 passes, zero failures and 10 database-dependent suites skipped. Lint and
`git diff --check` passed. Tests required execution outside the local sandbox
because it blocked Bash subprocess creation. No backup, migration or deployment
was run. These checks validate the guard, not the reported UI dispatch: the
reason that run received `false` remains unverified.

GitHub documents the boolean-preserving `inputs` context in
[workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs).
Use [a new manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
to supply new confirmation inputs.
