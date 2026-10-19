# PostgreSQL security and initialization

Neon is the only hosted database. Application authentication is custom Argon2id
with opaque hashed sessions. Parameterized server queries enforce membership,
authorship, quotas and rate limits; browsers never connect directly to PostgreSQL.

Use the pooled URL at runtime and a direct URL to the same database/owning role
for schema migrations. Production TLS verifies hostname and publicly trusted
certificates. Connection errors expose fixed diagnostics rather than raw SQL,
connection strings or credentials. Pools are lazy, bounded and reused per instance.

`pnpm db:migrate` applies the existing 001–008 files on one transaction/connection,
using an advisory lock and checksum history. Failed migrations roll back DDL and
history together. Reruns skip unchanged applied files and reject missing/modified
history. Never edit an applied migration to change its checksum. Builds/startup
never migrate. Initialize a reviewed empty target only after operator approval.

Migration 008 enables RLS for every private table/history and revokes PUBLIC and
any present historical client-role grants. Absent roles are explicitly tolerated;
no external schema, function or hosted API is required. Its historical comments and
role names remain unchanged solely to preserve checksums. RLS is not forced: the
owning server role must retain access, while untrusted roles cannot bypass ACLs.
Trigger functions have PUBLIC EXECUTE revoked. Do not grant browser/API roles
access to these tables, including roles with BYPASSRLS.

`node scripts/check-database.mjs` explicitly checks both configured endpoints
inside read-only transactions: history checksums, required table ownership, RLS
and grants. It does not initialize the DB or prove live application functionality.

The security integration suite uses a disposable PostgreSQL 17 cluster and
synthetic untrusted/client roles, including BYPASSRLS and PUBLIC probes. It checks
atomic visibility, complete schema/index/function inventory, grant denial, owning
role auth/session/attachment operations, trigger behavior, unrelated schema
preservation and rollback. CI first checks fresh migration without those roles,
then loads tests/fixtures/security.sql and runs the stronger privilege suite.
Never load test fixtures into a live database.

The configuration rejects remote non-Neon hosts. Local loopback databases are
allowed only outside production for isolated verification. Migration and runtime
URLs must select the same branch, database, role and port; the migration URL must
be direct. Public CA trust is used without a custom CA variable. pg negotiates
SCRAM channel binding when offered; remove libpq's channel_binding URL parameter
(the driver cannot enforce that parameter's require semantics). sslmode=require
and sslmode=verify-full are normalized to strict Node TLS, not insecure pg defaults.
