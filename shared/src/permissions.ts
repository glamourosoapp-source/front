import { ADMIN_ROLES, ORDER_SCOPES, PERMISSION_MODULES } from "./constants";
import type { OrderScope, PermissionAction, PermissionModule } from "./constants";

export interface ModulePermissions {
  view?: boolean;
  create?: boolean;
  update?: boolean;
  delete?: boolean;
  /**
   * Aplica a "orders" y "customers" (own/team/all) y a "customerFollowup"
   * (solo own/team): limita lectura/edición a lo del usuario o de su equipo.
   */
  scope?: OrderScope;
}

export type PermissionMap = Partial<Record<PermissionModule, ModulePermissions>>;

const FULL_ACCESS: PermissionMap = Object.fromEntries(
  PERMISSION_MODULES.map((module) => [
    module.key,
    { view: true, create: true, update: true, delete: true, scope: ORDER_SCOPES.ALL },
  ])
) as PermissionMap;

/** Usuarios sin perfil asignado conservan el comportamiento histórico: todo excepto configuración, usuarios, costo de productos e impresión de notas. */
const LEGACY_FALLBACK: PermissionMap = Object.fromEntries(
  PERMISSION_MODULES.map((module) => [
    module.key,
    module.key === "settings" ||
    module.key === "users" ||
    module.key === "productCosts" ||
    module.key === "orderPrint"
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

/** Scope efectivo de pedidos —los borradores lo heredan, son filas de `orders`—; cualquier valor distinto de "own"/"team" se trata como "all". */
export function getOrderScope(permissions: PermissionMap | null | undefined): OrderScope {
  const scope = permissions?.orders?.scope;
  return scope === ORDER_SCOPES.OWN || scope === ORDER_SCOPES.TEAM ? scope : ORDER_SCOPES.ALL;
}

/** Scope efectivo de clientes; cualquier valor distinto de "own"/"team" se trata como "all". */
export function getCustomerScope(permissions: PermissionMap | null | undefined): OrderScope {
  const scope = permissions?.customers?.scope;
  return scope === ORDER_SCOPES.OWN || scope === ORDER_SCOPES.TEAM ? scope : ORDER_SCOPES.ALL;
}

/**
 * Scope de Seguimiento de clientes: "team" ve la cartera de todo su equipo,
 * cualquier otro valor (own, ausente, all) es "own". No existe "all" para este
 * módulo: ver a todos es cosa del rol admin, no del perfil.
 */
export function getCustomerFollowupScope(
  permissions: PermissionMap | null | undefined
): typeof ORDER_SCOPES.OWN | typeof ORDER_SCOPES.TEAM {
  return permissions?.customerFollowup?.scope === ORDER_SCOPES.TEAM ? ORDER_SCOPES.TEAM : ORDER_SCOPES.OWN;
}

/** Indica si el rol del usuario es administrador (bypass total: FULL_ACCESS incluye productCosts). */
export function isAdminRole(role: string | null | undefined): boolean {
  return Boolean(role && ADMIN_ROLES.includes(role));
}
