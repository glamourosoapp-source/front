import { NextResponse } from "next/server";

/**
 * Versión del build que está sirviendo el servidor. La caja la compara con la
 * suya (`NEXT_PUBLIC_BUILD_ID`, fijada en `next.config.ts` al compilar) para
 * saber que hubo un deploy y recargarse sola (`usePosAutoUpdate`).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
