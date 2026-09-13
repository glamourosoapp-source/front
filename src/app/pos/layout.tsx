import type { Metadata } from "next";
import type { ReactNode } from "react";
import PosShell from "./PosShell";

/**
 * La caja vive fuera de `/dashboard` a propósito: pantalla completa, sin
 * sidebar ni topbar del panel. El cajero ve solo la venta.
 *
 * Este layout es de **servidor** para poder exportar `metadata`: instalada como
 * app, el `title` es lo que se lee en la barra de tareas y en alt-tab de
 * Windows. Toda la lógica de cliente vive en `PosShell`.
 */
export const metadata: Metadata = {
  title: "Glamouroso · Punto de venta",
  description: "Caja del punto de venta: cobro en efectivo, venta por litro y ticket térmico.",
};

export default function PosLayout({ children }: { children: ReactNode }) {
  return <PosShell>{children}</PosShell>;
}
