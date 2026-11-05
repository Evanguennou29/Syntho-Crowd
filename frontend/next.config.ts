import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  /* config options here */
  distDir: process.env.SYNTHO_NEXT_DIST_DIR || ".next",
  reactCompiler: true,
};

export default nextConfig;
