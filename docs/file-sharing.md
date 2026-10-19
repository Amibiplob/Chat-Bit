# Private Neon file sharing

Neon Object Storage is the only attachment store. Avatars remain private,
normalized PostgreSQL bytea records. Configure the exact branch S3 endpoint,
region, token_id/access key ID and s3_secret_access_key in the server-only AWS_*
variables. The bucket defaults to chatbit-attachments and must stay private.

The official AWS SDK uses SigV4 and path-style addressing according to
[Neon's S3 interface](https://neon.com/docs/storage/s3-compatibility) and
[scoped authentication](https://neon.com/docs/storage/authentication).
No AWS account, runtime management API key, public bucket or provider selector is
needed. The adapter checks owner-only ACLs/policies and fails on unknown/public
metadata. It never changes bucket visibility. Exact-origin CORS must be configured
by the operator; see deployment.md.

Reservation authenticates the user and checks membership, metadata and quotas in
short database transactions. Files are limited to 10 MiB and 100 MiB per uploader.
Pending reservations reserve the maximum file capacity; callers cannot bypass
quota by declaring smaller files. Supported formats are maintained centrally in
lib/attachment-policy.mjs: images, video/audio and supported documents.

A 60-second presigned browser form binds the random staging key, exact byte size
and MIME. XMLHttpRequest retains progress/cancellation/retry. Completion verifies
actual content and length server-side, then writes a content-addressed sealed
object before atomically publishing the message/key. A replayed upload URL cannot
change the available sealed object. Lost completion responses reuse the reservation
and client ID; concurrent completion publishes once.

Every content/download request rechecks session and conversation membership.
Media previews use authenticated no-store routes with safe range handling;
forced downloads use 60-second signed GETs and encoded filenames. Already-issued
signed URLs remain capabilities until expiry. Credentials never reach the browser.

Cleanup removes staging and unused sealed siblings after the retry fence, preserving
available content. Deletion revokes database access immediately and retries object
removal; late upload tokens retain tombstones until expiry. Available staging
cleanup acknowledgements cannot mark a concurrent deletion complete. Temporary
staging/retry siblings add physical overhead beyond logical quotas. Configure
bounded cleanup jobs and monitor capacity. Neon lifecycle rules are not relied on.

Unit tests use mocked SDK transport and real offline signatures; database/HTTP
checks use isolated infrastructure. Live branch privacy metadata, CORS, exact
policy enforcement, private upload/download and deletion still require operator
acceptance. Production storage is never an automated-test target.
