import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    if (!process.env.VERCEL) return [];

    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: "/vercel-backend/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
