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
