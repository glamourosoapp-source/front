"use client";

import { useMemo } from "react";
import { Droplets } from "lucide-react";
import { formatMoney } from "@/lib/format-money";
import type { PosCatalog, PosCatalogLine, PosCatalogProduct } from "@/types";

/** Letras mínimas antes de sugerir: con menos, la lista sería todo el catálogo. */
export const SUGGEST_MIN_CHARS = 3;
const MAX_PRODUCTS = 8;
const MAX_LINES = 3;

export type PosSuggestion =
  | { kind: "product"; key: string; product: PosCatalogProduct }
  | { kind: "line"; key: string; line: PosCatalogLine };

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Puntaje de una coincidencia: primero lo que empieza con lo escrito, luego lo
 * que empieza alguna palabra, al final lo que solo lo contiene. Así "max"
 * muestra "MAX BLANCO" antes que "CLIMAX".
 */
function score(needle: string, ...fields: Array<string | null | undefined>): number {
  let best = 0;
  for (const field of fields) {
    const value = normalize(field);
    if (!value.includes(needle)) continue;
    if (value.startsWith(needle)) return 3;
    if (value.includes(` ${needle}`)) best = Math.max(best, 2);
    else best = Math.max(best, 1);
  }
  return best;
}

/**
 * Sugerencias para el campo de código a partir de `SUGGEST_MIN_CHARS`
 * caracteres. Busca en el catálogo local (nombre, SKU y código de barras) y en
 * las líneas que se venden por litro. Sin red: el catálogo ya está en memoria.
 */
export function usePosSuggestions(catalog: PosCatalog | null, term: string): PosSuggestion[] {
  return useMemo(() => {
    const needle = normalize(term).trim();
    if (!catalog || needle.length < SUGGEST_MIN_CHARS) return [];

    const lines = catalog.lines
      .filter((line) => line.canSellByLiter)
      .map((line) => ({ line, rank: score(needle, line.name) }))
      .filter((row) => row.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.line.name.localeCompare(b.line.name))
      .slice(0, MAX_LINES);

    const products = catalog.products
      .map((product) => ({
        product,
        rank: score(needle, product.name, product.sku, product.barcode, product.posId),
      }))
      .filter((row) => row.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.product.name.localeCompare(b.product.name))
      .slice(0, MAX_PRODUCTS);

    return [
      ...lines.map(({ line }) => ({ kind: "line" as const, key: `line:${line.id}`, line })),
      ...products.map(({ product }) => ({
        kind: "product" as const,
        key: `product:${product.id}`,
        product,
      })),
    ];
  }, [catalog, term]);
}

interface PosCodeSuggestionsProps {
  items: PosSuggestion[];
  /** Índice resaltado con las flechas; -1 cuando ninguno (Enter sigue buscando el código exacto). */
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (item: PosSuggestion) => void;
}

/**
 * Desplegable bajo el campo de código. Se elige con clic o con flechas + Enter;
 * sin fila resaltada, Enter conserva su comportamiento de siempre (buscar el
 * código exacto que mandó el lector).
 */
export function PosCodeSuggestions({ items, activeIndex, onHover, onPick }: PosCodeSuggestionsProps) {
  if (!items.length) return null;
  return (
    <ul className="pos-suggestions" role="listbox" id="pos-code-suggestions">
      {items.map((item, index) => {
        const active = index === activeIndex;
        const className = `pos-suggestion${active ? " is-active" : ""}`;
        if (item.kind === "line") {
          const { line } = item;
          return (
            <li
              key={item.key}
              id={`pos-suggestion-${index}`}
              role="option"
              aria-selected={active}
              className={className}
              onMouseEnter={() => onHover(index)}
              // mousedown y no click: así el campo no pierde el foco antes de agregar.
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(item);
              }}
            >
              <span className="pos-suggestion-code">
                <Droplets size={14} /> GRANEL
              </span>
              <span className="pos-suggestion-name">
                {line.name} <small>· por litro</small>
              </span>
              <span className="pos-suggestion-price">
                {line.literPrice ? `${formatMoney(line.literPrice)} / L` : "—"}
              </span>
            </li>
          );
        }
        const { product } = item;
        return (
          <li
            key={item.key}
            id={`pos-suggestion-${index}`}
            role="option"
            aria-selected={active}
            className={className}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(item);
            }}
          >
            <span className="pos-suggestion-code">
              {product.barcode || product.sku || product.posId || "—"}
            </span>
            <span className="pos-suggestion-name">
              {product.name}
              {product.lineId ? <small> · líquido</small> : null}
            </span>
            <span className="pos-suggestion-price">{formatMoney(product.price)}</span>
          </li>
        );
      })}
    </ul>
  );
}
