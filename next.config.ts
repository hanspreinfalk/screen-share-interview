import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      { source: "/interview", destination: "/", permanent: false },
      { source: "/automations", destination: "/", permanent: false },
      { source: "/automations/:path*", destination: "/", permanent: false },
      { source: "/integrations", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
