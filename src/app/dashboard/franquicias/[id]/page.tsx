"use client";

import { Suspense } from "react";
import { BranchDetailPage } from "@/components/pos-admin/BranchDetailPage";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";

export default function FranchiseDetailRoute() {
  return (
    <Suspense fallback={<p className="page-kicker">Cargando franquicia...</p>}>
      <BranchDetailPage type={BRANCH_TYPES.FRANCHISE} />
    </Suspense>
  );
}
