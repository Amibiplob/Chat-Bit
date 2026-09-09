import Image from "next/image";
import Link from "next/link";

import { FooterLinks } from "./footer-links";
import { SocialLinks } from "./social-links";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_2fr]">
          {/* Brand */}
          <div className="max-w-sm">
            <Link
              href="/"
              aria-label="ChatBit home"
              className="inline-flex items-center gap-2"
            >
              <Image
                src="/logo.png"
                width={42}
                height={42}
                alt="ChatBit logo"
                priority
                className="object-contain"
              />

              <span className="text-xl font-bold tracking-tight">
                Chat<span className="text-primary">Bit</span>
              </span>
            </Link>

            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Chat, call, and share with the people who matter. ChatBit brings
              modern communication into one simple platform.
            </p>

            <div className="mt-6">
              <SocialLinks />
            </div>
          </div>

          {/* Footer Links */}
          <FooterLinks />
        </div>

        {/* Bottom */}
        <div className="mt-12 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} ChatBit. All rights reserved.
          </p>

          <p className="text-sm text-muted-foreground">
            Built by{" "}
            <Link
              href="https://github.com/Amibiplob"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground transition-colors hover:text-primary"
            >
              Md Biplob Hosain
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
