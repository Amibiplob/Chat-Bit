"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Expand, FileText, Trash2 } from 'lucide-react';
import type { Attachment } from '@/lib/attachment-types';
import { messagingRequest } from '@/lib/messaging-client';
import { MediaViewer } from './media-viewer';
export function AttachmentView({attachment,own=false,pending=false,onDelete}:{attachment:Attachment;own?:boolean;pending?:boolean;onDelete?:()=>void}) {
 const media=/^(image|video|audio)\//.test(attachment.mimeType), video=attachment.mimeType.startsWith('video/'),image=attachment.mimeType.startsWith('image/');
 const [error,setError]=useState(''),[attempt,setAttempt]=useState(0),[open,setOpen]=useState(false);
 const inline=useRef<HTMLVideoElement>(null);const close=useCallback(()=>setOpen(false),[]);
 const url=media?`/api/attachments/${attachment.id}/content${attempt?`?retry=${attempt}`:''}`:'';
 useEffect(()=>{const element=inline.current;return()=>{element?.pause();element?.removeAttribute('src');element?.load();};},[]);
 async function download(){try{const value=await messagingRequest<{url:string}>(`/api/attachments/${attachment.id}/download?download=1`);window.location.assign(value.url);}catch{setError('Download unavailable. Please try again.');}}
 return <div className="mb-2 overflow-hidden rounded-2xl border border-current/15 bg-muted/20">
 {media&&!url&&!error&&<p role="status" className="p-6 text-center text-xs">Loading preview…</p>}
 {/* Authenticated media endpoints must keep native requests and credentials. */}
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {url&&image&&<button aria-label={`View ${attachment.filename} full screen`} onClick={()=>setOpen(true)} className="block w-full"><img src={url} loading="lazy" alt={attachment.filename} onError={()=>setError('Preview unavailable. Retry or download the file.')} className="max-h-80 w-full object-contain"/></button>}
 {url&&video&&<video ref={inline} src={url} controls playsInline preload="none" onError={()=>setError('Video preview unavailable. Retry or download the file.')} className="max-h-80 w-full"/>}
 {url&&attachment.mimeType.startsWith('audio/')&&<audio src={url} controls preload="none" className="max-w-full p-2"/>}
 <div className="flex items-center gap-2 p-3"><FileText className="size-4 shrink-0"/><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{attachment.filename}</p><p className="text-[10px] opacity-75">{attachment.mimeType} · {(attachment.byteSize/1024/1024).toFixed(2)} MiB</p></div>{url&&(image||video)&&<button aria-label="Open media full screen" className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted" onClick={()=>{inline.current?.pause();setOpen(true);}}><Expand className="size-4"/></button>}<button type="button" disabled={pending} onClick={download} aria-label="Download file" className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted"><Download className="size-4"/></button>{own&&onDelete&&<button type="button" disabled={pending} onClick={onDelete} aria-label="Delete attachment" className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted"><Trash2 className="size-4"/></button>}</div>
 {error&&<div className="px-3 pb-3"><p role="alert" className="text-xs">{error}</p>{media&&<button className="min-h-11 text-xs underline" onClick={()=>{setError('');setAttempt(value=>value+1);}}>Retry preview</button>}</div>}
 {open&&url&&<MediaViewer url={url} name={attachment.filename} video={video} onClose={close}/>}
 </div>;
}
