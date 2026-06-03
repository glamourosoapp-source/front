import path from "node:path";
import type { NextConfig } from "next";

const frontRoot = path.resolve(__dirname);
const sharedSrc = path.join(frontRoot, "shared/src");

const sharedAliases = {
  "@glamouroso/shared": path.join(sharedSrc, "index.ts"),
  "@glamouroso/shared/constants": path.join(sharedSrc, "constants.ts"),
  "@glamouroso/shared/schemas": path.join(sharedSrc, "schemas/index.ts"),
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@glamouroso/shared"],
  turbopack: {
    resolveAlias: {
      "@glamouroso/shared": "./shared/src/index.ts",
      "@glamouroso/shared/constants": "./shared/src/constants.ts",
      "@glamouroso/shared/schemas": "./shared/src/schemas/index.ts",
      "@glamouroso/shared/schemas/*": "./shared/src/schemas/*",
    },
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      ...sharedAliases,
    };
    return config;
  },
};

export default nextConfig;
