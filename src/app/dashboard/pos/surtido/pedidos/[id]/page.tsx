"use client";

import { Suspense } from "react";
import { RestockOrderSheetPage } from "@/components/pos-admin/RestockOrderSheetPage";

/** Hoja del formato de un pedido de surtido: cómo quedó, y con `?modo=editar` corregir lo que se envía. */
export default function RestockOrderSheetRoute() {
  // `useSearchParams` (`?modo=editar`) pide un límite de Suspense.
  return (
    <Suspense fallback={<p className="page-kicker">Cargando hoja...</p>}>
      <RestockOrderSheetPage />
    </Suspense>
  );
}
