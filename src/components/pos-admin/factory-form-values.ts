import type { FactoryForm, FactoryFormCharges, FactoryFormRow } from "@glamouroso/shared";
import {
  allRows,
  isLinked,
  packsOf,
  round2,
  rowKey,
  targetTotals,
  toBase,
  type SheetValues,
} from "./FactoryFormSheet";

/**
 * Cuentas de una hoja del formato capturada en pantalla (entrada de surtido y
 * hoja de un pedido): lo capturado por renglón, los cargos del pie y el
 * `FactoryForm` con esas cantidades para bajarlo en PDF.
 */

export interface CapturedRow {
  row: FactoryFormRow;
  packs: number;
  /** Litros o piezas que representan los empaques. */
  base: number;
  /** A precio del renglón (o costo del catálogo si el renglón no trae precio). */
  amount: number;
}

/**
 * Importe de un renglón como lo cobra el formato de tiendas: empaques × precio
 * a tienda del renglón; sin precio, piezas o litros × costo del catálogo. Es la
 * misma regla del total del pedido en el Back, así que todas las pantallas
 * muestran el mismo total.
 */
export function rowAmount(row: FactoryFormRow, packs: number): number {
  if (row.unitPrice != null && Number(row.unitPrice) > 0) return round2(packs * Number(row.unitPrice));
  return round2(packs * row.packSize * (row.unitCost ?? 0));
}

export interface SheetCharges {
  transparent: number;
  color: number;
  bidones: number;
  blue: number;
  blueAmount: number;
  publicityAmount: number;
  /** Envío (flete) en pesos. */
  shippingAmount: number;
  total: number;
}

/**
 * Una entrada por renglón con cantidad. Un producto repartido en varios
 * renglones (uno por color/aroma) sale una vez por renglón; para mandarlo al
 * Back se suma por producto con `capturedTargets`.
 */
export function capturedRows(rows: FactoryFormRow[], values: SheetValues): CapturedRow[] {
  const list: CapturedRow[] = [];
  for (const row of rows) {
    if (!isLinked(row)) continue;
    const packs = packsOf(values[rowKey(row)]);
    if (packs <= 0) continue;
    const base = toBase(values[rowKey(row)], row.packSize);
    list.push({ row, packs, base, amount: rowAmount(row, packs) });
  }
  return list;
}

/** Lo capturado sumado por línea/producto (una partida por cada uno), solo lo que trae cantidad. */
export function capturedTargets(rows: FactoryFormRow[], values: SheetValues) {
  return [...targetTotals(rows, values).values()].filter((total) => total.packs > 0);
}

export function capturedTotals(captured: CapturedRow[]) {
  return captured.reduce(
    (acc, item) => ({
      liters: round2(acc.liters + (item.row.lineId ? item.base : 0)),
      pieces: round2(acc.pieces + (item.row.lineId ? 0 : item.base)),
      amount: round2(acc.amount + item.amount),
    }),
    { liters: 0, pieces: 0, amount: 0 }
  );
}

/**
 * Cargos del pie con lo capturado: bidones vacíos y cajas azules (reglas del
 * formato de tiendas) más la publicidad y el envío, que se capturan en pesos.
 */
export function sheetCharges(
  captured: CapturedRow[],
  prices: FactoryFormCharges | undefined,
  amounts: { publicity: string | number; shipping: string | number }
): SheetCharges {
  let transparent = 0;
  let color = 0;
  let blue = 0;
  for (const { row, packs } of captured) {
    if (row.bidon === "transparent") transparent += packs;
    if (row.bidon === "color") color += packs;
    if (row.blueBox) blue += packs;
  }
  const money = (value: string | number) => round2(Math.max(0, Number(value) || 0));
  const bidones = round2(transparent * (prices?.bidonTransparent ?? 0) + color * (prices?.bidonColor ?? 0));
  const blueAmount = round2(blue * (prices?.blueBox ?? 0));
  const publicityAmount = money(amounts.publicity);
  const shippingAmount = money(amounts.shipping);
  return {
    transparent,
    color,
    bidones,
    blue,
    blueAmount,
    publicityAmount,
    shippingAmount,
    total: round2(bidones + blueAmount + publicityAmount + shippingAmount),
  };
}

/**
 * El formato con las cantidades de la pantalla, listo para `exportFactoryFormPdf`.
 * Sin `canSeeCosts` salen las cantidades sin importes.
 */
export function formWithValues(
  form: FactoryForm,
  values: SheetValues,
  charges: SheetCharges,
  canSeeCosts: boolean
): FactoryForm {
  // Cada renglón con su propio número (un producto repartido sale en todos sus renglones).
  const withValues = (row: FactoryFormRow): FactoryFormRow => {
    if (!isLinked(row)) return row;
    const packs = packsOf(values[rowKey(row)]);
    const amount = packs > 0 && canSeeCosts ? rowAmount(row, packs) : null;
    return { ...row, qty: packs > 0 ? round2(packs) : null, amount, unitCost: canSeeCosts ? row.unitCost : null };
  };
  const pages = form.pages.map((p) => ({ ...p, blocks: p.blocks.map((block) => block.map(withValues)) }));
  const rowsTotal = (blocks: FactoryFormRow[][]) => blocks.flat().reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const extras = form.extras.map(withValues);
  const last = pages.length - 1;
  const priced = pages.map((p, index) => ({
    ...p,
    total: canSeeCosts
      ? round2(
          rowsTotal(p.blocks) +
            (p.page === 1 ? charges.bidones : 0) +
            (index === last
              ? rowsTotal([extras]) + charges.blueAmount + charges.publicityAmount + charges.shippingAmount
              : 0)
        )
      : 0,
  }));
  return {
    ...form,
    pages: priced,
    extras,
    bidones: {
      transparent: {
        qty: charges.transparent,
        amount: canSeeCosts ? round2(charges.transparent * (form.charges?.bidonTransparent ?? 0)) : 0,
      },
      color: {
        qty: charges.color,
        amount: canSeeCosts ? round2(charges.color * (form.charges?.bidonColor ?? 0)) : 0,
      },
    },
    blueBoxes: { qty: charges.blue, amount: canSeeCosts ? charges.blueAmount : 0 },
    publicity: { qty: charges.publicityAmount > 0 ? 1 : 0, amount: canSeeCosts ? charges.publicityAmount : 0 },
    shipping: { amount: canSeeCosts ? charges.shippingAmount : 0 },
    grandTotal: canSeeCosts ? round2(priced.reduce((sum, p) => sum + p.total, 0)) : 0,
  };
}

/** Valores iniciales de la hoja: la cantidad de cada renglón (ya repartida por el Back). */
export function initialValues(form: FactoryForm): SheetValues {
  const initial: SheetValues = {};
  for (const row of allRows(form)) {
    if (isLinked(row)) initial[rowKey(row)] = row.qty ? String(round2(row.qty)) : "";
  }
  return initial;
}
