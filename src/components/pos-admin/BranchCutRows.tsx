"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@mui/material";
import { ChevronDown, ExternalLink, Store } from "lucide-react";
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
}

interface CutTotals {
  total: number;
  tickets: number;
  items: number;
  voided: number;
  byPayment: Record<string, number>;
}

interface BranchCut {
  branch: Pick<Branch, "id" | "code" | "name">;
  today: CutTotals;
  yesterday: CutTotals;
  week: CutTotals;
  days: Record<string, CutTotals>;
}

/** Mismo orden y color que las tarjetas de día de Ventas de la sucursal. */
const PAYMENT_SEGMENTS = [
  { key: POS_PAYMENT_METHODS.CASH, color: "#16a34a" },
  { key: POS_PAYMENT_METHODS.CARD, color: "#06a6e0" },
  { key: POS_PAYMENT_METHODS.TRANSFER, color: "#7c3aed" },
];

const emptyTotals = (): CutTotals => ({ total: 0, tickets: 0, items: 0, voided: 0, byPayment: {} });

function addRow(target: CutTotals, row: BranchDayRow) {
  target.total += row.total;
  target.tickets += row.tickets;
  target.items += row.items;
  target.voided += row.voided;
  if (row.total) target.byPayment[row.paymentMethod] = (target.byPayment[row.paymentMethod] ?? 0) + row.total;
}

/** "Viernes, 9 de octubre de 2026" → "vie 9 oct", para los renglones del detalle. */
function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "1 producto", "3.5 productos": en la semana se suman piezas y litros. */
function itemsLabel(items: number): string {
  return `${formatQuantity(items)} ${items === 1 ? "producto" : "productos"} en la semana`;
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

/**
 * Primera pestaña de Cortes: una fila por sucursal con lo vendido **hoy, ayer
 * y en la semana del punto de venta** (viernes a jueves), sin importar el
 * periodo de los filtros. Es lo primero que se revisa cada mañana: qué tienda
 * vendió qué y cuánto entró en efectivo. Cada fila abre su semana día por día.
 */
export function BranchCutRows({ branches, branchId }: { branches: Branch[]; branchId: string }) {
  const { subscribe } = useRealtime();
  const [today, setToday] = useState(todayInMexico());
  const yesterday = shiftDateOnly(today, -1);
  const weekStart = posWeekStart(today);
  // El viernes la semana nueva empieza hoy y ayer queda en la anterior.
  const from = weekStart < yesterday ? weekStart : yesterday;

  const [rows, setRows] = useState<BranchDayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openBranches, setOpenBranches] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    // Si la pantalla quedó abierta de un día para otro, "hoy" se recorre solo.
    setToday(todayInMexico());
    try {
      setRows(
        await httpClient.get<BranchDayRow[]>("/pos/reports/branch-days", {
          from,
          to: today,
          ...(branchId ? { branchId } : {}),
        }),
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el corte por sucursal"));
    } finally {
      setLoading(false);
    }
  }, [from, today, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Cada cobro mueve las cifras; con varias cajas a la vez se junta en una recarga.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type !== "pos_sales_changed") return;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void load(), 1500);
    });
    return () => {
      unsubscribe();
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [subscribe, load]);

  /** Días del detalle, de hoy hacia atrás: los días sin venta también salen. */
  const detailDays = useMemo(() => {
    const days: string[] = [];
    for (let day = today; day >= from; day = shiftDateOnly(day, -1)) days.push(day);
    return days;
  }, [today, from]);

  const { cuts, overall } = useMemo(() => {
    const byBranch = new Map<string, BranchCut>();
    const ensure = (branch: Pick<Branch, "id" | "code" | "name">) => {
      let cut = byBranch.get(branch.id);
      if (!cut) {
        cut = { branch, today: emptyTotals(), yesterday: emptyTotals(), week: emptyTotals(), days: {} };
        byBranch.set(branch.id, cut);
      }
      return cut;
    };
    // Las sucursales activas salen aunque no hayan vendido: una tienda en
    // ceros a media mañana es justo lo que hay que ver. Las franquicias no
    // tienen caja.
    for (const branch of branches) {
      if (branch.type === BRANCH_TYPES.FRANCHISE || !branch.isActive) continue;
      if (branchId && branch.id !== branchId) continue;
      ensure(branch);
    }
    const overall = { today: emptyTotals(), yesterday: emptyTotals(), week: emptyTotals() };
    for (const row of rows) {
      const known = branches.find((branch) => branch.id === row.branchId);
      const cut = ensure(known ?? { id: row.branchId, code: "—", name: "Sucursal" });
      if (row.day === today) {
        addRow(cut.today, row);
        addRow(overall.today, row);
      }
      if (row.day === yesterday) {
        addRow(cut.yesterday, row);
        addRow(overall.yesterday, row);
      }
      if (row.day >= weekStart) {
        addRow(cut.week, row);
        addRow(overall.week, row);
      }
      addRow((cut.days[row.day] ??= emptyTotals()), row);
    }
    const cuts = Array.from(byBranch.values()).sort(
      (a, b) =>
        b.week.total - a.week.total || b.today.total - a.today.total || a.branch.code.localeCompare(b.branch.code),
    );
    return { cuts, overall };
  }, [rows, branches, branchId, today, yesterday, weekStart]);

  const allOpen = cuts.length > 0 && cuts.every((cut) => openBranches[cut.branch.id]);
  const weekLabel = formatDateOnlyRange(weekStart, shiftDateOnly(weekStart, 6));
  const weekStat = weekStart === today ? "Semana (desde hoy)" : "Semana";

  return (
    <div className="page-stack">
      <FilterBar>
        <span className="page-kicker" style={{ margin: 0 }}>
          Hoy es {formatBusinessDayLong(today).replace(/ de \d{4}$/, "").toLowerCase()}. La semana va del{" "}
          {weekLabel} (viernes a jueves); los filtros de arriba no cambian esta vista.
        </span>
        {cuts.length > 1 ? (
          <Button
            size="small"
            onClick={() =>
              setOpenBranches(Object.fromEntries(cuts.map((cut) => [cut.branch.id, !allOpen])))
            }
          >
            {allOpen ? "Contraer todas" : "Desplegar todas"}
          </Button>
        ) : null}
        <FilterMeta>
          {cuts.length} {cuts.length === 1 ? "sucursal" : "sucursales"}
        </FilterMeta>
      </FilterBar>

      {cuts.length > 1 ? (
        <section className="pos-day pos-cut is-overall">
          <div className="pos-day-head">
            <span className="pos-day-chevron" aria-hidden>
              <Store size={17} />
            </span>
            <span className="pos-day-date">
              <span className="pos-day-weekday">Todas las sucursales</span>
              <span className="pos-day-fulldate">
                {itemsLabel(overall.week.items)}
              </span>
            </span>
            <PayBreakdown totals={overall.week} caption="Semana:" />
            <span className="pos-day-stats">
              <PeriodStat label="Hoy" totals={overall.today} />
              <PeriodStat label="Ayer" totals={overall.yesterday} />
              <PeriodStat label={weekStat} totals={overall.week} total />
            </span>
          </div>
        </section>
      ) : null}

      {cuts.map((cut) => {
        const open = Boolean(openBranches[cut.branch.id]);
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
                  {!cut.today.tickets ? <span className="pos-day-badge is-muted">Sin ventas hoy</span> : null}
                </span>
                <span className="pos-day-fulldate">
                  {cut.branch.code} · {itemsLabel(cut.week.items)}
                </span>
              </span>
              <PayBreakdown totals={cut.week} caption="Semana:" />
              <span className="pos-day-stats">
                <PeriodStat label="Hoy" totals={cut.today} />
                <PeriodStat label="Ayer" totals={cut.yesterday} />
                <PeriodStat label={weekStat} totals={cut.week} total />
              </span>
            </button>
            {open ? (
              <div className="pos-day-body">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Día</th>
                      {PAYMENT_SEGMENTS.map((segment) => (
                        <th key={segment.key} style={{ textAlign: "right" }}>
                          {posPaymentMethodLabel(segment.key)}
                        </th>
                      ))}
                      <th style={{ textAlign: "right" }}>Tickets</th>
                      <th style={{ textAlign: "right" }}>Productos</th>
                      <th style={{ textAlign: "right" }}>Anulados</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailDays.map((day) => {
                      const totals = cut.days[day] ?? emptyTotals();
                      const outsideWeek = day < weekStart;
                      return (
                        <tr key={day} className={outsideWeek ? "is-previous-week" : ""}>
                          <td style={{ fontWeight: 600, color: "var(--glam-navy)", whiteSpace: "nowrap" }}>
                            {shortDay(day)}
                            {day === today ? <span className="pos-day-badge pos-cut-inline-badge">Hoy</span> : null}
                            {day === yesterday ? (
                              <span className="pos-day-badge is-muted pos-cut-inline-badge">Ayer</span>
                            ) : null}
                            {outsideWeek ? <span className="pos-cut-note">semana anterior</span> : null}
                          </td>
                          {PAYMENT_SEGMENTS.map((segment) => (
                            <td key={segment.key} style={{ textAlign: "right" }}>
                              {totals.byPayment[segment.key] ? formatMoney(totals.byPayment[segment.key]) : "—"}
                            </td>
                          ))}
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

      {loading && !rows.length ? <p className="page-kicker">Cargando...</p> : null}
      {!loading && !cuts.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          No hay sucursales con caja para mostrar.
        </div>
      ) : null}
    </div>
  );
}
