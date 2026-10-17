"use client";
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function MediaViewer({url,name,video,onClose}:{url:string;name:string;video:boolean;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current,previous=document.activeElement as HTMLElement|null;dialog?.showModal();dialog?.focus();const marker=crypto.randomUUID();history.pushState({...history.state,chatbitViewer:marker},'');const back=()=>onClose();window.addEventListener('popstate',back);return()=>{window.removeEventListener('popstate',back);dialog?.querySelector('video')?.pause();dialog?.close();previous?.focus();if(history.state?.chatbitViewer===marker)history.back();};},[onClose]);
 return <dialog ref={ref} tabIndex={-1} onCancel={event=>{event.preventDefault();onClose();}} aria-label={name} className="fixed inset-0 m-auto h-[100dvh] max-h-none w-screen max-w-none bg-background p-4 text-foreground backdrop:bg-black/80"><div className="flex h-full flex-col"><header className="mb-3 flex items-center justify-between gap-4"><p className="truncate text-sm font-medium">{name}</p><button onClick={onClose} aria-label="Close media viewer" className="flex size-12 shrink-0 items-center justify-center rounded-full border"><X/></button></header><div className="flex min-h-0 flex-1 items-center justify-center">{video?<video src={url} controls playsInline autoPlay className="max-h-full max-w-full"/>:
 // eslint-disable-next-line @next/next/no-img-element
 <img src={url} alt={name} className="max-h-full max-w-full object-contain"/>}</div></div></dialog>;
}
