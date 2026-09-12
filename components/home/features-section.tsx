import { File, MessageCircle, Phone, Radio, Video } from "lucide-react";

const features = [
  {
    title: "Real-time Messaging",
    description:
      "Send and receive messages instantly with a fast and responsive chat experience.",
    icon: MessageCircle,
  },
  {
    title: "File Sharing",
    description:
      "Share images, documents, and other files directly inside your conversations.",
    icon: File,
  },
  {
    title: "Voice Calls",
    description: "Connect with people through clear peer-to-peer audio calls.",
    icon: Phone,
  },
  {
    title: "Video Calls",
    description:
      "Have face-to-face conversations with real-time video communication.",
    icon: Video,
  },
  {
    title: "Live Presence",
    description:
      "See online status and typing activity while conversations happen.",
    icon: Radio,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="border-b py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-500">
            Features
          </p>

          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to stay connected
          </h2>

          <p className="mt-4 text-muted-foreground">
            ChatBit combines the communication features you use every day into
            one focused experience.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <article
                key={feature.title}
                className="group rounded-2xl border bg-background p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 transition-colors group-hover:bg-blue-500 group-hover:text-white">
                  <Icon className="size-5" />
                </div>

                <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
