import { sharedFiles } from '@/lib/server/attachments';
import { messagingResponse } from '@/lib/server/messaging-http';
import { MessagingError } from '@/lib/server/messaging-validation.mjs';
export async function GET(request:Request){return messagingResponse(request,async()=>{const params=new URL(request.url).searchParams;let cursor=null;try{const raw=params.get('cursor');if(raw&&raw.length>256)throw new Error();cursor=raw?JSON.parse(raw):null;}catch{throw new MessagingError('Invalid file cursor.');}return sharedFiles({kind:params.get('kind')??'all',cursor});});}
