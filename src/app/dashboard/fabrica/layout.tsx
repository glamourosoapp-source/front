"use client";

import type { ReactNode } from "react";
import { config } from "@/config";
import { FactoryDisabledNotice } from "@/components/pos-admin/FactoryDisabledNotice";

/** Pantallas de fábrica del panel, detrás de la bandera del módulo. */
export default function FactoryDashboardLayout({ children }: { children: ReactNode }) {
  if (!config.factoryModuleEnabled) return <FactoryDisabledNotice />;
  return <>{children}</>;
}
