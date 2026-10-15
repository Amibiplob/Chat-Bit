import sharp from 'sharp';
import { avatarMime } from './settings-validation.mjs';
import { MessagingError } from './messaging-validation.mjs';
// Decode bounded raster input and re-encode a small still image. This removes
// EXIF/GPS metadata, appended payloads and animation before persistence.
export async function normalizeAvatar(bytes) {
  avatarMime(bytes);
  try {
    const result=await sharp(bytes,{limitInputPixels:16000000,animated:false,failOn:'warning'})
      .rotate().resize(256,256,{fit:'cover',withoutEnlargement:true}).png().toBuffer();
    avatarMime(result);return result;
  } catch {throw new MessagingError('This image could not be decoded. Choose a valid image up to 16 megapixels.');}
}
