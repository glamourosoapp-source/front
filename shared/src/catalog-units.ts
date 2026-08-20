export const PRODUCT_UNITS = ["pieza", "litro", "kilo", "galón", "bidón", "botella"] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const UNIT_SYNONYMS: Record<string, ProductUnit> = {
  pieza: "pieza",
  piezas: "pieza",
  pza: "pieza",
  pzs: "pieza",
  litro: "litro",
  litros: "litro",
  lt: "litro",
  lts: "litro",
  l: "litro",
  kilo: "kilo",
  kilos: "kilo",
  kg: "kilo",
  kgs: "kilo",
  galon: "galón",
  galón: "galón",
  galones: "galón",
  gal: "galón",
  bidon: "bidón",
  bidón: "bidón",
  bidones: "bidón",
  botella: "botella",
  botellas: "botella",
  bot: "botella",
};

export interface ParsedProductCatalogFields {
  unit: ProductUnit;
  unitType: string | null;
  unitsPerPackage: number | null;
  presentation: string | null;
  productGroupKey: string | null;
}

export function normalizeUnit(value: string): ProductUnit {
  const key = value.trim().toLowerCase();
  return UNIT_SYNONYMS[key] ?? "pieza";
}

export function extractPresentation(name: string): string | null {
  const upper = name.toUpperCase();
  const liters = upper.match(/\b(\d+(?:\.\d+)?)\s*LITROS?\b/);
  if (liters) return `${liters[1]}L`;
  const ml = upper.match(/\b(\d+(?:\.\d+)?)\s*ML\b/);
  if (ml) return `${ml[1]}ml`;
  const kg = upper.match(/\b(\d+(?:\.\d+)?)\s*(?:KG|KILOS?)\b/);
  if (kg) return `${kg[1]}kg`;
  return null;
}

export function extractProductGroupKey(name: string): string | null {
  const presentation = extractPresentation(name);
  let group = name.trim();
  if (presentation) {
    group = group
      .replace(new RegExp(`\\b${presentation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "")
      .replace(/\b\d+(?:\.\d+)?\s*(?:LITROS?|ML|KG|KILOS?|GAL(?:ONES?)?)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return group.length >= 3 ? group.slice(0, 80) : null;
}

export function inferProductUnit(name: string): ProductUnit {
  const upper = name.toUpperCase();
  if (/\b\d+\s*LITROS?\b|\bLITRO\b/.test(upper) && !/\bML\b/.test(upper)) return "litro";
  if (/\bKG\b|\bKILOS?\b/.test(upper)) return "kilo";
  if (/\bGAL\b|\bGALON/.test(upper)) return "galón";
  if (/\bBIDON\b|\bBIDÓN\b/.test(upper)) return "bidón";
  if (/\bBOTELLA\b/.test(upper)) return "botella";
  return "pieza";
}

export function parseProductCatalogFields(name: string): ParsedProductCatalogFields {
  const unit = inferProductUnit(name);
  const presentation = extractPresentation(name);
  const productGroupKey = extractProductGroupKey(name);

  const cajaMatch = name.match(/(\d+)\s*(?:pza|pzs|piezas?)/i);
  if (cajaMatch) {
    return {
      unit: "pieza",
      unitType: "caja",
      unitsPerPackage: Number(cajaMatch[1]),
      presentation,
      productGroupKey,
    };
  }

  return {
    unit,
    unitType: null,
    unitsPerPackage: null,
    presentation,
    productGroupKey,
  };
}

/**
 * Categorías cuyas presentaciones de 20 L salen en bidón retornable. Los
 * plásticos/jarciería comparten la presentación "20 LITROS" (cesto papelero,
 * cubeta, palangana) y no llevan bidón. Espejo de la regla del agente en
 * `Agent/agent/lib/ops/bidon.ts` (carriesBidon): cambios van a ambos lados.
 */
const CONTAINER_CATEGORIES = new Set(["liquidos", "limpieza a granel"]);

function normalizeCategory(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[_\s]+/g, " ")
    .toLowerCase();
}

/**
 * True si el producto agrega un bidón retornable al pedido: presentación 20L
 * de una línea líquida. Acepta el nombre visible o el externalCode del POS.
 */
export function carriesReturnableContainer(
  presentation: string | null | undefined,
  categoryName: string | null | undefined
): boolean {
  if ((presentation ?? "").trim().toUpperCase() !== "20L") return false;
  return CONTAINER_CATEGORIES.has(normalizeCategory(categoryName));
}

/** Producto del que se deriva la regla de bidón (catálogo del panel o modelo del Back). */
export interface ReturnableContainerProduct {
  name: string;
  variants?: Record<string, unknown> | null;
  category?: { name?: string | null; externalCode?: string | null } | null;
}

/**
 * Override manual por producto: `variants.bidon` (true/false, o "true"/"false"
 * si vino de un formulario). `true` cobra bidón aunque no sea 20L (hay 10L que
 * salen en bidón de 20), `false` lo apaga, ausente = regla automática de 20L.
 */
export function returnableContainerOverride(
  variants: Record<string, unknown> | null | undefined
): boolean | null {
  const value = variants?.bidon;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/**
 * Igual que `carriesReturnableContainer`, resolviendo presentación y categoría
 * desde el producto: `variants.presentacion` la puebla el importador y el
 * catálogo capturado a mano cae al nombre. `variants.bidon` (checkbox del
 * catálogo) manda sobre la regla automática. Front y Back derivan el conteo de
 * bidones de un pedido con esta misma función (el panel ya no lo captura).
 */
export function productCarriesReturnableContainer(product: ReturnableContainerProduct): boolean {
  const override = returnableContainerOverride(product.variants);
  if (override !== null) return override;
  const fromVariants = product.variants?.presentacion;
  const presentation =
    typeof fromVariants === "string" && fromVariants.trim()
      ? fromVariants.trim()
      : extractPresentation(product.name);
  const categoryName = product.category?.name ?? product.category?.externalCode ?? null;
  return carriesReturnableContainer(presentation, categoryName);
}

export function categoryDisplayName(externalCode: string): string {
  const code = externalCode.trim().toUpperCase();
  const labels: Record<string, string> = {
    LIQUIDOS: "Líquidos",
    JARCIERIA: "Jarciería",
    PLASTICOS: "Plásticos",
    SEGURIDAD: "Seguridad",
    HIGIENICO: "Higiénico",
    ENVASE: "Envase",
    SIN_CATEGORIA: "Sin categoría",
  };
  if (labels[code]) return labels[code];
  if (!code) return "Sin categoría";
  return code
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
