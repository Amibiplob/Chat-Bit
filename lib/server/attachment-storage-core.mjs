import { diagnosticCode } from './auth-diagnostics.mjs';
import { diagnosticStep } from './messaging-diagnostics.mjs';
import { MAX_ATTACHMENT_BYTES } from './attachment-validation.mjs';

const providerCodes = new Map([
  ['NoSuchBucket', 'STORAGE_BUCKET_NOT_FOUND'], ['NoSuchKey', 'STORAGE_OBJECT_NOT_FOUND'],
  ['AccessDenied', 'STORAGE_ACCESS_DENIED'], ['InvalidJWT', 'STORAGE_INVALID_JWT'],
  ['InvalidSignature', 'STORAGE_INVALID_SIGNATURE'], ['EntityTooLarge', 'STORAGE_FILE_SIZE'],
  ['InvalidMimeType', 'STORAGE_MIME_TYPE'], ['DatabaseTimeout', 'STORAGE_504'],
  ['ResourceAlreadyExists', 'STORAGE_CONFLICT'], ['KeyAlreadyExists', 'STORAGE_CONFLICT'],
]);
function providerCause(error) {
  const code = providerCodes.get(error?.code);
  if (code) return { code };
  const status = Number(error?.statusCode ?? error?.status);
  if ([400,401,403,404,413,429,500,502,503,504].includes(status)) return { code: `STORAGE_${status}` };
  return { code: diagnosticCode(error) };
}
// Client injection keeps provider behavior testable without credentials or network.
export function attachmentStorage(client, bucket) {
  const files = client.storage.from(bucket);
  async function privateBucket() {
    const { data, error } = await diagnosticStep("storage-bucket", () => client.storage.getBucket(bucket));
    const cap = Number(data?.file_size_limit);
    if (error || !data || data.public || !Number.isSafeInteger(cap) || cap < 1 || cap > MAX_ATTACHMENT_BYTES) {
      await diagnosticStep('storage-bucket', async () => { throw new Error('Use a private bucket with a maximum file size of 10 MB or less.', { cause: error ? providerCause(error) : { code: !data ? 'STORAGE_BUCKET_METADATA' : data.public ? 'STORAGE_BUCKET_PUBLIC' : 'STORAGE_BUCKET_LIMIT' } }); });
    }
  }
  return {
    async upload(path) {
      await privateBucket();
      const { data, error } = await files.createSignedUploadUrl(path, { upsert: false });
      if (error || !data) throw new Error('Storage could not authorize the upload.', { cause: providerCause(error) });
      return data;
    },
    async read(path) {
      await privateBucket();
      const { data, error } = await files.download(path);
      if (error || !data || data.size > MAX_ATTACHMENT_BYTES) throw new Error('The uploaded object could not be verified.', { cause: providerCause(error) });
      return new Uint8Array(await data.arrayBuffer());
    },
    async download(path, filename) {
      await privateBucket();
      const { data, error } = await files.createSignedUrl(path, 60, { download: filename });
      if (error || !data) throw new Error('Storage could not authorize the download.', { cause: providerCause(error) });
      return data.signedUrl;
    },
    async remove(paths) {
      if (!paths.length) return;
      const { error } = await files.remove(paths);
      if (error) throw new Error('Storage object removal failed.', { cause: providerCause(error) });
    },
  };
}
