"use client";

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
export function NavigationLink({ children, className, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} className={cn("relative", className)}>{children}<PendingHint /></Link>;
}
