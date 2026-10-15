"use client";
import Link from 'next/link';
import { useRealtime } from './realtime-provider';
import { Avatar } from '@/components/profile/avatar';
import { NewConversation } from './new-conversation';
export function ContactsPage() {const {conversations}=useRealtime();return <section className="p-5"><header className="mb-5 flex items-center justify-between"><h1 className="text-lg font-semibold">Conversation partners</h1><NewConversation/></header><p className="mb-4 text-sm text-muted-foreground">People you already chat with. Start a conversation to add someone.</p>{!conversations.length && <p className="text-sm">No conversation partners yet.</p>}<ul className="divide-y">{conversations.map(c=><li key={c.id}><Link className="flex min-h-16 items-center gap-3 py-3" href={`/chat/${c.id}`}><Avatar userId={c.participantId} name={c.name} version={c.avatarVersion}/><span className="truncate">{c.name}</span></Link></li>)}</ul></section>;}
