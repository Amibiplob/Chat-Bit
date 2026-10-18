"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Paperclip, Send, Smile, X } from 'lucide-react';
import type { Message } from '@/lib/messaging-types';
import { attachmentFileError } from '@/lib/attachment-policy.mjs';
import { MAX_MESSAGE_LENGTH } from '@/lib/form-validation.mjs';
import { LocalFilePreview } from '@/components/media/local-file-preview';
interface Props {onSend:(content:string)=>Promise<boolean>;pending:boolean;replyingTo:Message|null;editingMessage:Message|null;onCancel:()=>void;onTyping:(active:boolean)=>void;onSendAttachment:(file:File,caption:string,onProgress:(value:number)=>void,signal:AbortSignal)=>Promise<boolean>}
const emojis=['😀','😂','😍','👍','❤️','🔥','🎉','👋','😊','😎','🙏','👏'];
export function MessageComposer({onSend,pending,replyingTo,editingMessage,onCancel,onTyping,onSendAttachment}:Props){
 const [value,setValue]=useState(editingMessage?.content??''),[files,setFiles]=useState<File[]>([]),[progress,setProgress]=useState(0),[activeFile,setActiveFile]=useState<File|null>(null),[fileError,setFileError]=useState(''),[emojiOpen,setEmojiOpen]=useState(false),[pickerOpen,setPickerOpen]=useState(false),[uploading,setUploading]=useState(false);
 const upload=useRef<AbortController|null>(null),textarea=useRef<HTMLTextAreaElement>(null),input=useRef<HTMLInputElement>(null),emojiButton=useRef<HTMLButtonElement>(null),attachButton=useRef<HTMLButtonElement>(null),sending=useRef(false);
 const busy=pending||uploading;
 useEffect(()=>()=>upload.current?.abort(),[]);
 useLayoutEffect(()=>{const element=textarea.current;if(element){element.style.height='auto';element.style.height=`${Math.min(element.scrollHeight,128)}px`;}},[value]);
 useEffect(()=>{if(editingMessage||replyingTo)textarea.current?.focus();},[editingMessage,replyingTo]);
 async function submit(){
  const content=value.trim();if(sending.current||busy)return;
  if(content.length>MAX_MESSAGE_LENGTH){setFileError('Messages must be 10,000 characters or fewer.');return;}
  if(!content&&!files.length)return;
  if(files.length&&replyingTo){setFileError('Cancel the reply before sending files.');return;}
  sending.current=true;setFileError('');
  try{
   if(files.length){const controller=new AbortController();upload.current=controller;setUploading(true);let caption=content;
    for(const file of files){controller.signal.throwIfAborted();setActiveFile(file);setProgress(0);const saved=await onSendAttachment(file,caption,setProgress,controller.signal);if(!saved)throw new Error('File was not confirmed. Try sending again.');setFiles(current=>current.filter(item=>item!==file));caption='';setValue('');}
   }else if(!await onSend(content))return;
   setValue('');setEmojiOpen(false);onTyping(false);
  }catch(error){setFileError((error as Error).name==='AbortError'?'Upload cancelled. Unsent files are kept.':error instanceof Error?error.message:'Upload failed. Unsent files are kept; send again to retry.');}
  finally{sending.current=false;upload.current=null;setUploading(false);setActiveFile(null);setProgress(0);}
 }
 function choose(accept:string,camera=false){if(!input.current)return;input.current.accept=accept;input.current.multiple=!camera;if(camera)input.current.setAttribute('capture','environment');else input.current.removeAttribute('capture');input.current.click();setPickerOpen(false);}
 return <div className="shrink-0 border-t bg-background/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] md:p-4"><div className="mx-auto max-w-3xl">
 {(replyingTo||editingMessage)&&<div className="mb-3 flex items-center justify-between gap-3 rounded-xl border-l-4 border-primary bg-muted p-3"><div className="min-w-0"><p className="text-xs font-semibold text-primary">{editingMessage?'Editing message':`Replying to ${replyingTo?.senderName}`}</p><p className="truncate text-xs text-muted-foreground">{(editingMessage??replyingTo)?.content}</p></div><button aria-label="Cancel" disabled={busy} onClick={()=>{setValue('');setFiles([]);onCancel();onTyping(false);}} className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-background"><X className="size-4"/></button></div>}
 {files.length>0&&<div className="mb-3 max-h-52 space-y-2 overflow-y-auto">{files.map((file,index)=><div key={`${file.name}:${file.lastModified}:${index}`} className="flex items-center gap-3 rounded-2xl border bg-muted/40 p-3"><LocalFilePreview file={file}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size/1024/1024).toFixed(2)} MiB · {activeFile===file?(progress===100?'Verifying…':`${progress}%`):'Ready'}</p>{activeFile===file&&<progress aria-label={`Uploading ${file.name}`} max={100} value={progress} className="mt-2 h-2 w-full accent-teal-600"/>}</div><button aria-label={`Remove ${file.name}`} disabled={busy} onClick={()=>setFiles(current=>current.filter(item=>item!==file))} className="flex size-11 shrink-0 items-center justify-center rounded-xl border"><X className="size-4"/></button></div>)}<p className="text-xs text-muted-foreground">Each file sends as a separate message. Caption goes with the first file.</p></div>}
 {uploading&&<button aria-label="Cancel upload" onClick={()=>upload.current?.abort()} className="mb-2 min-h-11 rounded-xl border px-4 text-sm">Cancel upload</button>}
 {fileError&&<p role="alert" className="mb-2 text-sm text-destructive">{fileError}</p>}
 <div className="relative">
 {pickerOpen&&<div role="group" aria-label="Attachment sources" onKeyDown={event=>{if(event.key==='Escape'){setPickerOpen(false);attachButton.current?.focus();}}} className="absolute bottom-full mb-2 grid w-60 gap-1 rounded-2xl border bg-background p-2 shadow-xl">{[['Photos & videos','image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm'],['Documents','.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx'],['All supported files','.jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.wav,.mp4,.webm']].map(([label,accept])=><button key={label} onClick={()=>choose(accept)} className="min-h-12 rounded-xl px-3 text-left text-sm hover:bg-muted">{label}</button>)}<button onClick={()=>choose('image/jpeg,image/png,image/webp',true)} className="min-h-11 rounded-xl px-3 text-left text-sm hover:bg-muted">Take photo</button></div>}
 {emojiOpen&&<div id="chatbit-emojis" role="group" aria-label="Choose an emoji" onKeyDown={event=>{if(event.key==='Escape'){setEmojiOpen(false);emojiButton.current?.focus();}}} className="absolute bottom-full mb-2 grid grid-cols-6 rounded-2xl border bg-background p-2 shadow-xl">{emojis.map(emoji=><button key={emoji} disabled={busy} onClick={()=>{if(value.length+emoji.length>MAX_MESSAGE_LENGTH){setFileError('Messages must be 10,000 characters or fewer.');return;}setValue(current=>current+emoji);onTyping(true);textarea.current?.focus();}} className="flex size-11 items-center justify-center rounded-xl text-xl hover:bg-muted">{emoji}</button>)}</div>}
 <div className="flex items-end gap-1 rounded-3xl border bg-background p-1.5 shadow-sm">
 <button ref={attachButton} aria-label="Add attachment" aria-expanded={pickerOpen} disabled={busy||Boolean(editingMessage)||Boolean(replyingTo)} onClick={()=>{setPickerOpen(current=>!current);setEmojiOpen(false);}} className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground hover:bg-muted"><Paperclip className="size-5"/></button>
 <input ref={input} type="file" multiple className="hidden" aria-label="Choose files to send" onChange={event=>{const selected=Array.from(event.target.files??[]);event.target.value='';if(files.length+selected.length>4){setFileError('Choose up to four files at a time.');return;}const errors=selected.map(attachmentFileError).filter(Boolean);if(errors.length){setFileError(errors.join(' '));return;}setFileError('');setFiles(current=>[...current,...selected]);}}/>
 <button ref={emojiButton} aria-label="Add emoji" aria-expanded={emojiOpen} aria-controls="chatbit-emojis" disabled={busy} onClick={()=>{setEmojiOpen(current=>!current);setPickerOpen(false);}} className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground hover:bg-muted"><Smile className="size-5"/></button>
 <textarea ref={textarea} aria-label="Message" maxLength={MAX_MESSAGE_LENGTH} disabled={busy} value={value} onChange={event=>{setValue(event.target.value);onTyping(Boolean(event.target.value.trim()));}} onBlur={()=>onTyping(false)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void submit();}}} rows={1} placeholder={editingMessage?'Edit your message…':'Write a message…'} className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-sm outline-none"/>
 <button aria-label={busy?'Saving message':editingMessage?'Save message':'Send message'} disabled={busy||(!value.trim()&&!files.length)} onClick={()=>void submit()} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"><Send className="size-4"/></button>
 </div></div><p className="mt-2 text-center text-[10px] text-muted-foreground">10 MiB per file · 100 MiB account quota · Messages require a connection</p>
 </div></div>;
}
