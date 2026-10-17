import Link from "next/link";

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Security", href: "/#security" },
      { label: "Open ChatBit", href: "/chat" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/#about" },
      { label: "GitHub", href: "https://github.com/Amibiplob" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Setup and limitations", href: "https://github.com/Amibiplob/Chat-Bit#readme" },
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
      <p className="col-span-full text-xs text-muted-foreground">This portfolio demo has no published Terms of Service or Privacy Policy. Do not share sensitive information.</p>
    </div>
  );
}
