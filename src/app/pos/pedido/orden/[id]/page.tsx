"use client";

import { Suspense } from "react";
import { RestockOrderSheetPage } from "@/components/pos-admin/RestockOrderSheetPage";

/** Un pedido ya enviado desde la caja: lo que se pidió, en Resumen o en la hoja del Formato. */
export default function CashierOrderSheetRoute() {
  return (
    <Suspense fallback={<p className="page-kicker">Cargando hoja...</p>}>
      <RestockOrderSheetPage />
    </Suspense>
  );
}
