import Link from "next/link";
import { ArrowRight, AudioLines, FileText, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";

export function HeroSection() {
  return <section className="cb-hero relative overflow-hidden border-b">
    <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:py-28">
      <div className="relative z-10">
        <p className="cb-kicker rounded-full border bg-card px-3 py-2"><Sparkles className="size-4"/> Your people. One place.</p>
        <h1 className="mt-6 max-w-3xl text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.055em] sm:text-6xl lg:text-7xl">A little closer.<br/><span className="text-primary">Every conversation.</span></h1>
        <p className="mt-6 max-w-lg text-base leading-8 text-muted-foreground sm:text-lg">A hello on the move. A photo worth sharing. A call that makes your day. Make room for your people with ChatBit, on your phone or your desktop.</p>
        <div className="mt-9 flex flex-wrap gap-3"><Link className="cb-button" href="/signup">Start a conversation <ArrowRight className="size-4"/></Link><Link className="cb-button-secondary" href="/login">Welcome back</Link></div>
        <div className="mt-9 flex flex-wrap gap-5 text-xs font-medium text-muted-foreground"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary"/> Private file access</span><span>Made for web & mobile</span><Link href="/help" className="underline underline-offset-4">Explore what’s supported</Link></div>
      </div>
      <div className="cb-panel relative mx-auto w-full max-w-md p-5 sm:p-7" aria-label="ChatBit features">
        <div className="mb-7 flex items-center gap-3 border-b pb-5"><span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><MessageCircle/></span><div><p className="text-lg font-semibold">A space for your people</p><p className="text-xs text-muted-foreground">The essentials, thoughtfully connected</p></div></div>
        {[{icon:MessageCircle,title:'Keep the conversation going',text:'Direct messages, replies and read receipts.'},{icon:FileText,title:'Share something worth keeping',text:'Photos, videos and documents up to 10 MiB.'},{icon:AudioLines,title:'Make it a real conversation',text:'Peer-to-peer voice and video while the app is open.'}].map(({icon:Icon,title,text})=><div key={title} className="mb-4 flex gap-4 rounded-2xl bg-muted/60 p-4"><Icon className="mt-1 size-5 shrink-0 text-primary"/><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p></div></div>)}
        <Link href="/chat" className="mt-5 flex min-h-12 items-center justify-between rounded-xl border px-4 text-sm font-medium">Open your inbox <ArrowRight className="size-4"/></Link>
      </div>
    </div>
  </section>;
}
