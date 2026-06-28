import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Only set for the offline-install build (see scripts/offline-build/ —
  // mirrors the same env-var-gated approach used for apps/api). Leaving
  // this unset for the normal build keeps Vercel's behavior byte-identical
  // to before; Vercel doesn't consume the standalone server.js anyway, but
  // there's no reason to risk it.
  // distDir avoids the default dot-prefixed ".next" — Wine (used to compile
  // the Windows installer on a Linux dev machine) auto-marks dot-prefixed
  // files/folders as Hidden when translating the filesystem, and Inno
  // Setup's wildcard [Files] source silently skips hidden files, so the
  // entire build output went missing from real Windows installs. Found by
  // actually installing on Windows hardware, not anything Wine itself could
  // have caught (Wine doesn't run the installed app's web server).
  ...(process.env.OFFLINE_BUILD === '1' ? { output: 'standalone' as const, distDir: 'next-build' } : {}),
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
