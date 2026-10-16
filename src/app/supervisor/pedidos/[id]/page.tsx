"use client";

import { Suspense } from "react";
import { RestockReviewPage } from "@/components/pos-admin/RestockReviewPage";

/**
 * Revisar, editar y enviar el pedido de una sucursal (vista Resumen o
 * Formato). Es la misma pantalla del panel; el marco de `/supervisor` le pone
 * sus enlaces y le quita los montos.
 */
export default function SupervisorReviewRoute() {
  // `useSearchParams` (la vista va en `?vista=`) pide un límite de Suspense.
  return (
    <Suspense fallback={<p className="page-kicker">Calculando el pedido...</p>}>
      <RestockReviewPage />
    </Suspense>
  );
}
