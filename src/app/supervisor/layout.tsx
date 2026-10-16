import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import SupervisorShell from "./SupervisorShell";

/**
 * App del supervisor de caja: vive fuera de `/dashboard`, como la caja y la
 * tablet de fábrica. Se usa sobre todo en el celular, recorriendo sucursales,
 * pero también en tablet y computadora. Layout de servidor para exportar
 * `metadata`; la lógica de cliente vive en `SupervisorShell`.
 */
export const metadata: Metadata = {
  title: "Glamouroso · Supervisor de caja",
  description: "Apertura y cierre de las sucursales y pedidos a fábrica, para el supervisor de caja.",
  /**
   * Su propia app instalable: el manifiesto de la raíz es el de la caja
   * (abre en `/pos`, en horizontal), y una tablet que instalaba desde aquí
   * dejaba al supervisor en "Sin acceso a la caja". Este abre en `/supervisor`
   * y respeta la orientación del aparato.
   */
  manifest: "/supervisor.webmanifest",
  appleWebApp: { capable: true, title: "Supervisor", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function SupervisorLayout({ children }: { children: ReactNode }) {
  return <SupervisorShell>{children}</SupervisorShell>;
}
