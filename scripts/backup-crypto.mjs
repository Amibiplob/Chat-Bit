import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as derive } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, open, rename, rm, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const magic = Buffer.from('CHATBIT_BACKUP_V1\n');
const headerSize = magic.length + 32 + 12;
const tagSize = 16;
const scrypt = promisify(derive);

async function keyFor(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length < 32) throw new Error('Backup passphrase must have at least 32 characters');
  return scrypt(passphrase, salt, 32, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}

export async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// V1: magic || random salt(32) || nonce(12) || AES-256-GCM ciphertext || tag(16).
// The whole header is authenticated. No passphrase is placed in command arguments.
export async function encryptBackup(input, output, passphrase) {
  const salt = randomBytes(32);
  const header = Buffer.concat([magic, salt, randomBytes(12)]);
  const key = await keyFor(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, header.subarray(-12));
  cipher.setAAD(header);
  let created = false;
  try {
    await writeFile(output, header, { flag: 'wx', mode: 0o600 });
    created = true;
    await pipeline(createReadStream(input), cipher, createWriteStream(output, { flags: 'a' }));
    await appendFile(output, cipher.getAuthTag(), { flush: true });
  } catch (error) {
    if (created) await rm(output, { force: true });
    throw error;
  } finally { key.fill(0); }
}

export async function decryptBackup(input, output, passphrase) {
  const source = await open(input, 'r');
  const partial = `${output}.partial`;
  let destination = false;
  let temporary = false;
  let key;
  let header;
  let tag;
  let size;
  try {
    size = (await source.stat()).size;
    if (size <= headerSize + tagSize) throw new Error('Invalid backup envelope');
    header = Buffer.alloc(headerSize);
    tag = Buffer.alloc(tagSize);
    await source.read(header, 0, headerSize, 0);
    await source.read(tag, 0, tagSize, size - tagSize);
    if (!header.subarray(0, magic.length).equals(magic)) throw new Error('Unsupported backup envelope');
  } finally { await source.close(); }
  try {
    key = await keyFor(passphrase, header.subarray(magic.length, magic.length + 32));
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(-12));
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    // Reserve the final filename, too: never overwrite an existing recovery file.
    await writeFile(output, '', { flag: 'wx', mode: 0o600 });
    destination = true;
    await writeFile(partial, '', { flag: 'wx', mode: 0o600 });
    temporary = true;
    await pipeline(createReadStream(input, { start: headerSize, end: size - tagSize - 1 }), decipher,
      createWriteStream(partial, { flags: 'w' }));
    await rename(partial, output);
  } catch (error) {
    if (destination) {
      if (temporary) await rm(partial, { force: true });
      await rm(output, { force: true });
    }
    throw error;
  } finally { key?.fill(0); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 5 || process.argv[2] !== 'decrypt') throw new Error('Invalid arguments');
    await decryptBackup(process.argv[3], process.argv[4], process.env.CHATBIT_BACKUP_PASSPHRASE);
    console.log('Backup authenticated and decrypted. Keep the recovered archive private.');
  } catch {
    console.error('Decryption failed. Check the file, passphrase and output path; existing files are not overwritten.');
    process.exitCode = 1;
  }
}
