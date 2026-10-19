import { createHash } from 'node:crypto';
import { S3Client, GetBucketAclCommand, GetBucketPolicyCommand, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { diagnosticStep } from './messaging-diagnostics.mjs';
import { diagnosticCode } from './auth-diagnostics.mjs';
import { MAX_ATTACHMENT_BYTES } from './attachment-validation.mjs';

export function createNeonClient(config) {
  return new S3Client({ ...config, forcePathStyle: true, maxAttempts: 3,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { connectionTimeout: 5000, requestTimeout: 20000 } });
}
const safeFailures = new WeakSet();
const failure = code => { const error = new Error('Private attachment storage operation failed.', { cause: { code } }); safeFailures.add(error); return error; };
const baseKey = path => path.split('.sealed/')[0];
export const sealedObjectKey = (path, bytes) => `${baseKey(path)}.sealed/${createHash('sha256').update(bytes).digest('hex')}`;

// Inject SDK transport/signers in unit tests; no credentials or live services needed.
export function neonAttachmentStorage(config, client = createNeonClient(config), sign = getSignedUrl, post = createPresignedPost) {
  const Bucket = config.bucket;
  const send = command => client.send(command, { abortSignal: AbortSignal.timeout(20000) });
  async function guarded(operation) {
    try { return await operation(); }
    catch (error) {
      if (safeFailures.has(error)) throw error;
      const status = error?.$metadata?.httpStatusCode;
      const code = diagnosticCode(error);
      throw failure([400,401,403,404,413,429,500,502,503,504].includes(status) ? `STORAGE_${status}` : error?.name === 'TimeoutError' ? 'STORAGE_504' : code === 'UNCLASSIFIED' ? 'STORAGE_PROVIDER' : code);
    }
  }
  const privateBucket = () => diagnosticStep('storage-bucket', () => guarded(inspectPrivateBucket));
  async function inspectPrivateBucket() {
    const acl = await send(new GetBucketAclCommand({ Bucket }));
    // Unknown/incomplete metadata also fails closed. Never create or mutate buckets.
    if (!acl.Owner?.ID || !acl.Grants?.length || acl.Grants.some(grant =>
      grant.Grantee?.Type !== 'CanonicalUser' || grant.Grantee?.ID !== acl.Owner.ID || grant.Permission !== 'FULL_CONTROL')) throw failure('STORAGE_BUCKET_PUBLIC');
    try {
      const result = await send(new GetBucketPolicyCommand({ Bucket }));
      if (result.Policy) {
        const statements = JSON.parse(result.Policy).Statement;
        if (!Array.isArray(statements) || statements.some(statement => statement.Effect === 'Allow')) throw failure('STORAGE_BUCKET_PUBLIC');
      }
    } catch (error) {
      if (error?.name !== 'NoSuchBucketPolicy') throw error;
    }
  }
  async function readObject(Key) {
    const result = await send(new GetObjectCommand({ Bucket, Key }));
    const body = result.Body;
    const size = Number(result.ContentLength);
    if (!body || !Number.isSafeInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) {
      body?.destroy?.(); throw failure('STORAGE_FILE_SIZE');
    }
    const chunks = []; let length = 0;
    try {
      for await (const chunk of body) {
        length += chunk.length;
        if (length > size || length > MAX_ATTACHMENT_BYTES) throw failure('STORAGE_FILE_SIZE');
        chunks.push(chunk);
      }
      if (length !== size) throw failure('STORAGE_FILE_SIZE');
      return new Uint8Array(Buffer.concat(chunks));
    } finally { body.destroy?.(); }
  }
  return {
    privateBucket: () => guarded(privateBucket),
    upload: (path, file) => guarded(async () => {
      await privateBucket();
      if (!Number.isSafeInteger(file?.byteSize) || file.byteSize < 1 || file.byteSize > MAX_ATTACHMENT_BYTES || !file.mimeType) throw failure('STORAGE_FILE_SIZE');
      const signed = await post(client, { Bucket, Key: `${path}.pending`, Expires: 60,
        Fields: { 'Content-Type': file.mimeType },
        Conditions: [['content-length-range', file.byteSize, file.byteSize], ['eq', '$Content-Type', file.mimeType]] });
      return { path, token: '', signedUrl: signed.url, fields: signed.fields };
    }),
    readUpload: path => guarded(async () => { await privateBucket(); return readObject(`${path}.pending`); }),
    // Content addressing makes concurrent/retried completion safe: a signed URL
    // can overwrite staging, but cannot alter the server-owned verified object.
    seal: (path, bytes, mimeType) => guarded(async () => {
      await privateBucket();
      if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) throw failure('STORAGE_FILE_SIZE');
      const Key = sealedObjectKey(path, bytes);
      await send(new PutObjectCommand({ Bucket, Key, Body: bytes, ContentType: mimeType, CacheControl: 'private, no-store' }));
      return Key;
    }),
    read: path => guarded(async () => { await privateBucket(); return readObject(path); }),
    download: (path, filename) => guarded(async () => {
      await privateBucket();
      const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      return sign(client, new GetObjectCommand({ Bucket, Key: path, ResponseContentDisposition: `attachment; filename*=UTF-8''${encoded}`, ResponseCacheControl: 'private, no-store' }), { expiresIn: 60 });
    }),
    remove: paths => cleanup(paths, false),
    prune: paths => cleanup(paths, true),
  };
  function cleanup(paths, keepFinal) { return guarded(async () => {
      if (!paths.length) return;
      await privateBucket();
      for (const path of paths) {
        const base = baseKey(path);
        // Delete exact legacy keys, staging and any sealed siblings left by
        // concurrent completions. Database cleanup waits past signed URL expiry.
        let ContinuationToken;
        const keys = new Set([path, base, `${base}.pending`]);
        do {
          const page = await send(new ListObjectsV2Command({ Bucket, Prefix: `${base}.sealed/`, ContinuationToken, MaxKeys: 1000 }));
          for (const object of page.Contents ?? []) if (object.Key?.startsWith(`${base}.sealed/`)) keys.add(object.Key);
          ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
          if (page.IsTruncated && !ContinuationToken) throw failure('STORAGE_PROVIDER');
        } while (ContinuationToken);
        const all = [...keys].filter(key => !keepFinal || key !== path);
        for (let i = 0; i < all.length; i += 1000) {
          const result = await send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: all.slice(i, i + 1000).map(Key => ({ Key })), Quiet: true } }));
          if (result.Errors?.length) throw failure('STORAGE_PROVIDER');
        }
      }
    });
  }
}
