"use client";

import { Suspense } from "react";
import { BranchRestockEntryPage } from "@/components/pos-admin/BranchRestockEntryPage";

/** Entrada de surtido de la sucursal con el formato de pedido a fábrica, precargada y editable. */
export default function BranchRestockEntryRoute() {
  // `useSearchParams` (el pedido base va en `?order=`) pide un límite de Suspense.
  return (
    <Suspense fallback={<p className="page-kicker">Cargando hoja...</p>}>
      <BranchRestockEntryPage />
    </Suspense>
  );
}
