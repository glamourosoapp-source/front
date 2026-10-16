"use client";

import { useMemo, useState } from "react";
import { Autocomplete, IconButton, TextField, Tooltip } from "@mui/material";
import { Minus, Plus, X } from "lucide-react";
import type { FactoryFormRow } from "@glamouroso/shared";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import {
  isLinked,
  packDescription,
  packsOf,
  round2,
  rowKey,
  sameValue,
  toBase,
  unitOf,
  type SheetValues,
} from "./FactoryFormSheet";
import { rowAmount } from "./factory-form-values";

interface RestockSummaryListProps {
  /** Todos los renglones del formato (`allRows`): de aquí sale también "Agregar producto". */
  rows: FactoryFormRow[];
  values: SheetValues;
  /** Contra qué se marca lo cambiado: el faltante sugerido o lo pedido. */
  baseline: SheetValues;
  /** "Sugerido" (revisar y enviar) o "Pedido" (recibir). */
  baselineLabel: string;
  onChange: (key: string, value: string) => void;
  canSeeCosts: boolean;
  disabled?: boolean;
  /** Solo para consultar (ya hay un pedido en camino): la cantidad como texto, sin − / + ni quitar. */
  readOnly?: boolean;
  emptyText: string;
}

type GroupKey = "bidon" | "garrafa" | "caja" | "pieza";

const GROUPS: Array<{ key: GroupKey; label: string }> = [
  { key: "bidon", label: "Líquidos en bidón" },
  { key: "garrafa", label: "Líquidos en garrafa" },
  { key: "caja", label: "Cajas y bolsas" },
  { key: "pieza", label: "Piezas sueltas" },
];

function groupOf(row: FactoryFormRow): GroupKey {
  if (row.lineId) return row.packSize >= 20 ? "bidon" : "garrafa";
  return row.packSize > 1 ? "caja" : "pieza";
}

/**
 * La vista **Resumen** de un pedido a fábrica: solo los productos que van (o
 * que se pidieron), agrupados por cómo surte fábrica, con − / + por renglón y
 * un buscador para agregar lo que falte. Edita los mismos valores que la hoja
 * del formato (`FactoryFormSheet`): lo que se cambia aquí aparece allá.
 */
export function RestockSummaryList({
  rows,
  values,
  baseline,
  baselineLabel,
  onChange,
  canSeeCosts,
  disabled = false,
  readOnly = false,
  emptyText,
}: RestockSummaryListProps) {
  /** Renglones que se agregaron a mano y todavía están en 0: siguen a la vista. */
  const [added, setAdded] = useState<string[]>([]);
  const linked = useMemo(() => rows.filter(isLinked), [rows]);

  const shown = useMemo(
    () =>
      linked.filter((row) => {
        const key = rowKey(row);
        return packsOf(values[key]) > 0 || packsOf(baseline[key]) > 0 || added.includes(key);
      }),
    [linked, values, baseline, added]
  );
  const shownKeys = useMemo(() => new Set(shown.map(rowKey)), [shown]);
  const options = useMemo(() => linked.filter((row) => !shownKeys.has(rowKey(row))), [linked, shownKeys]);

  function setPacks(row: FactoryFormRow, packs: number) {
    const next = Math.max(0, round2(packs));
    onChange(rowKey(row), next > 0 ? String(next) : "");
  }

  return (
    <div className="restock-summary">
      {!shown.length ? <p className="page-kicker" style={{ margin: 0 }}>{emptyText}</p> : null}
      {GROUPS.map((group) => {
        const groupRows = shown.filter((row) => groupOf(row) === group.key);
        if (!groupRows.length) return null;
        return (
          <section key={group.key} className="restock-summary-group">
            <h3 className="restock-summary-title">
              {group.label} <span>{groupRows.length}</span>
            </h3>
            <div className="table-container-premium">
              <table className="table restock-summary-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Empaque</th>
                    <th style={{ textAlign: "center" }}>Cantidad</th>
                    <th style={{ textAlign: "right" }}>Equivale</th>
                    {canSeeCosts ? <th style={{ textAlign: "right" }}>Importe</th> : null}
                    <th aria-label="Quitar" />
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((row) => {
                    const key = rowKey(row);
                    const packs = packsOf(values[key]);
                    const before = packsOf(baseline[key]);
                    const changed = !sameValue(values[key], baseline[key]);
                    return (
                      <tr key={key} className={changed ? "is-changed" : undefined}>
                        <td className="rs-name">
                          <strong>{row.label}</strong>
                          {changed ? (
                            <div className="restock-summary-was">
                              {before > 0 ? `${baselineLabel}: ${formatQuantity(before)}` : `No venía en lo ${baselineLabel.toLowerCase()}`}
                            </div>
                          ) : null}
                        </td>
                        <td className="restock-summary-pack rs-pack">{packDescription(row)}</td>
                        <td className="rs-qty">
                          {readOnly ? (
                            <strong className="restock-summary-qty">{formatQuantity(packs)}</strong>
                          ) : (
                          <div className="restock-stepper">
                            <IconButton
                              size="small"
                              aria-label={`Uno menos de ${row.label}`}
                              disabled={disabled || packs <= 0}
                              onClick={() => setPacks(row, packs - 1)}
                            >
                              <Minus size={15} />
                            </IconButton>
                            <input
                              className="input"
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              value={values[key] ?? ""}
                              placeholder="0"
                              disabled={disabled}
                              aria-label={`Cantidad de ${row.label}`}
                              onChange={(event) => onChange(key, event.target.value)}
                              onFocus={(event) => event.currentTarget.select()}
                              onWheel={(event) => event.currentTarget.blur()}
                            />
                            <IconButton
                              size="small"
                              aria-label={`Uno más de ${row.label}`}
                              disabled={disabled}
                              onClick={() => setPacks(row, packs + 1)}
                            >
                              <Plus size={15} />
                            </IconButton>
                          </div>
                          )}
                        </td>
                        <td className="rs-eq" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {packs > 0 ? `${formatQuantity(toBase(values[key], row.packSize))} ${unitOf(row)}` : "—"}
                        </td>
                        {canSeeCosts ? (
                          <td className="rs-amount" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {packs > 0 ? formatMoney(rowAmount(row, packs)) : "—"}
                          </td>
                        ) : null}
                        <td className="rs-remove" style={{ textAlign: "right" }}>
                          {readOnly ? null : (
                          <Tooltip title="Quitar del pedido">
                            <span>
                              <IconButton
                                size="small"
                                aria-label={`Quitar ${row.label}`}
                                disabled={disabled || packs <= 0}
                                onClick={() => setPacks(row, 0)}
                              >
                                <X size={15} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {!disabled && !readOnly ? (
        <Autocomplete
          size="small"
          options={options}
          value={null}
          blurOnSelect
          clearOnBlur
          getOptionLabel={(row) => `${row.label} · ${packDescription(row)}`}
          isOptionEqualToValue={(a, b) => rowKey(a) === rowKey(b)}
          // Hay renglones con el mismo nombre y empaque (aromas en caja): la llave es el renglón.
          renderOption={(props, row) => {
            const { key: _key, ...rest } = props as typeof props & { key?: string };
            return (
              <li key={rowKey(row)} {...rest}>
                {row.label} · {packDescription(row)}
              </li>
            );
          }}
          onChange={(_event, row) => {
            if (!row) return;
            const key = rowKey(row);
            setAdded((list) => (list.includes(key) ? list : [...list, key]));
            if (!packsOf(values[key])) onChange(key, "1");
          }}
          renderInput={(params) => (
            <TextField {...params} label="Agregar producto" placeholder="Busca por nombre: cloro, escoba, fibra…" />
          )}
          sx={{ maxWidth: 520 }}
        />
      ) : null}
    </div>
  );
}
