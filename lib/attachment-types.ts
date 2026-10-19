export type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  available: boolean;
};

export type AttachmentReservation = {
  attachmentId: string;
  path: string;
  token: string;
  signedUrl: string;
  fields?: Record<string, string>;
};
