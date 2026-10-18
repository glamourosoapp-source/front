"use client";

import { Suspense } from "react";
import { CountDetailPage } from "@/components/pos-admin/counts/CountDetailPage";

/** Detalle de un conteo cíclico: renglones, ajustes aplicados y reversa por renglón. */
export default function PosConteoDetailPage() {
  return (
    <Suspense fallback={<p className="page-kicker">Cargando conteo...</p>}>
      <CountDetailPage />
    </Suspense>
  );
}
