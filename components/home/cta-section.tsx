import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-xl sm:px-12 sm:py-20">
          <div className="absolute -left-20 -top-20 size-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 size-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to start chatting?
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 opacity-80 sm:text-base">
              Create your ChatBit account and experience a modern way to
              communicate.
            </p>

            <Link
              href="/signup"
              className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-background px-6 text-sm font-semibold text-foreground shadow-sm transition-all hover:bg-background/90"
            >
              Get Started
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
