"use client";
import { useRef,useState } from 'react';
export const fieldClass='mt-2 min-h-12 w-full rounded-xl border bg-card px-4 py-3 text-sm focus:border-primary';
export const actionClass='min-h-12 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50';
export function SettingsSection({title,description,children}:{title:string;description:string;children:React.ReactNode}) {
  return <div className="mx-auto w-full max-w-4xl"><header className="border-b px-5 py-7 md:px-8"><p className="cb-kicker mb-3">Make it yours</p><h2 className="text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></header><div className="space-y-6 px-5 py-6 md:px-8">{children}</div></div>;
}
export function useSubmission() {
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');const busy=useRef(false);
  async function run(operation:()=>Promise<void>) {if(busy.current) return;busy.current=true;setPending(true);setError('');setMessage('');
    try {await operation();}catch(error){setError(error instanceof Error?error.message:'Please try again.');}finally{busy.current=false;setPending(false);}}
  return {pending,error,message,setMessage,run};
}
export function Feedback({error,message}:{error:string;message:string}) {return <><p role="alert" className="text-sm text-destructive">{error}</p><p role="status" className="text-sm text-muted-foreground">{message}</p></>;}
