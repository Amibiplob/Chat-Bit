# Isolated database verification — 2026-10-17

Status: locally checked; live PostgreSQL verification is pending GitHub Actions.
The user authorized committing the prepared milestone with the database checks
explicitly marked as pending. No local database installation is needed.

## Environment and database boundary

No test database was used. Local inspection found PostgreSQL 16.15 client
utilities only; no postgres, initdb, pg_ctl, Docker or Podman executable was
available. No PostgreSQL 17 server installation or cached server binary was
found in the inspected standard locations. No system packages were installed
and no service was provisioned. Supabase was not contacted for these checks.
Environment files, certificates and unrelated source changes were not edited.

## Results

- `pnpm test`, with TEST_DATABASE_URL, TEST_SECURITY_DATABASE_URL and
  TEST_AUTH_HTTP removed from the test process: 62 tests, 52 passed, 10 skipped,
  zero failures. All live database suites were skipped.
- Database-free security inventory and migration runner tests passed. They
  check coverage, ordering on one client, one COMMIT and ROLLBACK on hardening
  failure using mocks; they do not establish PostgreSQL execution behavior.
- `pnpm exec tsc --noEmit`: passed when rerun alone. An initial concurrent
  build/typecheck attempt encountered missing generated .next type files.
- `pnpm lint`: passed.
- `pnpm build`: initially failed inside the restricted sandbox with
  `Could not parse output from TypeScript's --showConfig.` A subsequent run
  outside the sandbox passed, including compilation, TypeScript validation,
  page generation and build traces, with no source/configuration changes.
  Node child-process probes inside the sandbox returned empty stdout; the
  synchronous probe reported EPERM. Next's CLI configuration reader attempted
  to parse that empty stdout. Standalone `tsc --showConfig` succeeded.
  This establishes an execution-environment restriction rather than a confirmed
  configuration or dependency mismatch. Keep type validation enabled and run
  builds in an environment that permits compiler subprocesses.
- Installed versions: Node 24.21.0, pnpm 12.3.4, TypeScript 5.9.3 and Next
  16.3.8. Installed Next/TypeScript versions match the manifest ranges.
- `git diff --check`: passed for tracked changes. The new report and existing
  untracked milestone text files were also checked for whitespace errors.

## Unverified requirements

Migrations 001–008 have not been executed by this verification run. Real
transaction atomicity, rollback, migration-history checksums/records, complete
table/function/index inventory, effective table/column/function privileges,
RLS, denied API/PUBLIC/service_role operations and authorized server-role
authentication, messaging, calling and attachment operations remain unverified.

The existing fixture defines anon/authenticated, service_role with BYPASSRLS,
a non-superuser owning role with BYPASSRLS, a PUBLIC-only probe and managed-schema
sentinels. The suite sets broad default grants before applying the migrations.
It does not recreate Supabase event triggers or the hosted Auth/Storage stack.
The prepared suite now asserts PostgreSQL major 17, all migration-history names
and checksums, complete table/function inventory and valid explicitly declared
indexes. It also exercises real registration, login, session rotation/revocation
and attachment reservation, finalization, download and deletion under the
non-superuser owning role. These additions have only been syntax/lint checked;
they have not executed against PostgreSQL locally.

## Run the prepared GitHub Actions workflow

Push the commit yourself, then open **Actions → Verify ChatBit** for that commit.
Alternatively use **Run workflow** once the workflow is on the selected branch.
No push or remote run was performed by the agent.

The workflow provisions a temporary `postgres:17` service and `chatbit_test`
database, checks server major 17 and Chrome availability, and loads the reviewed
fixture. All database tests receive explicit loopback test URLs; no production
credentials or GitHub secrets are required. The full suite applies migrations
001–008 in random test schemas using the migration runner. It checks fresh
installation, rollback, RLS, effective grants, API denial and owner operations.
The service is destroyed with the job. The test log is retained as the
`chatbit-test-results` artifact when the test step produces it.

The job also runs TypeScript, lint, a production dependency audit, Webpack build
and whitespace checks. Inspect the run and any skipped tests before claiming
live database verification. No GitHub Actions result has been observed yet.
Supabase event triggers, managed Auth/Storage and the complete hosted role
hierarchy remain outside this fixture. A green CI run does not authorize or
prove production migration or deployment behavior.

No local software, system services or firewall changes were made. Environment
files, certificates and the unrelated conversation-list.tsx edit are excluded
from the milestone commit. No production migration or deployment was performed.
