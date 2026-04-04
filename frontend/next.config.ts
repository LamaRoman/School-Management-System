import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only proxy to local backend. In production, NEXT_PUBLIC_API_URL points directly to the API subdomain.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/:path*",
      },
    ];
  },
};

export default nextConfig;