import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
