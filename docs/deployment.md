# Fresh Neon deployment

1. Use an empty reviewed Neon PostgreSQL database. Copy its pooled and direct URLs
   into DATABASE_URL and DATABASE_MIGRATION_URL respectively, with DATABASE_SSL=verify.
   Use the same owning role/branch/database for both. Fill the remaining values in
   [environment.md](environment.md) locally and in Vercel. Never expose secrets.
2. Only after approving the selected live target yourself, run `pnpm db:migrate`
   once, then `node scripts/check-database.mjs`. Builds and startup do not migrate.
   The runner applies 001–008 atomically with checksum history and rerun protection.
   No old data is needed or imported. The unchanged hardening migration already
   tolerates absent historical client roles on plain PostgreSQL.
3. Use the existing private production bucket chatbit-attachments. Obtain its exact
   branch endpoint and S3 region from Neon; aws-ap-southeast-1 in the Console maps
   to the returned S3 region (normally ap-southeast-1), not an invented endpoint.
   Use a branch-scoped storage:write credential (includes reads). Keep visibility
   private. The app never provisions buckets or changes visibility.
4. Configure bucket CORS manually for exact local/deployed origins, POST/GET/HEAD,
   and Content-Type. Neon's documented PutBucketCors supports this. Verify direct
   browser signed-form upload with exact size/MIME and expiry on an isolated branch
   before release; CORS does not grant private reads. No management API key is
   required at runtime. See [file sharing](file-sharing.md).
5. Configure existing TURN infrastructure and authenticated cleanup jobs. Suggested
   cadence: calls every minute, attachments every five minutes, maintenance hourly.
   Jobs do bounded work; monitor retries/backlog and increase capacity/frequency
   when needed. Vercel Hobby daily cron cannot provide minute/five-minute cadence;
   use a scheduler you already control. Do not assume a free unlimited TURN relay.
6. Run `pnpm config:check`, push commits yourself and redeploy on Vercel using
   Node.js 24, pnpm 12.3.4, frozen-lockfile install and `pnpm build` (Webpack).
7. Manually test two fresh accounts: signup/login/logout, contacts, message delivery,
   replies/edits/deletes/read receipts, private image/video/document uploads and
   downloads, unauthorized access, avatars/settings/themes, cleanup, mobile layouts,
   browser PWA installation and calls across real networks/devices.

No production database, bucket, credential, scheduler, deployment or push was
changed during local preparation. A passing build/mock suite does not prove live
Neon access, TLS, storage privacy metadata/CORS or TURN. The owner intentionally
chose no backup setup and an empty database. These are explicit deployment choices,
not unfinished old-data migration requirements.
