import { execFileSync } from "node:child_process";
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

// Versión de la caja que ve el cajero: v1.0.1, v1.0.2… El último número cuenta los
// commits de main desde que se empezó a numerar (el commit 132 fue la v1.0.0), así
// que cada cambio publicado la sube solo, sin que nadie la edite. Para pasar a 1.1 o
// 2.0 se cambia POS_VERSION_PREFIX y se pone en POS_VERSION_BASE el conteo de main
// de ese momento, para que arranque otra vez en .0.
const POS_VERSION_PREFIX = "1.0";
const POS_VERSION_BASE = 132;

/**
 * Commits de la historia del build. Railway no trae `.git`, así que allí se le
 * pregunta a GitHub (el repo es público; `GITHUB_TOKEN` es opcional, por si el
 * límite sin token se agota); fuera de Railway, a git. Null si no se pudo: la
 * caja muestra entonces el commit, como antes.
 */
async function countCommits(): Promise<number | null> {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (!sha) {
    try {
      return Number(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: frontRoot }).toString().trim()) || null;
    } catch {
      return null;
    }
  }
  const owner = process.env.RAILWAY_GIT_REPO_OWNER || "glamourosoapp-source";
  const repo = process.env.RAILWAY_GIT_REPO_NAME || "front";
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${sha}&per_page=1`, {
      headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    // Con una página por commit, el número de la última página es el conteo.
    const last = response.headers.get("link")?.match(/[?&]page=(\d+)>; rel="last"/);
    return last ? Number(last[1]) : 1;
  } catch {
    return null;
  }
}

async function resolvePosVersion(): Promise<string> {
  const count = await countCommits();
  return count === null ? "" : `v${POS_VERSION_PREFIX}.${Math.max(0, count - POS_VERSION_BASE)}`;
}

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

export default async function config(): Promise<NextConfig> {
  // Igual que el build id: se calcula una vez y los workers la heredan.
  if (process.env.NEXT_PUBLIC_POS_VERSION === undefined) {
    process.env.NEXT_PUBLIC_POS_VERSION = await resolvePosVersion();
  }
  return {
    ...nextConfig,
    env: {
      NEXT_PUBLIC_BUILD_ID: buildId,
      NEXT_PUBLIC_BUILD_TIME: buildTime,
      NEXT_PUBLIC_POS_VERSION: process.env.NEXT_PUBLIC_POS_VERSION,
    },
  };
}
