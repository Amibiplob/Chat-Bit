import { settingsContext } from "@/lib/server/settings";
import { updateAvatar } from "@/lib/server/settings-queries.mjs";
import { MAX_AVATAR_BYTES } from "@/lib/server/settings-validation.mjs";
import { MessagingError } from "@/lib/server/messaging-validation.mjs";
import { messagingResponse } from "@/lib/server/messaging-http";
export async function POST(request:Request) {return messagingResponse(request,async()=> {
  const c=await settingsContext("avatar");
  if(!['image/png','image/jpeg','image/webp'].includes(request.headers.get('content-type')??'')) throw new MessagingError('Choose a PNG, JPEG or WebP image.',415);
  const reader=request.body?.getReader();if(!reader) throw new MessagingError('Choose an image.');
  let size=0;const chunks:Uint8Array[]=[];
  try {while(true) {const {done,value}=await reader.read();if(done) break;size+=value.byteLength;
    if(size>MAX_AVATAR_BYTES) {await reader.cancel();throw new MessagingError('Avatar must be at most 256 KiB.',413);}chunks.push(value);}}
  finally {reader.releaseLock();}
  return updateAvatar(c.pool,c.userId,Buffer.concat(chunks));
});}
export async function DELETE(request:Request) {return messagingResponse(request,async()=> {const c=await settingsContext("avatar");return updateAvatar(c.pool,c.userId,null);});}
