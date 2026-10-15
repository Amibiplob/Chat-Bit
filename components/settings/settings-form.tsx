"use client";
import { useRef,useState } from 'react';
export const fieldClass='mt-1 min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm';
export const actionClass='min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
export function SettingsSection({title,description,children}:{title:string;description:string;children:React.ReactNode}) {
  return <div className="mx-auto w-full max-w-4xl"><header className="border-b px-5 py-6 md:px-8"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></header><div className="space-y-6 px-5 py-6 md:px-8">{children}</div></div>;
}
export function useSubmission() {
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');const busy=useRef(false);
  async function run(operation:()=>Promise<void>) {if(busy.current) return;busy.current=true;setPending(true);setError('');setMessage('');
    try {await operation();}catch(error){setError(error instanceof Error?error.message:'Please try again.');}finally{busy.current=false;setPending(false);}}
  return {pending,error,message,setMessage,run};
}
export function Feedback({error,message}:{error:string;message:string}) {return <><p role="alert" className="text-sm text-destructive">{error}</p><p role="status" className="text-sm text-muted-foreground">{message}</p></>;}
