"use client";

import { Suspense } from "react";
import { RestockInboxPage } from "@/components/pos-admin/RestockInboxPage";

/** `RestockInboxPage` lee `?vista=` con `useSearchParams`: va dentro de `Suspense`. */
export default function PosSurtidoPage() {
  return (
    <Suspense fallback={<p className="page-kicker">Cargando...</p>}>
      <RestockInboxPage />
    </Suspense>
  );
}
