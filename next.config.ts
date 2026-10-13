import path from "node:path";
import type { NextConfig } from "next";

const frontRoot = path.resolve(__dirname);
const sharedSrc = path.join(frontRoot, "shared/src");

const sharedAliases = {
  "@glamouroso/shared": path.join(sharedSrc, "index.ts"),
  "@glamouroso/shared/constants": path.join(sharedSrc, "constants.ts"),
  "@glamouroso/shared/schemas": path.join(sharedSrc, "schemas/index.ts"),
};

// Identifica el build: la caja lo compara con `/version` para recargarse sola tras
// un deploy. Railway da el commit; fuera de Railway basta la hora del build. Se
// guarda en `process.env` para que los workers del build (que vuelven a cargar
// este archivo) hereden el mismo valor y cliente y servidor no difieran: si
// difirieran, la caja creería que siempre hay versión nueva.
process.env.NEXT_PUBLIC_BUILD_ID ||= process.env.RAILWAY_GIT_COMMIT_SHA || String(Date.now());
const buildId = process.env.NEXT_PUBLIC_BUILD_ID;
// Hora del build, para el aviso de versión que la caja muestra arriba.
process.env.NEXT_PUBLIC_BUILD_TIME ||= new Date().toISOString();
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId, NEXT_PUBLIC_BUILD_TIME: buildTime },
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
