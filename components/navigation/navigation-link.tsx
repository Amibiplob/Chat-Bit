"use client";

import { useConversationCache } from "@/components/conversation/conversation-cache-provider";
import { beginPageNavigation } from "@/lib/connection-performance.mjs";
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function PendingHint() {
  const { pending } = useLinkStatus();
  return <>
    <span aria-hidden="true" data-navigation-pending={pending} className={cn("pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-primary bg-primary/10", !pending && "invisible")} />
    {pending && <span role="status" className="sr-only">Opening page…</span>}
  </>;
}

// Native Link semantics preserve modified clicks, history and direct URLs.
export function NavigationLink({ children, className, onNavigate, ...props }: ComponentProps<typeof Link>) {
  const cache = useConversationCache();
  return <Link {...props} onNavigate={event => {
    let cancelled = false;
    onNavigate?.({preventDefault: () => { cancelled = true; event.preventDefault(); }});
    if (cancelled) return;
    const id = typeof props.href === "string" ? /^\/chat\/([a-f0-9-]{36})$/i.exec(props.href)?.[1] : null;
    if (id && cache?.get(id)) {
      event.preventDefault(); beginPageNavigation(); cache.enable();
      window.history.pushState(null, "", props.href as string);
    }
  }} className={cn("relative", className)}>{children}<PendingHint /></Link>;
}
