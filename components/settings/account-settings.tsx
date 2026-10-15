"use client";
import { useSettings } from './settings-provider';
import { LogoutButton } from '@/components/auth/logout-button';
import { SettingsSection } from './settings-form';
export function AccountSettings() {
  const {profile}=useSettings();
  return <SettingsSection title="Account" description="Your private account information and access.">
    <dl className="space-y-4 break-words rounded-xl border p-4"><div><dt className="text-sm font-medium">Email address</dt><dd className="text-sm text-muted-foreground">{profile.email}</dd></div><div><dt className="text-sm font-medium">Joined</dt><dd><time dateTime={profile.createdAt}>{new Date(profile.createdAt).toISOString().slice(0,10)}</time></dd></div><div><dt className="text-sm font-medium">Account ID</dt><dd className="break-all font-mono text-xs">{profile.id}</dd></div></dl>
    <p className="text-sm text-muted-foreground">Language: English. Additional languages are unavailable.</p><LogoutButton/>
    <section className="space-y-2 rounded-xl border border-destructive/30 p-5"><h3 className="font-medium">Account deletion — unavailable</h3><p className="text-sm text-muted-foreground">Self-service deletion is not available. Conversations and files are shared records; deleting an account requires a coordinated retention and storage cleanup policy. No deletion action is offered until that process can safely handle your data and your partners’ history.</p></section>
  </SettingsSection>;
}
