import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/sw.js", headers: [{key:"Cache-Control",value:"no-cache, no-store, must-revalidate"},{key:"Service-Worker-Allowed",value:"/"}] }, { source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), browsing-topics=()" },
      // Next uses inline bootstrap scripts; do not pretend this is a nonce CSP.
      // Resource routes can add their stricter sandbox policy independently.
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
  // The HTTP test harness must not interrupt an existing development server.
  ...(process.env.CHATBIT_AUTH_HTTP_TEST === "1" && process.env.NODE_ENV === "development" ? {
    distDir: ".next/auth-http-test",
    typescript: { tsconfigPath: ".next/auth-http-test/tsconfig.json" },
  } : {}),
  experimental: {
    serverActions: { bodySizeLimit: "16kb" },
  },
};

export default nextConfig;
