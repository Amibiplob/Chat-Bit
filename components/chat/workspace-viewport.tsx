"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ContactsPage } from "./contacts-page";
import { CallsPage } from "@/components/calls/calls-page";
import { SettingsLayout } from "@/components/settings/settings-layout";

const sections = ["/chat", "/calls", "/contacts", "/settings"];

// At most four panels, owned by the account-keyed authenticated shell. A panel
// mounts on first selection, then retains its client state across tab changes.
export function WorkspaceViewport({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = sections.includes(pathname) ? pathname : null;
  const [visited, setVisited] = useState<string[]>(active ? [active] : []);
  if (active && !visited.includes(active)) setVisited([...visited, active]);
  return <>
    {visited.map(path => <div key={path} data-workspace-panel={path}
      hidden={path !== active} style={{ display: path === active ? undefined : "none" }}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      {path === "/contacts" ? <ContactsPage /> : path === "/calls" ? <CallsPage /> : path === "/settings" ? <SettingsLayout /> :
        <div className="flex flex-1 items-center justify-center"><div className="px-6 text-center"><h2 className="text-lg font-semibold">Select a conversation</h2><p className="mt-1 text-sm text-muted-foreground">Choose a conversation to start messaging.</p></div></div>}
    </div>)}
    <div hidden={Boolean(active)} style={{ display: active ? "none" : "contents" }}>{children}</div>
  </>;
}
