"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCirclePlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { messagingRequest } from "@/lib/messaging-client";
import type { SearchUser } from "@/lib/messaging-types";

export function NewConversation() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function find(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    try {
      setUsers(await messagingRequest<SearchUser[]>(`/api/users?q=${encodeURIComponent(search.trim())}`));
      setSearched(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Search failed. Please try again."); }
    finally { setPending(false); }
  }

  async function start(participantId: string) {
    if (pending) return;
    setPending(true); setError("");
    try {
      const { id } = await messagingRequest<{ id: string }>("/api/conversations", { method: "POST", body: JSON.stringify({ participantId }) });
      setOpen(false); router.push(`/chat/${id}`); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not start the conversation."); }
    finally { setPending(false); }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label="New conversation" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><MessageCirclePlus className="size-5" /></SheetTrigger>
      <SheetContent className="p-5">
        <SheetHeader><SheetTitle>New conversation</SheetTitle></SheetHeader>
        <form onSubmit={find} className="space-y-3" aria-busy={pending}>
          <label htmlFor="find-user" className="text-sm font-medium">Find a user by name or exact email</label>
          <input id="find-user" value={search} onChange={(event) => setSearch(event.target.value)} minLength={2} maxLength={254} required className="h-10 w-full rounded-lg border bg-background px-3 text-sm" />
          <button disabled={pending} className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Please wait…" : "Search"}</button>
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
