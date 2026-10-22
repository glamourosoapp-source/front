"use client";

import { useCallback, useMemo } from "react";
import { isAdminRole, supervisorBranchIds } from "@glamouroso/shared";
import type { SupervisorCapability } from "@glamouroso/shared";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Alcance por sucursal del supervisor de caja: la matriz de su ficha
 * (`supervisorAccess`), que pone el admin. El Back la hace cumplir; aquí solo
 * se esconde lo que no le toca. Sin matriz no hay límite, salvo Cortes, que
 * solo existe por matriz.
 */
export function useSupervisorScope() {
  const role = useAuthStore((s) => s.user?.role);
  const supervisorAccess = useAuthStore((s) => s.user?.supervisorAccess);
  const access = useMemo(
    () => (isAdminRole(role) ? null : (supervisorAccess ?? null)),
    [role, supervisorAccess],
  );

  /** Sucursales con esa casilla; `null` = todas. */
  const ids = useCallback((capability: SupervisorCapability) => supervisorBranchIds(access, capability), [access]);

  const allows = useCallback(
    (capability: SupervisorCapability, branchId: string) => {
      const scope = supervisorBranchIds(access, capability);
      return scope === null || scope.includes(branchId);
    },
    [access],
  );

  return { ids, allows };
}
