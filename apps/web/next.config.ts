import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    // Strip a trailing /api so /uploads/* proxies to the API origin (Railway in prod, localhost in dev)
    const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(/\/api\/?$/, '')
    return [
      {
        source: '/uploads/:path*',
        destination: `${apiOrigin}/uploads/:path*`,
      },
    ]
  },
};

export default nextConfig;
