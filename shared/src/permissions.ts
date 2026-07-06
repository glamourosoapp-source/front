import { ADMIN_ROLES, ORDER_SCOPES, PERMISSION_MODULES } from "./constants";
import type { OrderScope, PermissionAction, PermissionModule } from "./constants";

export interface ModulePermissions {
  view?: boolean;
  create?: boolean;
  update?: boolean;
  delete?: boolean;
  /** Aplica a "orders" y "customers": limita lectura/edición a los registros creados por el usuario. */
  scope?: OrderScope;
}

export type PermissionMap = Partial<Record<PermissionModule, ModulePermissions>>;

const FULL_ACCESS: PermissionMap = Object.fromEntries(
  PERMISSION_MODULES.map((module) => [
    module.key,
    { view: true, create: true, update: true, delete: true, scope: ORDER_SCOPES.ALL },
  ])
) as PermissionMap;

/** Usuarios sin perfil asignado conservan el comportamiento histórico: todo excepto configuración y usuarios. */
const LEGACY_FALLBACK: PermissionMap = Object.fromEntries(
  PERMISSION_MODULES.map((module) => [
    module.key,
    module.key === "settings" || module.key === "users"
      ? {}
      : { view: true, create: true, update: true, delete: true, scope: ORDER_SCOPES.ALL },
  ])
) as PermissionMap;

export function resolvePermissions(
  role: string | null | undefined,
  profilePermissions?: PermissionMap | null
): PermissionMap {
  if (role && ADMIN_ROLES.includes(role)) return FULL_ACCESS;
  if (profilePermissions) return profilePermissions;
  return LEGACY_FALLBACK;
}

export function can(
  permissions: PermissionMap | null | undefined,
  module: PermissionModule,
  action: PermissionAction = "view"
): boolean {
  return permissions?.[module]?.[action] === true;
}

/** Scope efectivo de pedidos; cualquier valor distinto de "own" se trata como "all". */
export function getOrderScope(permissions: PermissionMap | null | undefined): OrderScope {
  return permissions?.orders?.scope === ORDER_SCOPES.OWN ? ORDER_SCOPES.OWN : ORDER_SCOPES.ALL;
}

/** Scope efectivo de clientes; cualquier valor distinto de "own" se trata como "all". */
export function getCustomerScope(permissions: PermissionMap | null | undefined): OrderScope {
  return permissions?.customers?.scope === ORDER_SCOPES.OWN ? ORDER_SCOPES.OWN : ORDER_SCOPES.ALL;
}

/** Indica si el rol del usuario es administrador (acceso total y datos sensibles como costo). */
export function isAdminRole(role: string | null | undefined): boolean {
  return Boolean(role && ADMIN_ROLES.includes(role));
}
