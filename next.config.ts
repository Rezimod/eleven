import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a lockfile in the home dir otherwise
  // makes Next infer the wrong root).
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
