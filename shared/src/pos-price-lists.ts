/**
 * Listas de precios por ciudad (Tepic, Tapachula…).
 *
 * El catálogo es el precio general. Una sucursal con lista cobra con el
 * renglón de su lista; lo que la lista no trae cae al precio general. Estas
 * funciones son la regla única que usan el catálogo de la caja, el cobro del
 * servidor y la vista previa del Excel.
 */

export interface PriceListOverride {
  price: number | string;
  /** null = la lista no fija mayoreo: aplica el mayoreo general. */
  wholesalePrice?: number | string | null;
}

export interface EffectivePrice {
  price: number;
  wholesalePrice: number | null;
}

/** Precio que cobra una sucursal: el de su lista si lo trae, si no el general. */
export function applyPriceListOverride(
  base: { price: number | string; wholesalePrice?: number | string | null },
  override?: PriceListOverride | null
): EffectivePrice {
  const baseWholesale =
    base.wholesalePrice === null || base.wholesalePrice === undefined
      ? null
      : Number(base.wholesalePrice);
  if (!override) return { price: Number(base.price || 0), wholesalePrice: baseWholesale };
  const wholesale =
    override.wholesalePrice === null || override.wholesalePrice === undefined
      ? baseWholesale
      : Number(override.wholesalePrice);
  return { price: Number(override.price || 0), wholesalePrice: wholesale };
}

/**
 * Nombre para empatar el Excel de eleventa con el catálogo: mayúsculas, sin
 * acentos y con los espacios colapsados. El número de renglón de eleventa NO
 * sirve para empatar: se recorre al insertar productos (desde ALMOROL el
 * renglón 421 ya es otro producto).
 */
export function normalizePriceListName(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface PriceListSheetRow {
  name: string;
  price: number;
  wholesalePrice: number | null;
}

/** Litros de la presentación si el nombre termina en "N LITRO(S)". */
function presentationLiters(name: string): { family: string; liters: number } | null {
  const match = normalizePriceListName(name).match(/^(.*?)\s+(\d+(?:\.\d+)?)\s+LITROS?$/);
  if (!match) return null;
  return { family: match[1], liters: Number(match[2]) };
}

/**
 * Avisos por renglón del Excel de precios, para que el administrador los
 * revise antes de guardar (no bloquean). Índice = posición en `rows`.
 *
 * - mayoreo mayor que la venta (ACEITE DE MOP 20 L: $12,020 contra $1,020);
 * - precio en cero;
 * - nombre repetido en el mismo Excel;
 * - una presentación más grande que cuesta igual o menos que una más chica de
 *   la misma familia (SH CON CERA 10 L a $115 con el de 5 L a $125).
 */
export function priceListSheetWarnings(rows: readonly PriceListSheetRow[]): Map<number, string[]> {
  const warnings = new Map<number, string[]>();
  const add = (index: number, message: string) => {
    const list = warnings.get(index) ?? [];
    if (!list.includes(message)) list.push(message);
    warnings.set(index, list);
  };

  const seen = new Map<string, number>();
  const families = new Map<string, Array<{ index: number; liters: number; price: number }>>();

  rows.forEach((row, index) => {
    if (!(row.price > 0)) add(index, "Precio de venta en cero");
    if (row.wholesalePrice !== null && row.wholesalePrice > row.price) {
      add(index, `Mayoreo ($${row.wholesalePrice}) mayor que la venta ($${row.price})`);
    }
    const key = normalizePriceListName(row.name);
    const first = seen.get(key);
    if (first !== undefined) {
      add(index, "Nombre repetido en el Excel");
      add(first, "Nombre repetido en el Excel");
    } else {
      seen.set(key, index);
    }
    const presentation = presentationLiters(row.name);
    if (presentation) {
      const list = families.get(presentation.family) ?? [];
      list.push({ index, liters: presentation.liters, price: row.price });
      families.set(presentation.family, list);
    }
  });

  for (const list of families.values()) {
    const sorted = [...list].sort((a, b) => a.liters - b.liters);
    for (let i = 1; i < sorted.length; i++) {
      const smaller = sorted[i - 1];
      const bigger = sorted[i];
      if (bigger.liters > smaller.liters && bigger.price > 0 && bigger.price <= smaller.price) {
        add(
          bigger.index,
          `Cuesta igual o menos ($${bigger.price}) que la presentación de ${smaller.liters} L ($${smaller.price})`
        );
      }
    }
  }

  return warnings;
}

/** Cambio contra el precio general que amerita revisarse (±40 %). */
export const PRICE_LIST_BIG_CHANGE = 0.4;

export function priceChangeWarning(basePrice: number, listPrice: number): string | null {
  if (!(basePrice > 0) || !(listPrice > 0)) return null;
  const change = (listPrice - basePrice) / basePrice;
  if (Math.abs(change) < PRICE_LIST_BIG_CHANGE) return null;
  const pct = Math.round(change * 100);
  return `${pct > 0 ? "+" : ""}${pct} % contra el precio general ($${basePrice})`;
}
