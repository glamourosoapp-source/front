"use client";

import { Suspense } from "react";
import { SupervisorCountsPage } from "@/components/supervisor/SupervisorCountsPage";

/** Conteos de inventario (cíclicos) de todas las sucursales. */
export default function SupervisorCountsRoute() {
  // `useSearchParams` (`?sucursal=` desde la tarjeta de Sucursales) pide un límite de Suspense.
  return (
    <Suspense fallback={<p className="page-kicker">Cargando conteos…</p>}>
      <SupervisorCountsPage />
    </Suspense>
  );
}
