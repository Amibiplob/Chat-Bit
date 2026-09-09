import Link from "next/link";
import { FaGithub, FaLinkedinIn, FaXTwitter } from "react-icons/fa6";

const socialLinks = [
  {
    label: "GitHub",
    href: "https://github.com/Amibiplob",
    icon: FaGithub,
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/amibiplob",
    icon: FaLinkedinIn,
  },
  {
    label: "X",
    href: "https://x.com",
    icon: FaXTwitter,
  },
];

export function SocialLinks() {
  return (
    <div className="flex items-center gap-2">
      {socialLinks.map((social) => {
        const Icon = social.icon;

        return (
          <Link
            key={social.label}
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={social.label}
            className="flex size-9 items-center justify-center rounded-full border border-border bg-background/50 text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
          >
            <Icon className="size-4" />
          </Link>
        );
      })}
    </div>
  );
}
