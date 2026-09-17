"use client";

import { Suspense } from "react";
import { BranchDetailPage } from "@/components/pos-admin/BranchDetailPage";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";

export default function BranchDetailRoute() {
  // `useSearchParams` (la pestaña va en la URL) pide un límite de Suspense.
  return (
    <Suspense fallback={<p className="page-kicker">Cargando sucursal...</p>}>
      <BranchDetailPage type={BRANCH_TYPES.BRANCH} />
    </Suspense>
  );
}
