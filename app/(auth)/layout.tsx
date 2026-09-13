import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-muted/30 px-4 py-10">
      {/* Background decoration */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link
            href="/"
            aria-label="ChatBit home"
            className="flex items-center gap-2"
          >
            <Image
              src="/logo.png"
              width={42}
              height={42}
              alt="ChatBit logo"
              priority
            />

            <span className="text-2xl font-bold tracking-tight">
              <span className="text-foreground">Chat</span>
              <span className="text-blue-500">Bit</span>
            </span>
          </Link>
        </div>

        {/* Auth content */}
        <div className="rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
          {children}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} ChatBit. All rights reserved.
        </p>
      </div>
    </main>
  );
}
