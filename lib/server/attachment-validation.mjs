import { z } from 'zod';
import { MessagingError, idSchema, validated } from './messaging-validation.mjs';

import { MAX_ATTACHMENT_BYTES, allowedAttachments } from '../attachment-policy.mjs';
export { MAX_ATTACHMENT_BYTES, allowedAttachments } from '../attachment-policy.mjs';
export const USER_ATTACHMENT_QUOTA = 100 * 1024 * 1024;


const filenameSchema = z.string().trim().min(1).max(255).refine((name) => !/[\0\r\n/\\]/.test(name));
export const reserveAttachmentSchema = z.object({
  filename: filenameSchema,
  mimeType: z.string().trim().toLowerCase().max(120),
  byteSize: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
}).strict();
export const finalizeAttachmentSchema = z.object({
  clientId: idSchema,
  caption: z.string().trim().max(10000).default(''),
}).strict();

export function validateAttachmentMetadata(input) {
  const value = validated(reserveAttachmentSchema, input);
  const extension = value.filename.includes('.') ? value.filename.split('.').at(-1).toLowerCase() : '';
  if (!allowedAttachments.has(extension) || allowedAttachments.get(extension) !== value.mimeType) {
    throw new MessagingError('The file extension and type do not match or are unsupported.');
  }
  return { ...value, extension };
}

const starts = (bytes, signature, offset = 0) => signature.every((value, index) => bytes[offset + index] === value);
const ascii = (bytes, offset, length) => new TextDecoder().decode(bytes.slice(offset, offset + length));

export function validateAttachmentContent(bytes, expectedSize, mimeType, extension) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== expectedSize || bytes.byteLength < 1 || bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new MessagingError('The uploaded file size does not match the reservation.');
  }
  let valid = false;
  if (mimeType === 'image/jpeg') valid = starts(bytes, [0xff, 0xd8, 0xff]);
  else if (mimeType === 'image/png') valid = starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  else if (mimeType === 'image/gif') valid = ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6));
  else if (mimeType === 'image/webp') valid = ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
  else if (mimeType === 'application/pdf') valid = ascii(bytes, 0, 5) === '%PDF-';
  else if (mimeType === 'text/plain') {
    valid = !bytes.includes(0) && ascii(bytes, 0, 2) !== 'MZ' && ascii(bytes, 0, 2) !== '#!';
    if (valid) try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { valid = false; }
  } else if (['doc', 'xls', 'ppt'].includes(extension)) valid = starts(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  else if (['docx', 'xlsx', 'pptx'].includes(extension)) {
    // Inspect central-directory entry names without decompressing untrusted ZIPs.
    const names = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset + 46 <= bytes.length; offset++) {
      if (!starts(bytes, [0x50, 0x4b, 0x01, 0x02], offset)) continue;
      const length = view.getUint16(offset + 28, true);
      if (offset + 46 + length > bytes.length) break;
      names.push(ascii(bytes, offset + 46, length));
      offset += 45 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    }
    const main = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' }[extension];
    valid = starts(bytes, [0x50, 0x4b, 0x03, 0x04]) && names.includes('[Content_Types].xml') && names.includes(main)
      && !names.some((name) => /vbaProject\.bin$|(^|\/)\.\.(\/|$)|^[/\\]/i.test(name));
  }
  else if (mimeType === 'audio/mpeg') valid = ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  else if (mimeType === 'audio/wav') valid = ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE';
  else if (mimeType === 'video/mp4') valid = ascii(bytes, 4, 4) === 'ftyp';
  else if (mimeType === 'video/webm') valid = starts(bytes, [0x1a, 0x45, 0xdf, 0xa3]) && ascii(bytes, 0, 4096).includes('webm');
  if (!valid) throw new MessagingError('The uploaded file contents do not match its declared type.');
}
