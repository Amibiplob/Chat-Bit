import {
  Check,
  MessageCircle,
  Phone,
  Search,
  Settings,
  Video,
} from "lucide-react";

export function ProductShowcase() {
  return (
    <section id="about" className="overflow-hidden border-b py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-500">
              Built for real conversations
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              A communication experience that feels familiar.
            </h2>

            <p className="mt-5 leading-7 text-muted-foreground">
              ChatBit keeps the interface simple while providing the features
              people expect from a modern communication platform.
            </p>

            <div className="mt-8 space-y-4">
              {[
                "Clean and responsive interface",
                "Fast real-time conversations",
                "Integrated voice and video calling",
                "Simple file sharing",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="flex size-6 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                    <Check className="size-3.5" />
                  </div>

                  <span className="text-sm font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <DesktopPreview />
        </div>
      </div>
    </section>
  );
}

function DesktopPreview() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="overflow-hidden rounded-2xl border bg-background shadow-2xl">
        {/* Top bar */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-red-400" />
            <span className="size-2.5 rounded-full bg-yellow-400" />
            <span className="size-2.5 rounded-full bg-green-400" />
          </div>

          <div className="ml-4 flex-1 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
            chatbit.app/chat
          </div>
        </div>

        <div className="grid min-h-105 grid-cols-[150px_1fr]">
          {/* Sidebar */}
          <aside className="border-r bg-muted/20 p-3">
            <div className="mb-5 flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500 text-white">
                <MessageCircle className="size-4" />
              </div>

              <span className="text-sm font-bold">ChatBit</span>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
                <MessageCircle className="size-3.5" />
                Chats
              </div>

              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                <Phone className="size-3.5" />
                Calls
              </div>

              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                <Settings className="size-3.5" />
                Settings
              </div>
            </div>
          </aside>

          {/* Chat */}
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-blue-500/10 text-sm font-semibold text-blue-500">
                SW
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Sarah Wilson</p>
                <p className="text-xs text-green-500">Online</p>
              </div>

              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label="Search"
                  className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
                >
                  <Search className="size-4" />
                </button>

                <button
                  type="button"
                  aria-label="Video call"
                  className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
                >
                  <Video className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-3 bg-muted/10 p-5">
              <div className="w-fit max-w-[70%] rounded-xl rounded-tl-sm border bg-background px-3 py-2 text-xs">
                Hey! How is the project going?
              </div>

              <div className="ml-auto w-fit max-w-[70%] rounded-xl rounded-tr-sm bg-primary px-3 py-2 text-xs text-primary-foreground">
                Going great! I&apos;m almost finished.
              </div>

              <div className="w-fit max-w-[70%] rounded-xl rounded-tl-sm border bg-background px-3 py-2 text-xs">
                Nice! Let me know when it&apos;s ready.
              </div>
            </div>

            <div className="border-t p-3">
              <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                Write a message...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
