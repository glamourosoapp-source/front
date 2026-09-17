"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import { POS_SALE_STATUS } from "@glamouroso/shared/constants";
import { DetailField } from "@/components/ui/DetailField";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { ListResponse, PosSale } from "@/types";
import { toast } from "sonner";
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

interface DayGroup {
  day: string;
  sales: PosSale[];
  total: number;
  tickets: number;
  items: number;
  voided: number;
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await httpClient.get<ListResponse<PosSale>>("/pos/sales", {
        branchId,
        from,
        to,
        limit: 200,
      });
      setSales(result.items);
      setTotal(result.total);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar las ventas"));
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to]);

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
      };
      group.sales.push(sale);
      if (sale.status === POS_SALE_STATUS.VOIDED) {
        group.voided += 1;
      } else {
        group.tickets += 1;
        group.total += Number(sale.total);
        group.items += Number(sale.itemsCount);
      }
      byDay.set(day, group);
    }
    return Array.from(byDay.values()).sort((a, b) => b.day.localeCompare(a.day));
  }, [sales]);

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
        <FilterMeta>
          <strong>{formatMoney(rangeTotal)}</strong> en {rangeTickets}{" "}
          {rangeTickets === 1 ? "ticket" : "tickets"}
          {total > sales.length ? ` · se muestran ${sales.length} de ${total}` : ""}
        </FilterMeta>
      </FilterBar>

      {groups.map((group) => (
        <section key={group.day} className="pos-day">
          <div className="pos-day-head">
            <h3 className="pos-day-title">{formatBusinessDayLong(group.day)}</h3>
            <span className="pos-day-total">
              <strong>{formatMoney(group.total)}</strong> · {group.tickets}{" "}
              {group.tickets === 1 ? "ticket" : "tickets"} · {formatQuantity(group.items)}{" "}
              {group.items === 1 ? "producto" : "productos"}
              {group.voided
                ? ` · ${group.voided} ${group.voided === 1 ? "anulado" : "anulados"}`
                : ""}
            </span>
          </div>
          <div className="table-container-premium">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Hora</th>
                  <th>Folio</th>
                  <th>Cajero</th>
                  <th>Cliente</th>
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
                      <td style={{ fontWeight: 600, color: "var(--glam-navy)" }}>
                        {formatBusinessTime(sale.soldAt)}
                      </td>
                      <td>{sale.ticketNumber}</td>
                      <td>{sale.cashier?.name ?? "—"}</td>
                      <td>
                        {sale.customer ? (
                          <Link
                            href={`/dashboard/customers/${sale.customer.id}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {sale.customer.name}
                          </Link>
                        ) : (
                          <span className="pill-muted">Mostrador</span>
                        )}
                      </td>
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
        </section>
      ))}

      {loading ? <p className="page-kicker">Cargando...</p> : null}
      {!loading && !sales.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          Sin tickets en este periodo.
        </div>
      ) : null}

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle>Ticket {selected?.ticketNumber}</DialogTitle>
        <DialogContent dividers>
          {selected ? (
            <div className="page-stack">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="Fecha y hora" value={formatDateTime(selected.soldAt)} />
                <DetailField label="Cajero" value={selected.cashier?.name ?? "—"} />
                <DetailField label="Cliente" value={selected.customer?.name ?? "Mostrador"} />
                <DetailField
                  label="Pagó con / cambio"
                  value={`${formatMoney(selected.amountTendered)} / ${formatMoney(selected.changeAmount)}`}
                />
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th style={{ textAlign: "right" }}>Cant.</th>
                    <th style={{ textAlign: "right" }}>Precio</th>
                    <th style={{ textAlign: "right" }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.productName}
                        {item.priceTier === "wholesale" ? (
                          <span className="page-kicker" style={{ margin: "0 0 0 6px", color: "#c62828" }}>
                            mayoreo
                          </span>
                        ) : null}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {formatQuantity(item.quantity)} {item.saleUnit === "liter" ? "L" : "pz"}
                      </td>
                      <td style={{ textAlign: "right" }}>{formatMoney(item.unitPrice)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ color: "var(--muted)" }}>
                      {formatQuantity(selected.itemsCount)}{" "}
                      {Number(selected.itemsCount) === 1 ? "producto" : "productos"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>Total</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {formatMoney(selected.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              {selected.status === POS_SALE_STATUS.VOIDED ? (
                <p className="page-kicker" style={{ color: "#c62828" }}>
                  Anulado {formatDateTime(selected.voidedAt)}
                  {selected.voidReason ? `: ${selected.voidReason}` : ""}
                </p>
              ) : null}
              {selected.notes ? <DetailField label="Notas" value={selected.notes} /> : null}
            </div>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
