"use client";

import { useMemo } from "react";
import { can, isAdminRole, resolvePermissions } from "@glamouroso/shared";
import type { PermissionAction, PermissionMap, PermissionModule } from "@glamouroso/shared";
import { useAuthStore } from "@/stores/auth.store";

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
