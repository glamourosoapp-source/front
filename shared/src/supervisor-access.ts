/**
 * Matriz del supervisor de caja (`users.supervisor_access`): en qué sucursales
 * ve la apertura, cuenta inventario, manda pedidos a fábrica y ve cortes. La
 * pone el admin en la ficha del usuario. El perfil sigue siendo el tope: una
 * casilla no da lo que el perfil no da.
 */
export const SUPERVISOR_CAPABILITIES = ["status", "counts", "restock", "cuts"] as const;

export type SupervisorCapability = (typeof SUPERVISOR_CAPABILITIES)[number];

export const SUPERVISOR_CAPABILITY_LABELS: Record<SupervisorCapability, string> = {
  status: "Apertura",
  counts: "Conteos",
  restock: "Pedidos",
  cuts: "Cortes",
};

/** `{ [branchId]: capacidades }`. `null` = sin límite por sucursal. */
export type SupervisorAccess = Record<string, SupervisorCapability[]>;

/**
 * Sucursales donde la matriz da esa capacidad. `null` = sin límite (todas):
 * es lo que pasa sin matriz, salvo con Cortes, que solo existe por matriz y
 * sin ella no da ninguna (`[]`).
 */
export function supervisorBranchIds(
  access: SupervisorAccess | null | undefined,
  capability: SupervisorCapability
): string[] | null {
  if (!access) return capability === "cuts" ? [] : null;
  return Object.entries(access)
    .filter(([, capabilities]) => Array.isArray(capabilities) && capabilities.includes(capability))
    .map(([branchId]) => branchId);
}

/** Sucursales con al menos una casilla (las que el supervisor llega a ver). `null` = todas. */
export function supervisorVisibleBranchIds(access: SupervisorAccess | null | undefined): string[] | null {
  if (!access) return null;
  return Object.entries(access)
    .filter(([, capabilities]) => Array.isArray(capabilities) && capabilities.length > 0)
    .map(([branchId]) => branchId);
}
