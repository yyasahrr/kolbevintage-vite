import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Next dev blocks browser assets/HMR on its public preview origin by default.
  allowedDevOrigins: [
    "3000-ihweweh4oxtr7biflfpru.e2b.app",
    "*.e2b.app",
  ],
  turbopack: { root: path.resolve(".") },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
