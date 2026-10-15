"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSettings } from './settings-provider';
import { Avatar } from '@/components/profile/avatar';
import { messagingRequest } from '@/lib/messaging-client';
import type { SettingsProfile } from '@/lib/settings-types';
import { SettingsSection,fieldClass,actionClass,useSubmission,Feedback } from './settings-form';
export function ProfileSettings() {
  const {profile,update}=useSettings(),router=useRouter();
  const [displayName,setName]=useState<string|null>(null),[bio,setBio]=useState<string|null>(null);
  const submission=useSubmission(),avatar=useSubmission();
  return <SettingsSection title="Profile" description="Your name and avatar are visible to conversation partners. Your email stays private.">
    <div className="flex items-center gap-4"><Avatar userId={profile.id} name={profile.displayName} version={profile.avatarVersion} className="size-20"/><div className="min-w-0 space-y-2">
      <label className="block text-sm font-medium" htmlFor="avatar">Change avatar</label><input id="avatar" type="file" accept="image/png,image/jpeg,image/webp" disabled={avatar.pending} className="max-w-full text-sm" onChange={event=> {
        const file=event.target.files?.[0];event.target.value='';if(!file) return;
        void avatar.run(async()=> {if(file.size>262144) throw new Error('Choose an image up to 256 KiB.');
          update(await messagingRequest<SettingsProfile>('/api/settings/avatar',{method:'POST',headers:{'Content-Type':file.type},body:file}));router.refresh();avatar.setMessage('Avatar updated.');});
      }}/><p className="text-xs text-muted-foreground">PNG, JPEG or WebP, up to 256 KiB. Use a small square image.</p>
      <button className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50" disabled={avatar.pending || profile.avatarVersion===0} onClick={()=>void avatar.run(async()=>{update(await messagingRequest<SettingsProfile>('/api/settings/avatar',{method:'DELETE'}));router.refresh();avatar.setMessage('Avatar removed.');})}>Remove avatar</button>
    </div></div><Feedback {...avatar}/>
    <form className="space-y-4" onSubmit={event=>{event.preventDefault();void submission.run(async()=>{update(await messagingRequest<SettingsProfile>('/api/settings',{method:'PATCH',body:JSON.stringify({displayName:displayName??profile.displayName,bio:bio??profile.bio})}));setName(null);setBio(null);router.refresh();submission.setMessage('Profile saved.');});}}>
      <label className="block text-sm font-medium" htmlFor="display-name">Display name<input id="display-name" autoComplete="name" className={fieldClass} value={displayName??profile.displayName} disabled={submission.pending} onChange={e=>setName(e.target.value)} required maxLength={80}/></label>
      <label className="block text-sm font-medium" htmlFor="bio">About you<textarea id="bio" className={fieldClass} value={bio??profile.bio} disabled={submission.pending} onChange={e=>setBio(e.target.value)} maxLength={160} rows={3}/></label>
      <p className="text-xs text-muted-foreground">Your bio is currently visible only here. Email changes and usernames are unavailable.</p>
      <button disabled={submission.pending} className={actionClass}>{submission.pending?'Saving…':'Save profile'}</button><Feedback {...submission}/>
    </form>
  </SettingsSection>;
}
