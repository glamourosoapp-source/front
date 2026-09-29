"use client";

import type { ReactNode } from "react";
import { config } from "@/config";
import { FranchiseDisabledNotice } from "@/components/pos-admin/FranchiseDisabledNotice";

/** Pantallas de franquicias del panel, detrás de la bandera del módulo. */
export default function FranchisesDashboardLayout({ children }: { children: ReactNode }) {
  if (!config.franchiseModuleEnabled) return <FranchiseDisabledNotice />;
  return <>{children}</>;
}
