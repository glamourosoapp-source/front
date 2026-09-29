"use client";

import { Suspense } from "react";
import { FactoryFormAdminPage } from "@/components/pos-admin/FactoryFormAdminPage";

/**
 * Configuración del POS → Formato de pedido: editar la hoja, descargarla en
 * Excel y ligar lo que se vende fuera del formato. Lee `?vista=` con
 * `useSearchParams`, así que va dentro de `Suspense`.
 */
export default function FactoryFormRoute() {
  return (
    <Suspense fallback={<p className="page-kicker">Cargando formato...</p>}>
      <FactoryFormAdminPage />
    </Suspense>
  );
}
