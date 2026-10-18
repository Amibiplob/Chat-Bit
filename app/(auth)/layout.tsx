import { Navbar } from "@/components/header/navbar";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/server/auth";
import { redirect } from "next/navigation";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  if (await getCurrentUser()) redirect("/chat");
  return (
    <div className="cb-hero min-h-svh">
      <Navbar />

      <main className="relative flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden px-4 py-10">
        {/* Background decoration */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

          <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

          <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-md">
          <div className="cb-panel p-6 sm:p-10">
            {children}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} ChatBit. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  );
}
