import { z } from 'zod';
import { MessagingError } from './messaging-validation.mjs';
export { profileSchema, passwordSchema } from '../form-validation.mjs';
export const preferencesSchema=z.object({notifyMessages:z.boolean(),notifyCalls:z.boolean(),showOnline:z.boolean(),showLastSeen:z.boolean()}).partial().strict()
  .refine(value=>Object.keys(value).length>0,{message:'Choose a preference to update.'});
export const reauthSchema=z.object({currentPassword:z.string().min(1).max(128)}).strict();
export const MAX_AVATAR_BYTES=262144;
export function avatarMime(bytes) {
  if(bytes.length<24 || bytes.length>MAX_AVATAR_BYTES) throw new MessagingError('Choose a PNG, JPEG or WebP image up to 256 KiB.');
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  if(bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP') return 'image/webp';
  throw new MessagingError('Choose a PNG, JPEG or WebP image. SVG and other formats are unavailable.');
}
