"use client";

import { Suspense } from "react";
import { RestockOrderSheetPage } from "@/components/pos-admin/RestockOrderSheetPage";

/** Un pedido ya enviado: lo que se pidió, en Resumen o en la hoja del Formato. */
export default function SupervisorOrderSheetRoute() {
  return (
    <Suspense fallback={<p className="page-kicker">Cargando hoja...</p>}>
      <RestockOrderSheetPage />
    </Suspense>
  );
}
