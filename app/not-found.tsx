import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
export default function NotFound(){return <main className="cb-hero flex min-h-svh flex-col items-center justify-center gap-5 px-6 text-center"><MessageCircle className="size-12 text-primary"/><p className="cb-kicker">404 · A wrong turn</p><h1 className="text-4xl font-semibold tracking-tight">Let’s get you back.</h1><p className="text-muted-foreground">That page isn’t here. Your next conversation is.</p><Link href="/chat" className="cb-button">Back to ChatBit</Link></main>;}
