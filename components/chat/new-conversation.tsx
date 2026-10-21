"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCirclePlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { messagingRequest } from "@/lib/messaging-client";
import type { SearchUser } from "@/lib/messaging-types";
import { searchSchema } from "@/lib/form-validation.mjs";

export function NewConversation() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();
  const busy = useRef(false);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current++; request.current?.abort(); }, []);
  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) { generation.current++; request.current?.abort(); busy.current = false; setPending(false); }
  }

  async function find(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    if (!searchSchema.safeParse(search).success) { setError("Enter 2–254 characters to search."); return; }
    busy.current = true;
    const current = ++generation.current;
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError("");
    setUsers([]); setSearched(false);
    try {
      const rows = await messagingRequest<SearchUser[]>(`/api/users?q=${encodeURIComponent(search.trim())}`, { signal: controller.signal });
      if (current !== generation.current) return;
      setUsers(rows);
      setSearched(true);
    } catch (error) { if (current === generation.current) setError(error instanceof Error ? error.message : "Search failed. Please try again."); }
    finally { if (current === generation.current) { busy.current = false; setPending(false); } }
  }

  async function start(participantId: string) {
    if (busy.current) return;
    busy.current = true;
    const current = ++generation.current;
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError("");
    try {
      const { id } = await messagingRequest<{ id: string }>("/api/conversations", { method: "POST", body: JSON.stringify({ participantId }), signal: controller.signal });
      if (current !== generation.current) return;
      setOpen(false); router.push(`/chat/${id}`);
    } catch (error) { if (current === generation.current) setError(error instanceof Error ? error.message : "Could not start the conversation."); }
    finally { if (current === generation.current) { busy.current = false; setPending(false); } }
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger aria-label="New conversation" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><MessageCirclePlus className="size-5" /></SheetTrigger>
      <SheetContent className="p-5">
        <SheetHeader><SheetTitle>New conversation</SheetTitle></SheetHeader>
        <form onSubmit={find} className="space-y-3" aria-busy={pending}>
          <label htmlFor={inputId} className="text-sm font-medium">Find a user by name or exact email</label>
          <input id={inputId} name="userSearch" disabled={pending} value={search} onChange={(event) => { setSearch(event.target.value); setUsers([]); setSearched(false); setError(""); }} minLength={2} maxLength={254} required className="h-11 w-full rounded-lg border bg-background px-3 text-sm" />
          <button disabled={pending} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Please wait…" : "Search"}</button>
        </form>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {searched && !users.length && <p className="text-sm text-muted-foreground">No users found.</p>}
        <ul className="space-y-2 overflow-y-auto">
          {users.map((user) => <li key={user.id}><button disabled={pending} onClick={() => start(user.id)} className="w-full rounded-lg border px-3 py-3 text-left text-sm hover:bg-muted disabled:opacity-50">{user.displayName}</button></li>)}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
