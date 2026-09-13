"use client";

import { useMemo } from "react";
import { can, isAdminRole, resolvePermissions } from "@glamouroso/shared";
import type { PermissionAction, PermissionMap, PermissionModule } from "@glamouroso/shared";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Pantalla donde debe aterrizar un usuario al entrar.
 *
 * El POS trae usuarios que NO viven en el dashboard: un cajero abre la caja, la
 * tablet de fábrica abre los pedidos por enviar y una franquicia su portal. El
 * resto (y cualquier admin) sigue entrando al dashboard como siempre.
 */
export function landingRouteFor(permissions: PermissionMap | null | undefined): string {
  const allows = (module: PermissionModule) => can(permissions, module, "view");
  /**
   * "Usuario del panel" se mide por pedidos u overview, NO por clientes: el
   * perfil Cajero tiene `customers` justamente para registrar a quien compra en
   * mostrador, y con esa lectura aterrizaba en la lista de clientes en vez de
   * la caja.
   */
  const worksInDashboard = allows("dashboard") || allows("orders");
  if (!worksInDashboard) {
    if (allows("pos")) return "/pos";
    if (allows("factory")) return "/fabrica";
    if (allows("franchise")) return "/franquicia";
  }
  return "/dashboard";
}

export function usePermissions() {
  const user = useAuthStore((s) => s.user);

  const permissions: PermissionMap = useMemo(
    () => resolvePermissions(user?.role, user?.profile?.permissions ?? null),
    [user?.role, user?.profile?.permissions]
  );

  const isAdmin = useMemo(() => isAdminRole(user?.role), [user?.role]);

  return {
    permissions,
    isAdmin,
    can: (module: PermissionModule, action: PermissionAction = "view") => can(permissions, module, action),
  };
}
