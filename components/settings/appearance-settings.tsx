"use client";
import { useState,useSyncExternalStore } from 'react';
import { Monitor,Moon,Sun } from 'lucide-react';
import { changeTheme,readTheme,subscribeTheme } from '@/lib/theme.mjs';
import { SettingsSection } from './settings-form';
import { InstallOption } from '@/components/pwa/install-provider';
const serverTheme=()=> 'system';
export function AppearanceSettings() {
  const theme=useSyncExternalStore(subscribeTheme,readTheme,serverTheme),[error,setError]=useState('');
  return <SettingsSection title="Appearance" description="Theme is saved on this device and shared with its other tabs.">
    <div className="grid gap-3 sm:grid-cols-3">{[{id:'light',label:'Light',icon:Sun},{id:'dark',label:'Dark',icon:Moon},{id:'system',label:'System',icon:Monitor}].map(({id,label,icon:Icon})=><button key={id} aria-pressed={theme===id} onClick={()=>{try{changeTheme(id);setError('');}catch(error){setError((error as Error).message);}}} className={`min-h-24 rounded-xl border p-4 text-left ${theme===id?'border-teal-600 bg-teal-600/10':'hover:bg-muted'}`}><Icon aria-hidden="true" className="mb-3 size-6"/>{label}</button>)}</div>
    <p role="alert" className="text-sm text-destructive">{error}</p><p className="text-sm text-muted-foreground">System follows device changes automatically. Message spacing and timestamps currently use the standard layout.</p>
    <div className="cb-panel p-5"><h3 className="mb-3 font-semibold">ChatBit on your home screen</h3><InstallOption/></div>
  </SettingsSection>;
}
