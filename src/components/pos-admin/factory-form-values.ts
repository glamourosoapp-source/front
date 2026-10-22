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
  /** Bidones vacíos y cajas azules que se cobran: lo capturado a mano o, sin captura, lo calculado. */
  transparent: number;
  color: number;
  bidones: number;
  blue: number;
  blueAmount: number;
  /** Lo que el sistema calcula con los renglones, para "Usar calculado". */
  auto: { transparent: number; color: number; blue: number };
  /** Vacíos que la sucursal regresó a fábrica (al cambio): se restan al mismo precio. */
  returned: {
    transparent: number;
    color: number;
    blue: number;
    /** Descuento de cada tipo, al mismo precio que se cobra. */
    transparentAmount: number;
    colorAmount: number;
    blueAmount: number;
    amount: number;
  };
  publicityAmount: number;
  /** Envío (flete) en pesos. */
  shippingAmount: number;
  /** Cargos sin devoluciones (bidones, cajas azules, publicidad y envío): Producto + Cargos − Devoluciones = Total. */
  total: number;
}

/**
 * Cantidades de bidones vacíos y cajas azules como se escriben en los campos.
 * En las cobradas, `null` = la calculada (sigue a los renglones); en las
 * devueltas, vacío = ninguno.
 */
export interface ChargeQuantityInputs {
  transparent: string | null;
  color: string | null;
  blue: string | null;
  returnedTransparent: string;
  returnedColor: string;
  returnedBlue: string;
}

export const AUTO_CHARGE_QUANTITIES: ChargeQuantityInputs = {
  transparent: null,
  color: null,
  blue: null,
  returnedTransparent: "",
  returnedColor: "",
  returnedBlue: "",
};

/** Las cantidades a mano que trae un formato (las de su pedido), listas para los campos. */
export function chargeQuantityInputs(form: FactoryForm | null | undefined): ChargeQuantityInputs {
  const manual = form?.manualCharges;
  const text = (value: number | null | undefined) => (value == null ? null : String(round2(value)));
  const returned = (value: number | undefined) => (value ? String(round2(value)) : "");
  return {
    transparent: text(manual?.bidonTransparent),
    color: text(manual?.bidonColor),
    blue: text(manual?.blueBox),
    returnedTransparent: returned(form?.returned?.transparent.qty),
    returnedColor: returned(form?.returned?.color.qty),
    returnedBlue: returned(form?.returned?.blueBoxes.qty),
  };
}

/** Lo que se manda al Back: `null` en las cobradas que siguen al cálculo. */
export function chargeQuantityPayload(charges: SheetCharges, inputs: ChargeQuantityInputs, withReturns = false) {
  return {
    bidonTransparentQty: inputs.transparent == null ? null : charges.transparent,
    bidonColorQty: inputs.color == null ? null : charges.color,
    blueBoxQty: inputs.blue == null ? null : charges.blue,
    ...(withReturns
      ? {
          returnedBidonTransparentQty: charges.returned.transparent,
          returnedBidonColorQty: charges.returned.color,
          returnedBlueBoxQty: charges.returned.blue,
        }
      : {}),
  };
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
 * formato de tiendas; se pueden subir o bajar a mano), los vacíos que la
 * sucursal regresó (se restan) y la publicidad y el envío, en pesos.
 */
export function sheetCharges(
  captured: CapturedRow[],
  prices: FactoryFormCharges | undefined,
  amounts: { publicity: string | number; shipping: string | number },
  quantities: Partial<ChargeQuantityInputs> = {}
): SheetCharges {
  const auto = { transparent: 0, color: 0, blue: 0 };
  for (const { row, packs } of captured) {
    if (row.bidon === "transparent") auto.transparent += packs;
    if (row.bidon === "color") auto.color += packs;
    if (row.blueBox) auto.blue += packs;
  }
  auto.transparent = round2(auto.transparent);
  auto.color = round2(auto.color);
  auto.blue = round2(auto.blue);
  const count = (value: string | null | undefined, fallback = 0) =>
    value == null ? fallback : round2(Math.max(0, Number(value) || 0));
  const transparent = count(quantities.transparent, auto.transparent);
  const color = count(quantities.color, auto.color);
  const blue = count(quantities.blue, auto.blue);
  const priceTransparent = prices?.bidonTransparent ?? 0;
  const priceColor = prices?.bidonColor ?? 0;
  const priceBlue = prices?.blueBox ?? 0;
  const bidones = round2(transparent * priceTransparent + color * priceColor);
  const blueAmount = round2(blue * priceBlue);
  const returnedTransparent = count(quantities.returnedTransparent);
  const returnedColor = count(quantities.returnedColor);
  const returnedBlue = count(quantities.returnedBlue);
  const transparentAmount = round2(returnedTransparent * priceTransparent);
  const colorAmount = round2(returnedColor * priceColor);
  const returnedBlueAmount = round2(returnedBlue * priceBlue);
  const returned = {
    transparent: returnedTransparent,
    color: returnedColor,
    blue: returnedBlue,
    transparentAmount,
    colorAmount,
    blueAmount: returnedBlueAmount,
    amount: round2(transparentAmount + colorAmount + returnedBlueAmount),
  };
  const publicityAmount = count(String(amounts.publicity));
  const shippingAmount = count(String(amounts.shipping));
  return {
    transparent,
    color,
    bidones,
    blue,
    blueAmount,
    auto,
    returned,
    publicityAmount,
    shippingAmount,
    total: round2(bidones + blueAmount + publicityAmount + shippingAmount),
  };
}

/**
 * El formato con las cantidades de la pantalla, listo para `exportFactoryFormPdf`.
 * Sin `canSeeCosts` salen las cantidades sin importes (ni totales en $0.00).
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
              ? rowsTotal([extras]) +
                charges.blueAmount +
                charges.publicityAmount +
                charges.shippingAmount -
                charges.returned.amount
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
    returned: returnedForPdf(form, charges, canSeeCosts),
    grandTotal: canSeeCosts ? round2(priced.reduce((sum, p) => sum + p.total, 0)) : 0,
    // Sin costos (o si el Back ya los quitó) el PDF no pinta importes: vacíos, no $0.00.
    amountsHidden: Boolean(form.amountsHidden) || !canSeeCosts,
  };
}

/** Los vacíos devueltos como los lleva el formato (pie de la hoja 4 del PDF). */
function returnedForPdf(form: FactoryForm, charges: SheetCharges, canSeeCosts: boolean): FactoryForm["returned"] {
  const line = (qty: number, price: number | undefined) => ({
    qty,
    amount: canSeeCosts ? round2(qty * (price ?? 0)) : 0,
  });
  return {
    transparent: line(charges.returned.transparent, form.charges?.bidonTransparent),
    color: line(charges.returned.color, form.charges?.bidonColor),
    blueBoxes: line(charges.returned.blue, form.charges?.blueBox),
    amount: canSeeCosts ? charges.returned.amount : 0,
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
