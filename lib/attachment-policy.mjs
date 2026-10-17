export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const allowedAttachments = new Map([
  ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'], ['gif', 'image/gif'],
  ['pdf', 'application/pdf'], ['txt', 'text/plain'], ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['xls', 'application/vnd.ms-excel'], ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['ppt', 'application/vnd.ms-powerpoint'], ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['mp3', 'audio/mpeg'], ['wav', 'audio/wav'], ['mp4', 'video/mp4'], ['webm', 'video/webm'],
]);

/** @param {{name:string,type:string}} file */
export function normalizedFileType(file) {
  const name = file.name.trim();
  const extension = name.includes('.') ? name.split('.').at(-1)?.toLowerCase() : '';
  return allowedAttachments.get(extension ?? '') ?? file.type;
}

/** @param {{name:string,type:string,size:number}} file */
export function attachmentFileError(file) {
  if (file.size < 1) return 'Choose a nonempty file.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Files must be 10 MB or smaller.';
  const name = file.name.trim();
  if (!name || name.length > 255 || /[\0\r\n/\\]/.test(name)) return 'Choose a filename of 1–255 characters without slashes or line breaks.';
  const extension = name.includes('.') ? name.split('.').at(-1)?.toLowerCase() : '';
  if (!allowedAttachments.has(extension ?? '')) return 'Unsupported file type. Choose an image, PDF, text, Office, audio or video file from the supported formats.';
  return '';
}
