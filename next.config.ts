import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const connectSrc = [
      "'self'",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://www.googleapis.com",
      "https://firestore.googleapis.com",
      "https://storage.googleapis.com",
      "http://localhost:9099",
      "http://127.0.0.1:9099",
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "http://localhost:9199",
      "http://127.0.0.1:9199",
      "ws://localhost:4000",
      "ws://127.0.0.1:4000",
      "ws://localhost:9099",
      "ws://127.0.0.1:9099",
    ];
    // Dev-only: the Firebase emulators and Next tooling open WebSockets on
    // dynamic localhost ports (log forwarding, HMR). Production keeps the
    // strict list above.
    if (process.env.NODE_ENV === "development") {
      connectSrc.push("ws://localhost:*", "ws://127.0.0.1:*");
    }
    return [
      {
        source: "/(.*)",
        headers: [
          // CSP: inline styles/scripts are required by Next.js unless fully
          // nonce-based; this still blocks remote script injection (XSS) and
          // plugin/frame sources.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.backblazeb2.com http://127.0.0.1:9199",
              "font-src 'self' data:",
              `connect-src ${connectSrc.join(" ")}`,
              "frame-ancestors 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
