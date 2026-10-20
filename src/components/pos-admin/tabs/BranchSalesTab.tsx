"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  Chip,
  FormControlLabel,
  Switch,
  Tooltip,
} from "@mui/material";
import { ChevronDown, CloudOff, PackageX, TriangleAlert, Truck } from "lucide-react";
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

interface DayGroup {
  day: string;
  sales: PosSale[];
  total: number;
  tickets: number;
  items: number;
  voided: number;
  /** Lo cobrado por forma de pago, sin anulados. */
  byPayment: Record<string, number>;
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
 */
export function BranchSalesTab({ branchId }: { branchId: string }) {
  const { subscribe } = useRealtime();
  const [from, setFrom] = useState(shiftDateOnly(todayInMexico(), -6));
  const [to, setTo] = useState(todayInMexico());
  const [sales, setSales] = useState<PosSale[]>([]);
  const [total, setTotal] = useState(0);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await httpClient.get<ListResponse<PosSale>>("/pos/sales", {
        branchId,
        from,
        to,
        limit: 200,
        ...(onlyContainerWarning ? { withContainerWarning: "true" } : {}),
      });
      setSales(result.items);
      setTotal(result.total);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar las ventas"));
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to, onlyContainerWarning]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "pos_sales_changed" && event.branchId === branchId) void load();
    });
  }, [subscribe, branchId, load]);

  /**
   * El día sale de `soldAt` en la zona del negocio, no de la fecha del
   * navegador: un ticket de las 9 de la noche en México es de ese día aunque
   * en UTC ya sea el siguiente. Los anulados salen en su día pero no suman al
   * total: un ticket anulado no vendió.
   */
  const groups = useMemo<DayGroup[]>(() => {
    const byDay = new Map<string, DayGroup>();
    for (const sale of sales) {
      const day = businessDayOf(sale.soldAt);
      const group = byDay.get(day) ?? {
        day,
        sales: [],
        total: 0,
        tickets: 0,
        items: 0,
        voided: 0,
        byPayment: {},
      };
      group.sales.push(sale);
      if (sale.status === POS_SALE_STATUS.VOIDED) {
        group.voided += 1;
      } else {
        group.tickets += 1;
        group.total += Number(sale.total);
        group.items += Number(sale.itemsCount);
        group.byPayment[sale.paymentMethod] = (group.byPayment[sale.paymentMethod] ?? 0) + Number(sale.total);
      }
      byDay.set(day, group);
    }
    return Array.from(byDay.values()).sort((a, b) => b.day.localeCompare(a.day));
  }, [sales]);

  const isDayOpen = (day: string, index: number) => openDays[day] ?? index === 0;
  const allOpen = groups.every((group, index) => isDayOpen(group.day, index));
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
          {total > sales.length ? ` · se muestran ${sales.length} de ${total}` : ""}
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
                    {group.sales.map((sale) => {
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
      {!loading && !sales.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          Sin tickets en este periodo.
        </div>
      ) : null}

      <PosSaleDialog sale={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
