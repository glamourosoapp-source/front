"use client";

import { BranchListPage } from "@/components/pos-admin/BranchListPage";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";

export default function BranchesPage() {
  return <BranchListPage type={BRANCH_TYPES.BRANCH} />;
}
