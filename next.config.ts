import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/socket.io/:path*",
        destination: "http://127.0.0.1:3010/socket.io/:path*",
      },
    ];
  },
};

export default nextConfig;
