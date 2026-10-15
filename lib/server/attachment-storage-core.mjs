import { MAX_ATTACHMENT_BYTES } from './attachment-validation.mjs';

// Client injection keeps provider behavior testable without credentials or network.
export function attachmentStorage(client, bucket) {
  const files = client.storage.from(bucket);
  async function privateBucket() {
    const { data, error } = await client.storage.getBucket(bucket);
    if (error || !data || data.public || !Number(data.file_size_limit) || Number(data.file_size_limit) > MAX_ATTACHMENT_BYTES) {
      throw new Error('Use a private bucket with a maximum file size of 10 MB or less.');
    }
  }
  return {
    async upload(path) {
      await privateBucket();
      const { data, error } = await files.createSignedUploadUrl(path, { upsert: false });
      if (error || !data) throw new Error('Storage could not authorize the upload.');
      return data;
    },
    async read(path) {
      await privateBucket();
      const { data, error } = await files.download(path);
      if (error || !data || data.size > MAX_ATTACHMENT_BYTES) throw new Error('The uploaded object could not be verified.');
      return new Uint8Array(await data.arrayBuffer());
    },
    async download(path, filename) {
      await privateBucket();
      const { data, error } = await files.createSignedUrl(path, 60, { download: filename });
      if (error || !data) throw new Error('Storage could not authorize the download.');
      return data.signedUrl;
    },
    async remove(paths) {
      if (!paths.length) return;
      const { error } = await files.remove(paths);
      if (error) throw new Error('Storage object removal failed.');
    },
  };
}
