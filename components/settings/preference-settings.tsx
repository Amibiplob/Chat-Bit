"use client";
import { useState } from 'react';
import { useSettings } from './settings-provider';
import type { Preferences,SettingsProfile } from '@/lib/settings-types';
import { messagingRequest } from '@/lib/messaging-client';
import { SettingsSection,actionClass,useSubmission,Feedback } from './settings-form';
export function PreferenceSettings({privacy=false}:{privacy?:boolean}) {
  const {profile,update}=useSettings();
  const [values,setValues]=useState<Partial<Preferences>>({});
  const [permission,setPermission]=useState('Check browser permission using the button below.');const submission=useSubmission();
  const options: {key:keyof Preferences;label:string}[]=privacy?[{key:'showOnline',label:'Show online status to conversation partners'},{key:'showLastSeen',label:'Show last seen to conversation partners'}]:[{key:'notifyMessages',label:'Background message notifications'},{key:'notifyCalls',label:'Background incoming call notifications'}];
  return <SettingsSection title={privacy?'Privacy':'Notifications'} description="Preferences are saved to your account and synchronize on focus or within 30 seconds in visible tabs.">
    <form className="space-y-4" onSubmit={event=>{event.preventDefault();void submission.run(async()=>{
      update(await messagingRequest<SettingsProfile>('/api/settings',{method:'PUT',body:JSON.stringify(values)}));setValues({});submission.setMessage('Preferences saved.');
    });}}><div className="divide-y rounded-xl border">{options.map(({key,label})=><label key={key} className="flex min-h-16 cursor-pointer items-center justify-between gap-4 p-4 text-sm"><span>{label}</span><input type="checkbox" disabled={submission.pending} className="size-5 shrink-0 accent-teal-700" checked={values[key]??profile[key]} onChange={event=>setValues({...values,[key]:event.target.checked})}/></label>)}</div><button className={actionClass} disabled={submission.pending || Object.keys(values).length===0}>Save preferences</button><Feedback {...submission}/></form>
    {privacy?<p className="text-sm text-muted-foreground">Presence is shared only with existing conversation partners. Hiding online or last seen does not hide typing, read receipts or call activity. Read receipts and typing cannot currently be disabled. Blocking is unavailable. Avatars are visible only to you and your conversation partners; your email and bio are private.</p>:<section className="space-y-3 rounded-xl border p-4"><h3 className="font-medium">Browser permission</h3><p role="status" className="text-sm">{permission}</p><button className="min-h-11 rounded-lg border px-4 text-sm" onClick={async()=>{if(!('Notification' in window)){setPermission('Notifications are unavailable in this browser.');return;}try{setPermission(`Permission: ${await Notification.requestPermission()}`);}catch{setPermission('Permission could not be requested. Check browser settings.');}}}>Enable browser notifications</button><p className="text-sm text-muted-foreground">Notifications require permission and an open ChatBit tab. Only background tabs notify; foreground delivery stays in the app. Notification text never includes names or message content. There is no push while the app is closed, notification sound, or mention support. Incoming calls always remain visible inside ChatBit. Some mobile browsers do not support these notifications.</p></section>}
  </SettingsSection>;
}
