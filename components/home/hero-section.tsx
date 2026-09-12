import Link from "next/link";
import {
  ArrowRight,
  Check,
  MessageCircle,
  Paperclip,
  Phone,
  Video,
} from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_35%),radial-gradient(circle_at_top_left,rgba(99,102,241,0.08),transparent_30%)]" />

      <div className="mx-auto grid max-w-7xl gap-16 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-32">
        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1.5 text-sm font-medium shadow-sm backdrop-blur">
            <span className="flex size-2 rounded-full bg-blue-500" />
            Modern communication, built for everyone
          </div>

          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Chat, call, and share
            <span className="block text-blue-500">without limits.</span>
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
            ChatBit brings messaging, file sharing, voice calls, and video calls
            together in one simple and modern communication platform.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
            >
              Get Started
              <ArrowRight className="size-4" />
            </Link>

            <Link
              href="#features"
              className="inline-flex h-12 items-center justify-center rounded-xl border bg-background px-6 text-sm font-semibold transition-colors hover:bg-muted"
            >
              Explore Features
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Check className="size-4 text-blue-500" />
              Real-time messaging
            </div>

            <div className="flex items-center gap-2">
              <Check className="size-4 text-blue-500" />
              File sharing
            </div>

            <div className="flex items-center gap-2">
              <Check className="size-4 text-blue-500" />
              Voice & video calls
            </div>
          </div>
        </div>

        <DemoChatPreview />
      </div>
    </section>
  );
}

function DemoChatPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -inset-8 -z-10 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="overflow-hidden rounded-2xl border bg-background shadow-2xl">
        {/* Window header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-blue-500/10">
              <MessageCircle className="size-5 text-blue-500" />
            </div>

            <div>
              <p className="text-sm font-semibold">Sarah Wilson</p>
              <p className="text-xs text-green-500">Online</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Start voice call"
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Phone className="size-4" />
            </button>

            <button
              type="button"
              aria-label="Start video call"
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Video className="size-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-4 bg-muted/20 p-5">
          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-2xl rounded-tl-sm border bg-background px-4 py-3 shadow-sm">
              <p className="text-sm">Hey! Are you free for a quick call?</p>
              <p className="mt-1 text-right text-[10px] text-muted-foreground">
                10:24 AM
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground shadow-sm">
              <p className="text-sm">Sure! Give me a few minutes.</p>
              <p className="mt-1 text-right text-[10px] opacity-70">
                10:25 AM ✓✓
              </p>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-2xl rounded-tl-sm border bg-background px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10">
                  <Paperclip className="size-4 text-blue-500" />
                </div>

                <div>
                  <p className="text-sm font-medium">project-notes.pdf</p>
                  <p className="text-xs text-muted-foreground">2.4 MB</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground shadow-sm">
              <p className="text-sm">Got it. Thanks!</p>
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className="border-t p-3">
          <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
            <Paperclip className="size-4 text-muted-foreground" />

            <span className="flex-1 text-sm text-muted-foreground">
              Type a message...
            </span>

            <button
              type="button"
              aria-label="Send message"
              className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
