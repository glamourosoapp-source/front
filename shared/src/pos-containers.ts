import { CONTAINER_MATERIALS, BIDON_LITERS } from "./constants";
import type { ContainerMaterial } from "./constants";
import type { PosContainerRule } from "./entities";

/**
 * Envase y tapa que se descuentan al vender una presentación envasada.
 *
 * Al llegar el líquido, la sucursal llena PET de 1/2, 910 ml, 1, 2, 5 y 10 L
 * (y galón de 4 L en polietileno). Al vender una pieza de esas presentaciones
 * sale, además de los litros de la línea, **1 envase + 1 tapa**. Los litros
 * sueltos (el cliente trae su envase) y el bidón de 20 L no descuentan envase.
 *
 * Las líneas agresivas (quita sarro, desengrasantes, cloro, sosa, hipoclorito)
 * van en polietileno, que solo existe en 1 L y galón: si no hay regla para su
 * tamaño, no se descuenta nada y la venta lleva un aviso.
 */
export type ContainerResolution =
  | { kind: "none"; reason: "bulk" | "bidon" | "no_line" }
  | { kind: "rule"; rule: PosContainerRule }
  | { kind: "missing"; material: ContainerMaterial; liters: number; message: string };

const LITERS_EPSILON = 0.005;

/** Compara litros con tolerancia: 0.91 del catálogo y 0.910 de la regla son lo mismo. */
export function sameLiters(a: number, b: number): boolean {
  return Math.abs(Number(a) - Number(b)) < LITERS_EPSILON;
}

export function findContainerRule(
  rules: readonly PosContainerRule[],
  material: ContainerMaterial,
  liters: number
): PosContainerRule | null {
  return rules.find((rule) => rule.material === material && sameLiters(Number(rule.liters), liters)) ?? null;
}

export function resolveContainerRule(params: {
  rules: readonly PosContainerRule[];
  saleUnit: string;
  lineId?: string | null;
  litersPerUnit?: string | number | null;
  containerMaterial?: ContainerMaterial | null;
}): ContainerResolution {
  if (params.saleUnit === "liter") return { kind: "none", reason: "bulk" };
  if (!params.lineId) return { kind: "none", reason: "no_line" };
  const liters = Number(params.litersPerUnit);
  if (!Number.isFinite(liters) || liters <= 0) return { kind: "none", reason: "no_line" };
  if (liters >= BIDON_LITERS) return { kind: "none", reason: "bidon" };
  const material = params.containerMaterial ?? CONTAINER_MATERIALS.PET;
  const rule = findContainerRule(params.rules, material, liters);
  if (rule && rule.containerProductId && rule.capProductId) return { kind: "rule", rule };
  const label = material === CONTAINER_MATERIALS.POLYETHYLENE ? "polietileno" : "PET";
  return {
    kind: "missing",
    material,
    liters,
    message: rule
      ? `La regla de envase ${label} de ${liters} L no tiene envase o tapa configurados: no se descontó envase.`
      : `No hay envase de ${label} de ${liters} L: no se descontó envase ni tapa.`,
  };
}

/** Tabla por defecto material × litros → nombres exactos del catálogo (los carga la migración). */
export const DEFAULT_CONTAINER_RULES: ReadonlyArray<{
  material: ContainerMaterial;
  liters: number;
  containerName: string;
  capName: string;
}> = [
  { material: "pet", liters: 0.5, containerName: "ENVASE PET 1/2", capName: "TAPA P/ ENVASE  LITRO" },
  { material: "pet", liters: 0.91, containerName: "ENVASE PET 910", capName: "TAPA P/ ENVASE  LITRO" },
  { material: "pet", liters: 1, containerName: "ENVASE PET 1", capName: "TAPA P/ ENVASE  LITRO" },
  { material: "pet", liters: 2, containerName: "ENVASE PET 2 L", capName: "TAPA P/ ENVASE  LITRO" },
  { material: "pet", liters: 4, containerName: "E. POLIET. GALON", capName: "TAPA P/ENVASE GALON" },
  { material: "pet", liters: 5, containerName: "ENV PET 5 L", capName: "TAPA P/ ENVASE 5 LITROS" },
  { material: "pet", liters: 10, containerName: "ENVASE PET 10 LITROS", capName: "TAPA P/ ENVASE 5 LITROS" },
  { material: "polietileno", liters: 1, containerName: "E. POLIET. 1  L ITRO", capName: "TAPA P/ENVASE POLIETILENO LITRO" },
  { material: "polietileno", liters: 4, containerName: "E. POLIET. GALON", capName: "TAPA P/ENVASE GALON" },
];

/** Líneas que por nombre van en polietileno (precarga de la migración; el administrador ajusta). */
export const POLYETHYLENE_LINE_PATTERN = /sarro|desengras|cloro|sosa|hipoclor/i;
