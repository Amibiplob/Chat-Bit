import { hash, verify, Algorithm, Version } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

const options = { algorithm: Algorithm.Argon2id, version: Version.V0x13, memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 };
/** @param {string} password */
export function hashPassword(password) { return hash(password, options); }

let dummyHash;
/** Always performs password verification, including for unknown email addresses.
 * @param {string | undefined} storedHash @param {string} password
 */
export async function verifyPassword(storedHash, password) {
  if (!storedHash?.startsWith('$argon2id$')) {
    dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
    await verify(await dummyHash, password);
    return false;
  }
  try { return await verify(storedHash, password); } catch { return false; }
}
