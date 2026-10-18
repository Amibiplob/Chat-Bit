import { assetLinks, productionOrigin } from '@/android/config.mjs';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{if(new URL(request.url).origin!==productionOrigin(process.env.CHATBIT_ANDROID_ORIGIN))return new Response(null,{status:404});return Response.json(assetLinks(process.env),{headers:{'Cache-Control':'public, max-age=300'}});}catch{return new Response(null,{status:404});}}
