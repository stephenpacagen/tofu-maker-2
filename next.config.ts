import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/basePath";

const nextConfig: NextConfig = {
  basePath: BASE_PATH || undefined,
};

export default nextConfig;
