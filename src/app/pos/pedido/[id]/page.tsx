"use client";

import { Suspense } from "react";
import { RestockReviewPage } from "@/components/pos-admin/RestockReviewPage";

/** Revisar, editar y enviar el pedido de la sucursal desde la caja (Resumen o Formato). */
export default function CashierReviewRoute() {
  // `useSearchParams` (la vista va en `?vista=`) pide un límite de Suspense.
  return (
    <Suspense fallback={<p className="page-kicker">Calculando el pedido...</p>}>
      <RestockReviewPage />
    </Suspense>
  );
}
