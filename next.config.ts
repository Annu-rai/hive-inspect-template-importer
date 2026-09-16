import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root: the parent D:\Project folder holds unrelated
  // projects and a stray lockfile that would otherwise confuse Turbopack's
  // root auto-detection.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
