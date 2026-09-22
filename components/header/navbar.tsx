import Image from "next/image";
import Link from "next/link";

import { MobileNav } from "./mobile-nav";

import { AuthNav } from "../layout/auth-nav";
const navigation = [
  {
    label: "Features",
    href: "#features",
  },
  {
    label: "About",
    href: "#about",
  },
  {
    label: "Security",
    href: "#security",
  },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          aria-label="ChatBit home"
          className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
        >
          <Image
            src="/logo.png"
            width={42}
            height={42}
            alt="ChatBit logo"
            priority
            className="object-contain"
          />

          <span className="text-2xl font-bold tracking-tight">
            <span className="text-foreground">Chat</span>
            <span className="text-blue-500">Bit</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-8 md:flex">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-3 md:flex">
          <AuthNav />
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
