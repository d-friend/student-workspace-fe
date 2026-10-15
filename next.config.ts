import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One origin for the browser: /api/* goes to the backend, so the guest cookie stays first-party.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
