"use client";

import { useRef } from "react";
import { Tab, Tabs } from "@mui/material";
import type { FactoryForm, FactoryFormRow } from "@glamouroso/shared";
import { formatQuantity } from "@/lib/format-money";

/**
 * La hoja de pedido a fábrica como pantalla de captura: las mismas 4 hojas y
 * los mismos renglones del papel, con un campo por renglón. La usan la captura
 * de stock mínimo y la entrada de surtido. Las cantidades van en **empaques**
 * (2 = dos bidones), como se escriben a pluma; junto al campo se muestra la
 * equivalencia en litros o piezas.
 */

/** Qué trae cada hoja del formato, para que la pestaña diga algo más que "Hoja 2". */
export const PAGE_HINTS: Record<number, string> = {
  0: "Fuera del formato",
  1: "Líquidos, envases y tapas",
  2: "Fibras, cestos y trapeadores",
  3: "Cepillos, aerosoles y bolsas",
  4: "Guantes, albercas y miniaturas",
};

export type SheetValues = Record<string, string>;

export interface SheetPage {
  page: number;
  blocks: FactoryFormRow[][];
}

/**
 * Posición del renglón en la hoja: llave de React y de los valores capturados.
 * Cada renglón lleva su propio número aunque varios apunten al mismo producto
 * (un renglón por color/aroma: el Back reparte la cantidad entre ellos).
 */
export function rowKey(row: FactoryFormRow): string {
  return `${row.page}:${row.block}:${row.row}`;
}

/** A qué línea o producto apunta el renglón: al guardar se suma por esta llave. */
export function targetKey(row: FactoryFormRow): string {
  return row.lineId ? `line:${row.lineId}` : `product:${row.productId}`;
}

/** Lo capturado de una línea o producto, sumado entre los renglones que la reparten. */
export interface TargetTotal {
  key: string;
  /** Sus renglones en el orden de la hoja; el primero da `lineId`/`productId`. */
  rows: FactoryFormRow[];
  lineId: string | null;
  productId: string | null;
  /** Empaques: todos los renglones de un producto llevan el mismo empaque. */
  packs: number;
  /** Litros o piezas (empaques × empaque de cada renglón). */
  base: number;
}

/**
 * Suma por línea/producto lo capturado renglón por renglón: es lo que se manda
 * al Back (una entrada por línea o producto, como antes del reparto).
 */
export function targetTotals(rows: FactoryFormRow[], values: SheetValues): Map<string, TargetTotal> {
  const totals = new Map<string, TargetTotal>();
  for (const row of rows) {
    if (!isLinked(row)) continue;
    const key = targetKey(row);
    const value = values[rowKey(row)];
    const total = totals.get(key) ?? {
      key,
      rows: [],
      lineId: row.lineId ?? null,
      productId: row.lineId ? null : (row.productId ?? null),
      packs: 0,
      base: 0,
    };
    total.rows.push(row);
    total.packs = round2(total.packs + packsOf(value));
    total.base = round2(total.base + toBase(value, row.packSize));
    totals.set(key, total);
  }
  return totals;
}

/** "BLANCO MENTA / AMARILLO COCO": los renglones que reparten una línea o producto. */
export function targetLabel(total: Pick<TargetTotal, "rows">): string {
  return total.rows.map((row) => row.label).join(" / ");
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Renglón capturable: producto ligado a una línea o a un producto del catálogo. */
export function isLinked(row: FactoryFormRow): boolean {
  return row.kind === "product" && Boolean(row.lineId || row.productId);
}

export function unitOf(row: FactoryFormRow): string {
  return row.lineId ? "L" : "pz";
}

/** "bidón 20 L", "garrafa 5 L", "caja ×24", "pieza". */
export function packDescription(row: FactoryFormRow): string {
  if (row.lineId) return `${row.packLabel} ${formatQuantity(row.packSize)} L`;
  if (row.packSize > 1) return `${row.packLabel} ×${formatQuantity(row.packSize)}`;
  return "pieza";
}

/** Empaques capturados (texto del campo) → número; vacío o inválido = 0. */
export function packsOf(value: string | undefined): number {
  const packs = Number(value);
  return Number.isFinite(packs) && packs > 0 ? packs : 0;
}

/** Empaques → litros o piezas. */
export function toBase(value: string | undefined, packSize: number): number {
  return round2(packsOf(value) * Math.max(1, packSize));
}

export function sameValue(a: string | undefined, b: string | undefined): boolean {
  return (Number(a) || 0) === (Number(b) || 0);
}

/** Todos los renglones del formato más los de OTROS. */
export function allRows(form: FactoryForm): FactoryFormRow[] {
  return [...form.pages.flatMap((page) => page.blocks.flat()), ...form.extras];
}

/** Las hojas del formato en orden, más la pestaña "Otros" cuando hay renglones fuera del formato. */
export function sheetPages(form: FactoryForm): SheetPage[] {
  const list = [...form.pages].sort((a, b) => a.page - b.page).map((p) => ({ page: p.page, blocks: p.blocks }));
  if (form.extras.length) list.push({ page: 0, blocks: [form.extras] });
  return list;
}

export function unlinkedCount(form: FactoryForm): number {
  return form.pages.flatMap((p) => p.blocks.flat()).filter((r) => r.kind === "product" && !isLinked(r)).length;
}

interface FactoryFormSheetProps {
  pages: SheetPage[];
  page: number;
  onPageChange: (page: number) => void;
  values: SheetValues;
  /** Contra qué se marcan las filas cambiadas (lo guardado o lo precargado). */
  baseline: SheetValues;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  /** Encabezado de la columna capturable ("Stock", "Cant"). */
  qtyHeader: string;
  /** Prefijo del `aria-label` de cada campo ("Stock de", "Cantidad de"). */
  inputLabel: string;
  /** Solo lectura: la cantidad se pinta como texto, no como campo. */
  readOnly?: boolean;
  /** Esconde los renglones sin cantidad (y las secciones), para leer rápido cómo quedó un pedido. */
  onlyFilled?: boolean;
}

/** Cuántos renglones con cantidad trae una hoja. */
export function filledCount(page: SheetPage, values: SheetValues): number {
  return page.blocks.flat().filter((row) => isLinked(row) && packsOf(values[rowKey(row)]) > 0).length;
}

export function FactoryFormSheet({
  pages,
  page,
  onPageChange,
  values,
  baseline,
  onChange,
  disabled = false,
  qtyHeader,
  inputLabel,
  readOnly = false,
  onlyFilled = false,
}: FactoryFormSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const current = pages.find((p) => p.page === page) ?? pages[0];

  /** Enter / flecha abajo: siguiente renglón de la hoja; flecha arriba: el anterior. */
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const delta = event.key === "Enter" || event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    // En un input numérico las flechas cambian el valor: aquí mueven de renglón.
    event.preventDefault();
    const inputs = Array.from(sheetRef.current?.querySelectorAll<HTMLInputElement>("input[data-msf]") ?? []);
    const next = inputs[inputs.indexOf(event.currentTarget) + delta];
    if (next) {
      next.focus();
      next.select();
    }
  }

  return (
    <>
      <Tabs
        value={current?.page ?? 1}
        onChange={(_e, value) => onPageChange(value as number)}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {pages.map((p) => (
          <Tab
            key={p.page}
            value={p.page}
            label={
              <span className="msf-tab">
                <strong>
                  {p.page === 0 ? "Otros" : `Hoja ${p.page}`}
                  {readOnly || onlyFilled ? ` · ${filledCount(p, values)}` : ""}
                </strong>
                <span>{PAGE_HINTS[p.page] ?? ""}</span>
              </span>
            }
          />
        ))}
      </Tabs>

      {current ? (
        <div className="msf-sheet" ref={sheetRef} key={current.page}>
          {onlyFilled && !filledCount(current, values) ? (
            <p className="page-kicker" style={{ margin: 0 }}>
              Esta hoja no trae cantidades.
            </p>
          ) : null}
          {current.blocks.map((block, blockIndex) => {
            const visible = onlyFilled
              ? block.filter((row) => isLinked(row) && packsOf(values[rowKey(row)]) > 0)
              : block;
            if (!visible.length) return null;
            return (
            <div className="msf-block" key={blockIndex}>
              <div className="msf-head">
                <span>Producto</span>
                <span>Empaque</span>
                <span>{qtyHeader}</span>
              </div>
              {visible.map((row) => {
                if (row.kind === "blank") return null;
                const key = rowKey(row);
                if (row.kind === "section") {
                  return (
                    <div className="msf-section" key={key}>
                      {row.label}
                    </div>
                  );
                }
                if (!isLinked(row)) {
                  return (
                    <div className="msf-row msf-row--unlinked" key={key} title="Sin ligar al catálogo">
                      <span className="msf-label">{row.label}</span>
                      <span className="msf-pack">sin ligar</span>
                      <span />
                    </div>
                  );
                }
                const value = values[key] ?? "";
                const dirty = !sameValue(value, baseline[key]);
                const base = toBase(value, row.packSize);
                return (
                  <div className={`msf-row${dirty ? " msf-row--dirty" : ""}`} key={key}>
                    <span className="msf-label" title={row.label}>
                      {row.label}
                    </span>
                    <span className="msf-pack">
                      {packDescription(row)}
                      {row.packSize > 1 && base > 0 ? (
                        <em>
                          = {formatQuantity(base)} {unitOf(row)}
                        </em>
                      ) : null}
                    </span>
                    {readOnly ? (
                      <strong className="msf-input" style={{ textAlign: "right", alignSelf: "center" }}>
                        {packsOf(value) > 0 ? formatQuantity(packsOf(value)) : ""}
                      </strong>
                    ) : (
                    <input
                      data-msf
                      className="input msf-input"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={value}
                      disabled={disabled}
                      aria-label={`${inputLabel} ${row.label}`}
                      onChange={(event) => onChange(key, event.target.value)}
                      onKeyDown={onKeyDown}
                      onFocus={(event) => event.currentTarget.select()}
                      // La rueda del mouse sobre un input numérico enfocado cambia el valor sin querer.
                      onWheel={(event) => event.currentTarget.blur()}
                    />
                    )}
                  </div>
                );
              })}
            </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
