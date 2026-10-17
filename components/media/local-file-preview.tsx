"use client";
import { useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';
export function LocalFilePreview({file}:{file:File}) {
 const image=useRef<HTMLImageElement>(null),video=useRef<HTMLVideoElement>(null);
 const photo=['image/jpeg','image/png','image/webp','image/gif'].includes(file.type);
 const movie=['video/mp4','video/webm'].includes(file.type);
 useEffect(()=>{const element=image.current??video.current;if(!element)return;const url=URL.createObjectURL(file);element.src=url;return()=>{if(element instanceof HTMLVideoElement)element.pause();element.removeAttribute('src');if(element instanceof HTMLVideoElement)element.load();URL.revokeObjectURL(url);};},[file]);
 // Blob previews are bounded by the picker policy and never render SVG/HTML.
 // eslint-disable-next-line @next/next/no-img-element
 if(photo)return <img ref={image} alt={`Selected: ${file.name}`} className="size-16 rounded-xl object-cover"/>;
 if(movie)return <video ref={video} muted playsInline preload="metadata" aria-label={`Selected: ${file.name}`} className="size-16 rounded-xl object-cover"/>;
 return <FileText className="size-10 shrink-0 text-primary"/>;
}
