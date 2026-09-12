import { Check, Lock, ShieldCheck, UserCheck } from "lucide-react";

export function SecuritySection() {
  return (
    <section id="security" className="border-b bg-muted/20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
              <ShieldCheck className="size-6" />
            </div>

            <h2 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
              Your conversations deserve privacy.
            </h2>

            <p className="mt-5 max-w-xl leading-7 text-muted-foreground">
              ChatBit is designed with modern authentication, controlled data
              access, and secure communication patterns in mind.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <SecurityItem
                icon={Lock}
                title="Secure access"
                description="Authentication keeps your account protected."
              />

              <SecurityItem
                icon={UserCheck}
                title="Private conversations"
                description="Conversation data is scoped to authorized users."
              />

              <SecurityItem
                icon={ShieldCheck}
                title="Protected files"
                description="Shared files are handled through controlled storage."
              />

              <SecurityItem
                icon={Check}
                title="Modern architecture"
                description="Built with current web security practices."
              />
            </div>
          </div>

          <div className="rounded-2xl border bg-background p-8 shadow-sm">
            <div className="mx-auto max-w-sm">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
                <ShieldCheck className="size-8" />
              </div>

              <h3 className="mt-6 text-center text-xl font-semibold">
                Privacy by design
              </h3>

              <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
                A clean architecture helps keep authentication, conversations,
                files, and communication features separated and manageable.
              </p>

              <div className="mt-8 space-y-3">
                {[
                  "Authenticated users",
                  "Protected conversations",
                  "Controlled file access",
                  "Secure real-time communication",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-lg border px-4 py-3"
                  >
                    <Check className="size-4 text-blue-500" />
                    <span className="text-sm font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SecurityItem({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Lock;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-blue-500 shadow-sm ring-1 ring-border">
        <Icon className="size-4" />
      </div>

      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
