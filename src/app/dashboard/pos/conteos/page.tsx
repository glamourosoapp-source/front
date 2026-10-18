"use client";

import { Suspense } from "react";
import { CountsPage } from "@/components/pos-admin/counts/CountsPage";

/** `CountsPage` lee `?vista=` y `?sucursal=` con `useSearchParams`: va dentro de `Suspense`. */
export default function PosConteosPage() {
  return (
    <Suspense fallback={<p className="page-kicker">Cargando...</p>}>
      <CountsPage />
    </Suspense>
  );
}
