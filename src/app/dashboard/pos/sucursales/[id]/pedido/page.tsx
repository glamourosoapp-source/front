"use client";

import { Suspense } from "react";
import { RestockReviewPage } from "@/components/pos-admin/RestockReviewPage";

/** Revisar y enviar el pedido a fábrica de la sucursal (vista Resumen o Formato). */
export default function BranchRestockReviewRoute() {
  // `useSearchParams` (la vista va en `?vista=`) pide un límite de Suspense.
  return (
    <Suspense fallback={<p className="page-kicker">Calculando el pedido...</p>}>
      <RestockReviewPage />
    </Suspense>
  );
}
