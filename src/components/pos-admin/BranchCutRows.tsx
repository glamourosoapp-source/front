"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@mui/material";
import { ChevronDown, ExternalLink, Store, Truck } from "lucide-react";
import { BRANCH_TYPES, POS_PAYMENT_METHODS, posPaymentMethodLabel } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { Branch } from "@/types";
import { toast } from "sonner";
import { FilterBar, FilterMeta } from "./FilterBar";
import { formatBusinessDayLong, formatDateOnlyRange, posWeekStart, shiftDateOnly, todayInMexico } from "./pos-labels";

/** Fila de `/pos/reports/branch-days`: un día, una sucursal, una forma de pago. */
interface BranchDayRow {
  day: string;
  branchId: string;
  paymentMethod: string;
  total: number;
  tickets: number;
  items: number;
  voided: number;
  /** De lo anterior, lo que fue venta a domicilio (ya va dentro de total y tickets). */
  deliveryTotal?: number;
  deliveryTickets?: number;
}

interface CutTotals {
  total: number;
  tickets: number;
  items: number;
  voided: number;
  byPayment: Record<string, number>;
  /** Venta a domicilio: renglón aparte, ya incluido en el total. */
  delivery: number;
  deliveryTickets: number;
}

interface BranchCut {
  branch: Pick<Branch, "id" | "code" | "name">;
  /** Modo día: el día elegido. */
  day: CutTotals;
  /** Modo día: el día anterior. */
  previous: CutTotals;
  /** Modo día: la semana vie–jue hasta el día elegido. Modo rango: todo el rango. */
  period: CutTotals;
  /** Renglones del detalle: por día, o por semana en rangos largos. */
  buckets: Record<string, CutTotals>;
}

/**
 * Qué periodo pinta la pestaña, según el filtro de la página:
 * - `day`: el día elegido, el anterior y la semana del punto de venta hasta
 *   ese día. Con la fecha de hoy es el "hoy, ayer y semana" de cada mañana.
 * - `range`: semana, mes o rango libre; cada sucursal con lo de ese periodo.
 */
export type BranchCutPeriod = { mode: "day"; day: string } | { mode: "range"; from: string; to: string };

/** Mismo orden y color que las tarjetas de día de Ventas de la sucursal. */
const PAYMENT_SEGMENTS = [
  { key: POS_PAYMENT_METHODS.CASH, color: "#16a34a" },
  { key: POS_PAYMENT_METHODS.CARD, color: "#06a6e0" },
  { key: POS_PAYMENT_METHODS.TRANSFER, color: "#7c3aed" },
];

/** Más días que esto y el detalle de cada sucursal se agrupa por semana vie–jue. */
const MAX_DAY_ROWS = 62;

const emptyTotals = (): CutTotals => ({
  total: 0,
  tickets: 0,
  items: 0,
  voided: 0,
  byPayment: {},
  delivery: 0,
  deliveryTickets: 0,
});

function addRow(target: CutTotals, row: BranchDayRow) {
  target.total += row.total;
  target.tickets += row.tickets;
  target.items += row.items;
  target.voided += row.voided;
  target.delivery += row.deliveryTotal ?? 0;
  target.deliveryTickets += row.deliveryTickets ?? 0;
  if (row.total) target.byPayment[row.paymentMethod] = (target.byPayment[row.paymentMethod] ?? 0) + row.total;
}

/** "2026-10-09" → "vie 9 oct", para etiquetas cortas. */
function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function countDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** "1 producto", "3.5 productos": se suman piezas y litros. */
function itemsLabel(items: number, suffix: string): string {
  return `${formatQuantity(items)} ${items === 1 ? "producto" : "productos"} ${suffix}`;
}

function PayBreakdown({ totals, caption }: { totals: CutTotals; caption: string }) {
  return (
    <span className="pos-day-payments">
      <span className="pos-day-paybar">
        {PAYMENT_SEGMENTS.map((segment) =>
          totals.byPayment[segment.key] ? (
            <span key={segment.key} style={{ flexGrow: totals.byPayment[segment.key], background: segment.color }} />
          ) : null,
        )}
      </span>
      <span className="pos-day-paylegend">
        <span className="pos-cut-caption">{caption}</span>
        {PAYMENT_SEGMENTS.map((segment) =>
          totals.byPayment[segment.key] ? (
            <span key={segment.key}>
              <i style={{ background: segment.color }} />
              {posPaymentMethodLabel(segment.key)} {formatMoney(totals.byPayment[segment.key])}
            </span>
          ) : null,
        )}
        {totals.delivery ? (
          <span className="is-delivery" title="Ya incluido en el total: la surte la fábrica">
            <Truck size={12} /> A domicilio {formatMoney(totals.delivery)} ({totals.deliveryTickets})
          </span>
        ) : null}
        {!totals.total ? <span>Sin ventas</span> : null}
        {totals.voided ? (
          <span className="is-voided">
            {totals.voided} {totals.voided === 1 ? "anulado" : "anulados"}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** Bloque de un periodo (modo día): monto grande y sus tickets debajo. */
function PeriodStat({ label, totals, total }: { label: string; totals: CutTotals; total?: boolean }) {
  return (
    <span className={`pos-day-stat${total ? " is-total" : ""}`}>
      <small>{label}</small>
      <b>{formatMoney(totals.total)}</b>
      <em>
        {totals.tickets} {totals.tickets === 1 ? "ticket" : "tickets"}
      </em>
    </span>
  );
}

/** Bloques del modo rango: tickets, productos y total, como la tarjeta de día de Ventas. */
function RangeStats({ totals }: { totals: CutTotals }) {
  return (
    <span className="pos-day-stats">
      <span className="pos-day-stat">
        <small>Tickets</small>
        <b>{totals.tickets}</b>
      </span>
      <span className="pos-day-stat">
        <small>Productos</small>
        <b>{formatQuantity(totals.items)}</b>
      </span>
      <span className="pos-day-stat is-total">
        <small>Total</small>
        <b>{formatMoney(totals.total)}</b>
      </span>
    </span>
  );
}

/**
 * Primera pestaña de Cortes: una tarjeta por sucursal. Sigue el filtro de
 * periodo de la página: con **Día** (hoy por defecto) muestra el día, el
 * anterior y la semana del punto de venta (viernes a jueves), que es lo que se
 * revisa cada mañana; con **Semana, Mes o Rango** muestra lo de ese periodo.
 * Cada tarjeta se abre en su detalle día por día.
 */
export function BranchCutRows({
  branches,
  branchIds,
  period,
}: {
  branches: Branch[];
  /** Sucursales elegidas en el filtro; vacío = todas. */
  branchIds: string[];
  period: BranchCutPeriod;
}) {
  const { subscribe } = useRealtime();
  const today = todayInMexico();
  const isDay = period.mode === "day";

  // Fechas que pide la pestaña y cómo se reparten en bloques.
  const dates = useMemo(() => {
    if (period.mode === "day") {
      const previous = shiftDateOnly(period.day, -1);
      const weekStart = posWeekStart(period.day);
      // El viernes la semana nueva empieza ese día y el anterior queda en la otra.
      return {
        from: weekStart < previous ? weekStart : previous,
        to: period.day,
        day: period.day,
        previous,
        weekStart,
      };
    }
    return { from: period.from, to: period.to, day: "", previous: "", weekStart: "" };
  }, [period]);
  const invalidRange = !dates.from || !dates.to || dates.from > dates.to;
  // Un rango que llega al futuro no tiene renglones que pintar después de hoy.
  const lastDay = dates.to > today ? today : dates.to;
  const byWeek = !isDay && !invalidRange && countDays(dates.from, lastDay) > MAX_DAY_ROWS;
  const bucketOf = useCallback(
    (day: string) => {
      if (!byWeek) return day;
      const start = posWeekStart(day);
      return start < dates.from ? dates.from : start;
    },
    [byWeek, dates.from],
  );

  const [rows, setRows] = useState<BranchDayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openBranches, setOpenBranches] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (invalidRange) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      setRows(
        await httpClient.get<BranchDayRow[]>("/pos/reports/branch-days", {
          from: dates.from,
          to: dates.to,
          ...(branchIds.length ? { branchIds: branchIds.join(",") } : {}),
        }),
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el corte por sucursal"));
    } finally {
      setLoading(false);
    }
  }, [invalidRange, dates.from, dates.to, branchIds]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Cada cobro mueve las cifras si el periodo llega a hoy. Se junta en una
   * recarga cada 5 s y solo con la pestaña a la vista: con 28 cajas, recargar
   * por ticket agotaba el límite de solicitudes por IP del Back.
   */
  const includesToday = !invalidRange && dates.to >= today;
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!includesToday) return;
    const unsubscribe = subscribe((event) => {
      if (event.type !== "pos_sales_changed" || reloadTimer.current) return;
      reloadTimer.current = setTimeout(() => {
        reloadTimer.current = null;
        if (document.visibilityState === "visible") void load();
      }, 5000);
    });
    return () => {
      unsubscribe();
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = null;
    };
  }, [subscribe, load, includesToday]);

  /** Renglones del detalle, del más reciente hacia atrás; los vacíos también salen. */
  const detailKeys = useMemo(() => {
    if (invalidRange) return [];
    const keys: string[] = [];
    for (let day = lastDay; day >= dates.from; day = shiftDateOnly(day, -1)) {
      const key = bucketOf(day);
      if (keys[keys.length - 1] !== key) keys.push(key);
    }
    return keys;
  }, [invalidRange, lastDay, dates.from, bucketOf]);

  const { cuts, overall } = useMemo(() => {
    const byBranch = new Map<string, BranchCut>();
    const ensure = (branch: Pick<Branch, "id" | "code" | "name">) => {
      let cut = byBranch.get(branch.id);
      if (!cut) {
        cut = { branch, day: emptyTotals(), previous: emptyTotals(), period: emptyTotals(), buckets: {} };
        byBranch.set(branch.id, cut);
      }
      return cut;
    };
    // Las sucursales activas salen aunque no hayan vendido: una tienda en
    // ceros a media mañana es justo lo que hay que ver. Las franquicias no
    // tienen caja.
    for (const branch of branches) {
      if (branch.type === BRANCH_TYPES.FRANCHISE) continue;
      // Elegida a mano sale aunque esté inactiva; en "todas", solo las activas.
      if (branchIds.length ? !branchIds.includes(branch.id) : !branch.isActive) continue;
      ensure(branch);
    }
    const overall = { day: emptyTotals(), previous: emptyTotals(), period: emptyTotals() };
    for (const row of rows) {
      const known = branches.find((branch) => branch.id === row.branchId);
      const cut = ensure(known ?? { id: row.branchId, code: "—", name: "Sucursal" });
      if (isDay) {
        if (row.day === dates.day) {
          addRow(cut.day, row);
          addRow(overall.day, row);
        }
        if (row.day === dates.previous) {
          addRow(cut.previous, row);
          addRow(overall.previous, row);
        }
      }
      if (!isDay || row.day >= dates.weekStart) {
        addRow(cut.period, row);
        addRow(overall.period, row);
      }
      addRow((cut.buckets[bucketOf(row.day)] ??= emptyTotals()), row);
    }
    const cuts = Array.from(byBranch.values()).sort(
      (a, b) =>
        b.period.total - a.period.total || b.day.total - a.day.total || a.branch.code.localeCompare(b.branch.code),
    );
    return { cuts, overall };
  }, [rows, branches, branchIds, isDay, dates, bucketOf]);

  const allOpen = cuts.length > 0 && cuts.every((cut) => openBranches[cut.branch.id]);

  // Etiquetas: con la fecha de hoy se lee "Hoy / Ayer"; con otra, la fecha.
  const dayIsToday = isDay && dates.day === today;
  const dayLabel = dayIsToday ? "Hoy" : shortDay(dates.day || today);
  const previousLabel = dayIsToday ? "Ayer" : shortDay(dates.previous || today);
  const weekLabel = isDay && dates.weekStart === dates.day ? `Semana (desde ${dayIsToday ? "hoy" : "ese día"})` : "Semana";
  const periodCaption = isDay ? "Semana:" : "Periodo:";
  const itemsSuffix = isDay ? "en la semana" : "en el periodo";
  const rangeLabel = invalidRange ? "" : formatDateOnlyRange(dates.from, dates.to);

  const kicker = invalidRange
    ? "Elige un rango válido: la fecha de inicio no puede ser posterior a la final."
    : isDay
      ? `${dayIsToday ? "Hoy es" : "Día elegido:"} ${formatBusinessDayLong(dates.day).replace(/ de \d{4}$/, "").toLowerCase()}. Semana del ${formatDateOnlyRange(dates.weekStart, shiftDateOnly(dates.weekStart, 6))} (viernes a jueves). Para otro periodo, cambia el filtro de Periodo arriba.`
      : `Ventas por sucursal del ${rangeLabel}${byWeek ? "; el detalle de cada sucursal va por semana (viernes a jueves)" : ""}.`;

  const bucketLabel = (key: string) => {
    if (!byWeek) return shortDay(key);
    const weekEnd = shiftDateOnly(posWeekStart(key), 6);
    const end = weekEnd > dates.to ? dates.to : weekEnd;
    return end === key ? shortDay(key) : formatDateOnlyRange(key, end);
  };

  return (
    <div className="page-stack">
      <FilterBar>
        <span className="page-kicker" style={{ margin: 0 }}>
          {kicker}
        </span>
        {cuts.length > 1 && !invalidRange ? (
          <Button
            size="small"
            onClick={() => setOpenBranches(Object.fromEntries(cuts.map((cut) => [cut.branch.id, !allOpen])))}
          >
            {allOpen ? "Contraer todas" : "Desplegar todas"}
          </Button>
        ) : null}
        <FilterMeta>
          {cuts.length} {cuts.length === 1 ? "sucursal" : "sucursales"}
        </FilterMeta>
      </FilterBar>

      {invalidRange ? null : (
        <>
          {cuts.length > 1 ? (
            <section className="pos-day pos-cut is-overall">
              <div className="pos-day-head">
                <span className="pos-day-chevron" aria-hidden>
                  <Store size={17} />
                </span>
                <span className="pos-day-date">
                  <span className="pos-day-weekday">
                    {branchIds.length ? `Total de ${cuts.length} sucursales` : "Todas las sucursales"}
                  </span>
                  <span className="pos-day-fulldate">{itemsLabel(overall.period.items, itemsSuffix)}</span>
                </span>
                <PayBreakdown totals={overall.period} caption={periodCaption} />
                {isDay ? (
                  <span className="pos-day-stats">
                    <PeriodStat label={dayLabel} totals={overall.day} />
                    <PeriodStat label={previousLabel} totals={overall.previous} />
                    <PeriodStat label={weekLabel} totals={overall.period} total />
                  </span>
                ) : (
                  <RangeStats totals={overall.period} />
                )}
              </div>
            </section>
          ) : null}

          {cuts.map((cut) => {
            const open = Boolean(openBranches[cut.branch.id]);
            const idle = isDay ? !cut.day.tickets : !cut.period.tickets;
            return (
              <section key={cut.branch.id} className={`pos-day pos-cut${open ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="pos-day-head"
                  onClick={() => setOpenBranches((current) => ({ ...current, [cut.branch.id]: !open }))}
                  aria-expanded={open}
                >
                  <span className="pos-day-chevron" aria-hidden>
                    <ChevronDown size={18} />
                  </span>
                  <span className="pos-day-date">
                    <span className="pos-day-weekday">
                      {cut.branch.name}
                      {idle ? (
                        <span className="pos-day-badge is-muted">
                          {isDay ? (dayIsToday ? "Sin ventas hoy" : "Sin ventas ese día") : "Sin ventas"}
                        </span>
                      ) : null}
                    </span>
                    <span className="pos-day-fulldate">
                      {cut.branch.code} · {itemsLabel(cut.period.items, itemsSuffix)}
                    </span>
                  </span>
                  <PayBreakdown totals={cut.period} caption={periodCaption} />
                  {isDay ? (
                    <span className="pos-day-stats">
                      <PeriodStat label={dayLabel} totals={cut.day} />
                      <PeriodStat label={previousLabel} totals={cut.previous} />
                      <PeriodStat label={weekLabel} totals={cut.period} total />
                    </span>
                  ) : (
                    <RangeStats totals={cut.period} />
                  )}
                </button>
                {open ? (
                  <div className="pos-day-body">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{byWeek ? "Semana" : "Día"}</th>
                          {PAYMENT_SEGMENTS.map((segment) => (
                            <th key={segment.key} style={{ textAlign: "right" }}>
                              {posPaymentMethodLabel(segment.key)}
                            </th>
                          ))}
                          <th style={{ textAlign: "right" }} title="Ya incluido en las formas de pago y el total">
                            A domicilio
                          </th>
                          <th style={{ textAlign: "right" }}>Tickets</th>
                          <th style={{ textAlign: "right" }}>Productos</th>
                          <th style={{ textAlign: "right" }}>Anulados</th>
                          <th style={{ textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailKeys.map((key) => {
                          const totals = cut.buckets[key] ?? emptyTotals();
                          const outsideWeek = isDay && key < dates.weekStart;
                          return (
                            <tr key={key} className={outsideWeek ? "is-previous-week" : ""}>
                              <td style={{ fontWeight: 600, color: "var(--glam-navy)", whiteSpace: "nowrap" }}>
                                {bucketLabel(key)}
                                {!byWeek && key === today ? (
                                  <span className="pos-day-badge pos-cut-inline-badge">Hoy</span>
                                ) : null}
                                {!byWeek && key === shiftDateOnly(today, -1) ? (
                                  <span className="pos-day-badge is-muted pos-cut-inline-badge">Ayer</span>
                                ) : null}
                                {outsideWeek ? <span className="pos-cut-note">semana anterior</span> : null}
                              </td>
                              {PAYMENT_SEGMENTS.map((segment) => (
                                <td key={segment.key} style={{ textAlign: "right" }}>
                                  {totals.byPayment[segment.key] ? formatMoney(totals.byPayment[segment.key]) : "—"}
                                </td>
                              ))}
                              <td style={{ textAlign: "right", color: totals.delivery ? "#1d4ed8" : undefined }}>
                                {totals.delivery ? formatMoney(totals.delivery) : "—"}
                              </td>
                              <td style={{ textAlign: "right" }}>{totals.tickets}</td>
                              <td style={{ textAlign: "right" }}>{formatQuantity(totals.items)}</td>
                              <td style={{ textAlign: "right", color: totals.voided ? "#c62828" : undefined }}>
                                {totals.voided || "—"}
                              </td>
                              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(totals.total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="pos-cut-footer">
                      <Link href={`/dashboard/pos/sucursales/${cut.branch.id}?tab=ventas`}>
                        Ver los tickets de {cut.branch.name} <ExternalLink size={13} />
                      </Link>
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </>
      )}

      {loading && !rows.length ? <p className="page-kicker">Cargando...</p> : null}
      {!loading && !invalidRange && !cuts.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          No hay sucursales con caja para mostrar.
        </div>
      ) : null}
    </div>
  );
}
