"use client";
import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navigation = [
  { label: "Features", href: "#features" },
  { label: "About", href: "#about" },
  { label: "Security", href: "#security" },
];

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger
        aria-label="Open navigation menu"
        className="inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-[85%] max-w-sm flex-col px-6 sm:w-96"
      >
        <SheetHeader className="border-b pb-6">
          <SheetTitle>
            <Link
              href="/"
              aria-label="ChatBit home"
              className="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
            >
              <Image
                src="/logo.png"
                width={40}
                height={40}
                alt="ChatBit logo"
                className="object-contain"
              />
              <span className="text-2xl font-bold tracking-tight">
                <span className="text-foreground">Chat</span>
                <span className="text-blue-500">Bit</span>
              </span>
            </Link>
          </SheetTitle>
        </SheetHeader>
        <nav
          aria-label="Mobile navigation"
          className="flex flex-col gap-1 py-6"
        >
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-4 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t pt-6">
          <Link
            href="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Get Started
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
