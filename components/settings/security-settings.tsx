"use client";
import { useRouter } from 'next/navigation';
import { useEffect,useState } from 'react';
import { messagingRequest } from '@/lib/messaging-client';
import { SettingsSection,fieldClass,actionClass,useSubmission,Feedback } from './settings-form';
import { formErrors,passwordSchema,PASSWORD_MIN,PASSWORD_MAX } from '@/lib/form-validation.mjs';
import { FieldError } from '@/components/ui/field-error';
type Session={createdAt:string;expiresAt:string;current:boolean};
export function SecuritySettings() {
  const router=useRouter();
  const password=useSubmission(),devices=useSubmission();const [sessions,setSessions]=useState<Session[]>([]),[loadError,setLoadError]=useState('');
  const [loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const field=(name:string)=>({id:name,'aria-invalid':Boolean(errors[name]),'aria-describedby':errors[name]?`${name}-error`:undefined});
  useEffect(()=>{const abort=new AbortController();messagingRequest<Session[]>('/api/settings/sessions',{signal:abort.signal}).then(rows=>{if(!abort.signal.aborted){setSessions(rows);setLoadError('');}}).catch(error=>{if(!abort.signal.aborted) setLoadError(error.message);}).finally(()=>{if(!abort.signal.aborted) setLoading(false);});return ()=>abort.abort();},[retry]);
  return <SettingsSection title="Security" description="Use your current password to authorize sensitive account changes.">
    <form className="space-y-4" aria-busy={password.pending} noValidate onSubmit={event=>{event.preventDefault();const form=event.currentTarget,data=new FormData(form);const invalid=formErrors(passwordSchema,Object.fromEntries(data));setErrors(invalid);if(Object.keys(invalid).length){(form.elements.namedItem(Object.keys(invalid)[0]) as HTMLElement|null)?.focus();return;}void password.run(async()=> {
      await messagingRequest('/api/settings/password',{method:'POST',body:JSON.stringify(Object.fromEntries(data))});form.reset();router.replace('/login');router.refresh();
    });}}><h3 className="font-medium">Change password</h3><p className="text-sm text-muted-foreground">Use 8–128 characters. Changing your password signs out every session, including this browser.</p>
      {Object.keys(errors).length>0 && <p role="alert" className="text-sm text-destructive">Please correct the highlighted password fields.</p>}
      <label className="block text-sm">Current password<input {...field('currentPassword')} name="currentPassword" type="password" autoComplete="current-password" className={fieldClass} disabled={password.pending} required maxLength={PASSWORD_MAX}/></label><FieldError id="currentPassword" error={errors.currentPassword}/>
      <label className="block text-sm">New password<input {...field('newPassword')} name="newPassword" type="password" autoComplete="new-password" className={fieldClass} disabled={password.pending} required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}/></label><FieldError id="newPassword" error={errors.newPassword}/>
      <label className="block text-sm">Confirm new password<input {...field('confirmPassword')} name="confirmPassword" type="password" autoComplete="new-password" className={fieldClass} disabled={password.pending} required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}/></label><FieldError id="confirmPassword" error={errors.confirmPassword}/>
      <button className={actionClass} disabled={password.pending}>{password.pending?'Changing…':'Change password and sign out'}</button><Feedback {...password}/>
    </form>
    <section aria-busy={loading}><h3 className="font-medium">Active sessions (latest 50)</h3>{loading && <p role="status" className="text-sm text-muted-foreground">Loading sessions…</p>}<p role="alert" className="text-sm text-destructive">{loadError}</p>{loadError && <button disabled={loading} onClick={()=>{setLoading(true);setRetry(value=>value+1);}} className="mt-2 min-h-11 rounded-lg border px-4 text-sm">Retry sessions</button>}<ul className="mt-3 divide-y rounded-xl border">{sessions.map((s,i)=><li key={i} className="p-3 text-sm">{s.current?'Current browser':'Other session'} · Expires <time dateTime={s.expiresAt}>{new Date(s.expiresAt).toISOString().slice(0,10)}</time></li>)}</ul></section>
    <form className="space-y-3" onSubmit={event=>{event.preventDefault();const form=event.currentTarget,currentPassword=new FormData(form).get('currentPassword');void devices.run(async()=>{
      const result=await messagingRequest<{revoked:number}>('/api/settings/sessions',{method:'POST',body:JSON.stringify({currentPassword})});form.reset();devices.setMessage(`${result.revoked} other sessions signed out.`);setSessions(await messagingRequest<Session[]>('/api/settings/sessions'));
    });}}><label className="block text-sm">Current password to sign out other devices<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} className={fieldClass}/></label><button disabled={devices.pending} className={actionClass}>Sign out other devices</button><Feedback {...devices}/></form>
    <p className="text-sm text-muted-foreground">Two-factor authentication and password recovery are unavailable. Session records do not collect device fingerprints or locations.</p>
  </SettingsSection>;
}
