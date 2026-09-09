import Link from "next/link";

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Security", href: "#security" },
      { label: "Download", href: "#download" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Contact", href: "#contact" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "#help" },
      { label: "Privacy Policy", href: "#privacy" },
      { label: "Terms of Service", href: "#terms" },
    ],
  },
];

export function FooterLinks() {
  return (
    <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
      {footerColumns.map((column) => (
        <div key={column.title}>
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            {column.title}
          </h3>

          <ul className="space-y-3">
            {column.links.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
