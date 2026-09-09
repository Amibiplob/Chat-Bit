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
  {
    label: "Features",
    href: "#features",
  },
  {
    label: "About",
    href: "#about",
  },
];

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger
        className="inline-flex size-10 items-center justify-center rounded-md transition-colors hover:bg-muted"
        aria-label="Open menu"
      >
        <Menu className="size-6" />
      </SheetTrigger>

      <SheetContent side="right" className="w-75 sm:w-90">
        <SheetHeader>
          <SheetTitle>
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
                className="object-contain"
              />

              <span className="text-2xl font-bold tracking-tight">
                <span className="text-foreground">Chat</span>
                <span className="text-blue-500">Bit</span>
              </span>
            </Link>
          </SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col gap-2 py-6">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-4 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t pt-6">
          <Link
            href="/login"
            className="inline-flex h-10 w-full items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Login
          </Link>

          <Link
            href="/signup"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get Started
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
