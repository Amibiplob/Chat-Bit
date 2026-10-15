"use client";
import Image from "next/image";
import { useState } from 'react';
export function Avatar({userId,name,version=0,className='size-10'}:{userId:string;name:string;version?:number;className?:string}) {
  const [failed,setFailed]=useState<string|null>(null);
  const src=`/api/avatars/${userId}?v=${version}`;
  return <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200 ${className}`}>
    <span aria-hidden="true">{name.split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase()}</span>
    {version>0 && failed!==src && <Image src={src} alt="" width={80} height={80} unoptimized loading="lazy" onError={()=>setFailed(src)} className="absolute inset-0 h-full w-full object-cover"/>}
  </span>;
}
