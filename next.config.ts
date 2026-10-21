import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workspace iframe is sandboxed without allow-same-origin (opaque origin), so its font and ES module fetches are cross-origin.
  // Folders named lib@version never change, so they cache forever.
  async headers() {
    return [
      { source: "/vendor/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] },
      {
        source: "/vendor/:dir(\\w+@[\\d.]+)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  // One origin for the browser: /api/* goes to the backend, so the guest cookie stays first-party.
  // `fallback`, not the default afterFiles: dynamic routes are matched after afterFiles rewrites, and the
  // turn stream needs its own Route Handler (src/app/api/sessions/[sessionId]/turns/route.ts) to win.
  async rewrites() {
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${process.env.BACKEND_URL ?? "http://127.0.0.1:8000"}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
