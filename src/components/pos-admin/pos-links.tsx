"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { RestockOrder } from "@/types";

/**
 * A dónde lleva cada enlace del surtido. Las pantallas de pedido a fábrica
 * (revisar y enviar, hoja del pedido, sus acciones) viven en el panel y
 * también en la app del supervisor de caja (`/supervisor`): son las mismas
 * pantallas, cada app pone sus rutas con `PosLinksProvider`.
 */
export interface PosLinks {
  /** Revisar y enviar el pedido de una sucursal (`vista` = "formato" abre la hoja). */
  review: (branchId: string, vista?: "formato" | null) => string;
  /** Hoja de un pedido (`edit` = corregir lo que se envía). */
  orderSheet: (orderId: string, edit?: boolean) => string;
  /** De dónde se viene al revisar: los pedidos de la sucursal. */
  branchOrders: (branchId: string) => string;
  /** Hoja de llegada precargada con el pedido. */
  arrival: (order: Pick<RestockOrder, "id" | "branchId">) => string;
  /** Bandeja de surtido (al cerrar una hoja sin historial). */
  inbox: string;
  /** Texto de los enlaces de regreso (por omisión, "Volver a los pedidos"). */
  backLabel?: string;
  /**
   * La caja de una sucursal con "La caja hace su pedido a fábrica": ve, edita
   * y envía SU pedido sin el permiso de surtido (lo autoriza la sucursal, no
   * el perfil). Ve los montos, pero no edita los cargos de fábrica.
   */
  cashierRestock?: boolean;
}

export const DASHBOARD_POS_LINKS: PosLinks = {
  review: (branchId, vista) => `/dashboard/pos/sucursales/${branchId}/pedido${vista === "formato" ? "?vista=formato" : ""}`,
  orderSheet: (orderId, edit = false) => `/dashboard/pos/surtido/pedidos/${orderId}${edit ? "?modo=editar" : ""}`,
  branchOrders: (branchId) => `/dashboard/pos/sucursales/${branchId}?tab=pedidos`,
  arrival: (order) => `/dashboard/pos/sucursales/${order.branchId}/entrada?order=${order.id}`,
  inbox: "/dashboard/pos/surtido",
};

/** Rutas de la app del supervisor de caja. No recibe surtido: la llegada sigue en el panel. */
export const SUPERVISOR_POS_LINKS: PosLinks = {
  review: (branchId, vista) => `/supervisor/pedidos/${branchId}${vista === "formato" ? "?vista=formato" : ""}`,
  orderSheet: (orderId) => `/supervisor/pedidos/orden/${orderId}`,
  branchOrders: () => "/supervisor/pedidos",
  arrival: DASHBOARD_POS_LINKS.arrival,
  inbox: "/supervisor/pedidos",
};

/** Rutas de la caja (`/pos/pedido`): solo su sucursal; volver es volver a cobrar. */
export const CASHIER_POS_LINKS: PosLinks = {
  review: (branchId, vista) => `/pos/pedido/${branchId}${vista === "formato" ? "?vista=formato" : ""}`,
  orderSheet: (orderId) => `/pos/pedido/orden/${orderId}`,
  branchOrders: () => "/pos",
  arrival: DASHBOARD_POS_LINKS.arrival,
  inbox: "/pos",
  backLabel: "Volver a la caja",
  cashierRestock: true,
};

const PosLinksContext = createContext<PosLinks>(DASHBOARD_POS_LINKS);

export function PosLinksProvider({ links, children }: { links: PosLinks; children: ReactNode }) {
  return <PosLinksContext.Provider value={links}>{children}</PosLinksContext.Provider>;
}

export function usePosLinks(): PosLinks {
  return useContext(PosLinksContext);
}
