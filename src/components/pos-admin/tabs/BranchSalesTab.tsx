"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Button,
  Chip,
  FormControlLabel,
  Switch,
  Tooltip,
} from "@mui/material";
import { ChevronDown, CloudOff, PackageX, TriangleAlert, Truck, Undo2 } from "lucide-react";
import { isHomeDeliverySale } from "@/lib/pos/delivery-ticket";
import {
  POS_PAYMENT_METHODS,
  POS_SALE_STATUS,
  posPaymentMethodLabel,
} from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { ListResponse, PosSale } from "@/types";
import { toast } from "sonner";
import type { BranchDayRow } from "../BranchCutRows";
import { PosSaleDialog } from "../PosSaleDialog";
import { FilterBar, FilterDateRange, FilterMeta, type DateRangeOption } from "../FilterBar";
import {
  businessDayOf,
  formatBusinessDayLong,
  formatBusinessTime,
  formatDateTime,
  shiftDateOnly,
  todayInMexico,
} from "../pos-labels";

/** La caja siempre se mira por periodo: aquí no hay opción "Todo". */
const RANGES: DateRangeOption[] = [
  { key: "hoy", label: "Hoy", days: 0 },
  { key: "7d", label: "7 días", days: 6 },
  { key: "30d", label: "30 días", days: 29 },
];

/** Alguna partida vendida no descontó envase ni tapa. */
function hasContainerWarning(sale: PosSale): boolean {
  return (sale.items ?? []).some((item) => Boolean(item.containerWarning));
}

/** Encabezado de un día: las mismas cifras que el corte de la sucursal. */
interface DaySummary {
  day: string;
  total: number;
  tickets: number;
  items: number;
  voided: number;
  /** Lo cobrado por forma de pago, sin anulados y con devoluciones restadas. */
  byPayment: Record<string, number>;
  /** Venta a domicilio: ya incluida en total y tickets. */
  delivery: number;
  deliveryTickets: number;
  /** Devoluciones de cliente del día: ya restadas del total. */
  returns: number;
  returnsCount: number;
}

/** Tickets de un día y la recarga de la que salieron (ver `version`). */
interface DaySales {
  version: number;
  sales: PosSale[];
}

const emptySummary = (day: string): DaySummary => ({
  day,
  total: 0,
  tickets: 0,
  items: 0,
  voided: 0,
  byPayment: {},
  delivery: 0,
  deliveryTickets: 0,
  returns: 0,
  returnsCount: 0,
});

/** Filas `día × forma de pago` de `/pos/reports/branch-days` → un encabezado por día. */
function summariesFromRows(rows: BranchDayRow[]): DaySummary[] {
  const byDay = new Map<string, DaySummary>();
  for (const row of rows) {
    const summary = byDay.get(row.day) ?? emptySummary(row.day);
    summary.total += row.total;
    summary.tickets += row.tickets;
    summary.items += row.items;
    summary.voided += row.voided;
    if (row.total) summary.byPayment[row.paymentMethod] = (summary.byPayment[row.paymentMethod] ?? 0) + row.total;
    summary.delivery += row.deliveryTotal ?? 0;
    summary.deliveryTickets += row.deliveryTickets ?? 0;
    summary.returns += row.returnsTotal ?? 0;
    summary.returnsCount += row.returns ?? 0;
    byDay.set(row.day, summary);
  }
  return Array.from(byDay.values()).sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * El día sale de `soldAt` en la zona del negocio, no de la fecha del
 * navegador: un ticket de las 9 de la noche en México es de ese día aunque en
 * UTC ya sea el siguiente.
 */
function salesByDay(sales: PosSale[]): Map<string, PosSale[]> {
  const byDay = new Map<string, PosSale[]>();
  for (const sale of sales) {
    const day = businessDayOf(sale.soldAt);
    byDay.set(day, [...(byDay.get(day) ?? []), sale]);
  }
  return byDay;
}

/** Encabezados armados con los tickets cargados: solo para el filtro de envase. */
function summariesFromSales(byDay: Map<string, PosSale[]>): DaySummary[] {
  return Array.from(byDay.entries())
    .map(([day, sales]) => {
      const summary = emptySummary(day);
      for (const sale of sales) {
        if (sale.status === POS_SALE_STATUS.VOIDED) {
          summary.voided += 1;
          continue;
        }
        summary.tickets += 1;
        summary.total += Number(sale.total);
        summary.items += Number(sale.itemsCount);
        summary.byPayment[sale.paymentMethod] = (summary.byPayment[sale.paymentMethod] ?? 0) + Number(sale.total);
      }
      return summary;
    })
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** Orden y color fijos: la barra de un día se compara a ojo con la del otro. */
const PAYMENT_SEGMENTS = [
  { key: POS_PAYMENT_METHODS.CASH, color: "#16a34a" },
  { key: POS_PAYMENT_METHODS.CARD, color: "#06a6e0" },
  { key: POS_PAYMENT_METHODS.TRANSFER, color: "#7c3aed" },
];

/** "Jueves, 1 de octubre de 2026" → ["Jueves", "1 de octubre de 2026"]. */
function splitDayLabel(day: string): [string, string] {
  const label = formatBusinessDayLong(day);
  const comma = label.indexOf(", ");
  return comma === -1 ? [label, ""] : [label.slice(0, comma), label.slice(comma + 2)];
}

/**
 * Tickets de la sucursal **agrupados por día de negocio**: cada día con su
 * total, sus tickets y sus productos, y cada renglón con la hora. En una lista
 * plana no se veía dónde terminaba un día y empezaba otro, que es justo como
 * se revisa la caja. Clic en un renglón abre el ticket completo.
 *
 * Las cifras de cada día salen de `/pos/reports/branch-days`, igual que el
 * corte, y los tickets se piden por día al desplegarlo, todas las páginas: la
 * lista del rango entero tope 200 tickets y al día más viejo le faltaban.
 */
export function BranchSalesTab({ branchId }: { branchId: string }) {
  const { subscribe } = useRealtime();
  const [from, setFrom] = useState(shiftDateOnly(todayInMexico(), -6));
  const [to, setTo] = useState(todayInMexico());
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [daySales, setDaySales] = useState<Record<string, DaySales>>({});
  /** Sube en cada recarga: los días ya cargados se vuelven a pedir al verse. */
  const [version, setVersion] = useState(0);
  /** `día|versión` ya pedidos: una carrera entre respuestas pedía el mismo día dos veces. */
  const requested = useRef(new Set<string>());
  /** Con el filtro de envase: tickets que trajo la lista contra los que hay. */
  const [filtered, setFiltered] = useState<{ shown: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PosSale | null>(null);
  const [onlyContainerWarning, setOnlyContainerWarning] = useState(false);
  /**
   * Días que el usuario abrió o cerró a mano. Sin entrada, el día va abierto
   * solo si es el más reciente: con 7 o 30 días, tener todos desplegados era
   * scrollear cientos de renglones para llegar al resumen de un día viejo.
   */
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenDays({});
  }, [from, to]);

  /**
   * Encabezados del rango. Con el filtro de envase no hay corte que comparar:
   * se piden los tickets marcados (son pocos) y los días se arman con ellos.
   */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (onlyContainerWarning) {
        const result = await httpClient.get<ListResponse<PosSale>>("/pos/sales", {
          branchId,
          from,
          to,
          limit: 200,
          withContainerWarning: "true",
        });
        const byDay = salesByDay(result.items);
        setSummaries(summariesFromSales(byDay));
        setDaySales(Object.fromEntries(Array.from(byDay, ([day, sales]) => [day, { version: Infinity, sales }])));
        setFiltered({ shown: result.items.length, total: result.total });
      } else {
        const rows = await httpClient.get<BranchDayRow[]>("/pos/reports/branch-days", {
          from,
          to,
          branchIds: branchId,
        });
        setSummaries(summariesFromRows(rows));
        setFiltered(null);
        setVersion((current) => current + 1);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar las ventas"));
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to, onlyContainerWarning]);

  useEffect(() => {
    setDaySales({});
    void load();
  }, [load]);

  /*
   * Cada cobro de la sucursal mueve las cifras. Se junta en una recarga cada
   * 5 s, como en Cortes: recargar por ticket gasta el límite de solicitudes.
   */
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type !== "pos_sales_changed" || event.branchId !== branchId || reloadTimer.current) return;
      reloadTimer.current = setTimeout(() => {
        reloadTimer.current = null;
        void load();
      }, 5000);
    });
    return () => {
      unsubscribe();
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = null;
    };
  }, [subscribe, branchId, load]);

  /** Todos los tickets de un día, página por página (anulados incluidos, en su día). */
  const loadDay = useCallback(
    async (day: string, forVersion: number) => {
      const key = `${day}|${forVersion}`;
      if (requested.current.has(key)) return;
      requested.current.add(key);
      try {
        const sales: PosSale[] = [];
        for (let page = 1; ; page += 1) {
          const result = await httpClient.get<ListResponse<PosSale>>("/pos/sales", {
            branchId,
            date: day,
            limit: 200,
            page,
          });
          sales.push(...result.items);
          if (page >= result.totalPages) break;
        }
        // Una respuesta que llega tarde no pisa la de una recarga más nueva.
        setDaySales((current) =>
          (current[day]?.version ?? -1) > forVersion ? current : { ...current, [day]: { version: forVersion, sales } },
        );
      } catch (error) {
        requested.current.delete(key);
        toast.error(getApiErrorMessage(error, "No se pudieron cargar los tickets del día"));
      }
    },
    [branchId],
  );

  const groups = summaries;
  const isDayOpen = useCallback((day: string, index: number) => openDays[day] ?? index === 0, [openDays]);
  const allOpen = groups.every((group, index) => isDayOpen(group.day, index));

  /** Cada día abierto con tickets de una recarga vieja (o sin cargar) se pide. */
  useEffect(() => {
    if (onlyContainerWarning) return;
    groups.forEach((group, index) => {
      if (isDayOpen(group.day, index) && (daySales[group.day]?.version ?? -1) < version) {
        void loadDay(group.day, version);
      }
    });
  }, [groups, isDayOpen, daySales, version, loadDay, onlyContainerWarning]);
  const toggleDay = (day: string, index: number) =>
    setOpenDays((current) => ({ ...current, [day]: !isDayOpen(day, index) }));
  const setAllDays = (open: boolean) =>
    setOpenDays(Object.fromEntries(groups.map((group) => [group.day, open])));

  const today = todayInMexico();
  const yesterday = shiftDateOnly(today, -1);

  const rangeTotal = groups.reduce((sum, group) => sum + group.total, 0);
  const rangeTickets = groups.reduce((sum, group) => sum + group.tickets, 0);

  return (
    <div className="page-stack">
      <FilterBar>
        <FilterDateRange
          options={RANGES}
          from={from}
          to={to}
          onChange={(range) => {
            setFrom(range.from);
            setTo(range.to);
          }}
        />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={onlyContainerWarning}
              onChange={(e) => setOnlyContainerWarning(e.target.checked)}
            />
          }
          label="Solo con aviso de envase"
        />
        {groups.length > 1 ? (
          <Button size="small" onClick={() => setAllDays(!allOpen)}>
            {allOpen ? "Contraer todos los días" : "Desplegar todos los días"}
          </Button>
        ) : null}
        <FilterMeta>
          <strong>{formatMoney(rangeTotal)}</strong> en {rangeTickets}{" "}
          {rangeTickets === 1 ? "ticket" : "tickets"}
          {filtered && filtered.total > filtered.shown ? ` · se muestran ${filtered.shown} de ${filtered.total}` : ""}
        </FilterMeta>
      </FilterBar>

      {groups.map((group, index) => {
        const open = isDayOpen(group.day, index);
        const [weekday, fullDate] = splitDayLabel(group.day);
        return (
          <section key={group.day} className={`pos-day${open ? " is-open" : ""}`}>
            <button
              type="button"
              className="pos-day-head"
              onClick={() => toggleDay(group.day, index)}
              aria-expanded={open}
            >
              <span className="pos-day-chevron" aria-hidden>
                <ChevronDown size={18} />
              </span>
              <span className="pos-day-date">
                <span className="pos-day-weekday">
                  {weekday}
                  {group.day === today ? <span className="pos-day-badge">Hoy</span> : null}
                  {group.day === yesterday ? <span className="pos-day-badge is-muted">Ayer</span> : null}
                </span>
                <span className="pos-day-fulldate">{fullDate}</span>
              </span>
              <span className="pos-day-payments">
                <span className="pos-day-paybar">
                  {PAYMENT_SEGMENTS.map((segment) =>
                    group.byPayment[segment.key] ? (
                      <span
                        key={segment.key}
                        style={{
                          flexGrow: group.byPayment[segment.key],
                          background: segment.color,
                        }}
                      />
                    ) : null,
                  )}
                </span>
                <span className="pos-day-paylegend">
                  {PAYMENT_SEGMENTS.map((segment) =>
                    group.byPayment[segment.key] ? (
                      <span key={segment.key}>
                        <i style={{ background: segment.color }} />
                        {posPaymentMethodLabel(segment.key)} {formatMoney(group.byPayment[segment.key])}
                      </span>
                    ) : null,
                  )}
                  {group.deliveryTickets ? (
                    <span className="is-delivery" title="Ya incluido en el total: la surte la fábrica">
                      <Truck size={12} /> A domicilio {formatMoney(group.delivery)} ({group.deliveryTickets})
                    </span>
                  ) : null}
                  {group.returnsCount ? (
                    <span className="is-voided" title="Ya restado del total y de cada forma de pago">
                      <Undo2 size={12} /> Devoluciones -{formatMoney(group.returns)} ({group.returnsCount})
                    </span>
                  ) : null}
                  {group.voided ? (
                    <span className="is-voided">
                      {group.voided} {group.voided === 1 ? "anulado" : "anulados"}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="pos-day-stats">
                <span className="pos-day-stat">
                  <small>Tickets</small>
                  <b>{group.tickets}</b>
                </span>
                <span className="pos-day-stat">
                  <small>Productos</small>
                  <b>{formatQuantity(group.items)}</b>
                </span>
                <span className="pos-day-stat is-total">
                  <small>Total</small>
                  <b>{formatMoney(group.total)}</b>
                </span>
              </span>
            </button>
            {open ? (
              <div className="pos-day-body">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Hora</th>
                      <th>Folio</th>
                      <th>Cajero</th>
                      <th>Cliente</th>
                      <th style={{ width: 120 }}>Pago</th>
                      <th style={{ textAlign: "right", width: 110 }}>Productos</th>
                      <th style={{ textAlign: "right", width: 130 }}>Total</th>
                      <th style={{ width: 110 }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!daySales[group.day] ? (
                      <tr>
                        <td colSpan={8} style={{ color: "var(--muted)" }}>
                          Cargando tickets...
                        </td>
                      </tr>
                    ) : null}
                    {(daySales[group.day]?.sales ?? []).map((sale) => {
                      const voided = sale.status === POS_SALE_STATUS.VOIDED;
                      return (
                        <tr
                          key={sale.id}
                          className={voided ? "is-voided" : ""}
                          onClick={() => setSelected(sale)}
                          title="Ver el ticket completo"
                        >
                          <td
                            style={{
                              fontWeight: 600,
                              color: "var(--glam-navy)",
                            }}
                          >
                            {formatBusinessTime(sale.soldAt)}
                          </td>
                          <td>
                            {sale.ticketNumber}
                            {sale.recordedOffline ? (
                              <Tooltip
                                title={`Cobrado sin internet${
                                  sale.syncedAt ? `, subió el ${formatDateTime(sale.syncedAt)}` : ""
                                }`}
                              >
                                <span
                                  style={{
                                    marginLeft: 6,
                                    color: "#b45309",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  <CloudOff size={13} />
                                </span>
                              </Tooltip>
                            ) : null}
                            {isHomeDeliverySale(sale) ? (
                              <Tooltip
                                title={
                                  sale.deliveryOrder
                                    ? `Venta a domicilio · pedido ${sale.deliveryOrder.orderNumber}. No descontó existencias: la surte la fábrica.`
                                    : "Venta a domicilio: no descontó existencias"
                                }
                              >
                                <span style={{ marginLeft: 6, color: "#1d4ed8", verticalAlign: "middle" }}>
                                  <Truck size={13} />
                                </span>
                              </Tooltip>
                            ) : null}
                            {sale.priceMismatch ? (
                              <Tooltip title="Alguna partida se cobró a un precio distinto al del catálogo">
                                <span
                                  style={{
                                    marginLeft: 6,
                                    color: "#c62828",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  <TriangleAlert size={13} />
                                </span>
                              </Tooltip>
                            ) : null}
                            {hasContainerWarning(sale) ? (
                              <Tooltip title="Alguna partida no descontó envase ni tapa (no hay envase configurado para ese tamaño)">
                                <Chip
                                  icon={<PackageX size={12} />}
                                  label="Sin envase"
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                  sx={{
                                    ml: 0.75,
                                    height: 20,
                                    verticalAlign: "middle",
                                  }}
                                />
                              </Tooltip>
                            ) : null}
                          </td>
                          <td>{sale.cashier?.name ?? "—"}</td>
                          <td>
                            {sale.customer ? (
                              <Link
                                href={`/dashboard/pos/clientes/${sale.customer.id}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                {sale.customer.name}
                              </Link>
                            ) : (
                              <span className="pill-muted">Mostrador</span>
                            )}
                          </td>
                          <td>{posPaymentMethodLabel(sale.paymentMethod)}</td>
                          <td style={{ textAlign: "right" }}>{formatQuantity(sale.itemsCount)}</td>
                          <td
                            style={{
                              textAlign: "right",
                              fontWeight: 700,
                              textDecoration: voided ? "line-through" : undefined,
                            }}
                          >
                            {formatMoney(sale.total)}
                          </td>
                          <td>
                            {voided ? (
                              <Chip label="Anulado" size="small" color="error" />
                            ) : sale.returns?.length ? (
                              <Chip label="Con devolución" size="small" color="warning" />
                            ) : (
                              <Chip label="Cobrado" size="small" color="success" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        );
      })}

      {loading ? <p className="page-kicker">Cargando...</p> : null}
      {!loading && !groups.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          Sin tickets en este periodo.
        </div>
      ) : null}

      <PosSaleDialog sale={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
