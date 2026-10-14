"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Tooltip } from "@mui/material";
import { CloudOff, Factory, PackageCheck, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import {
  FACTORY_RETURN_REASON_LABELS,
  POS_RETURN_REASON_LABELS,
  posPaymentMethodLabel,
} from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { FactoryReturn, ListResponse, PosReturn } from "@/types";
import { toast } from "sonner";
import { FilterBar, FilterDateRange, FilterMeta, type DateRangeOption } from "../FilterBar";
import { formatDateTime, shiftDateOnly, todayInMexico } from "../pos-labels";

const RANGES: DateRangeOption[] = [
  { key: "hoy", label: "Hoy", days: 0 },
  { key: "7d", label: "7 días", days: 6 },
  { key: "30d", label: "30 días", days: 29 },
];

function unitLabel(saleUnit: string): string {
  return saleUnit === "liter" ? "L" : "pz";
}

/**
 * Devoluciones de la sucursal, las dos clases juntas y separadas:
 *
 * - **De cliente**: dinero que salió de la caja (por la forma de pago del
 *   ticket) y, por partida, producto que volvió al anaquel o se fue a merma.
 *   Ya están restadas en Cortes el día en que se hicieron.
 * - **A fábrica**: lo roto o echado a perder que se llevó el transportista.
 *   No toca dinero; sale del inventario y se ve en rojo en su pedido.
 */
export function BranchReturnsTab({ branchId }: { branchId: string }) {
  const { subscribe } = useRealtime();
  const [from, setFrom] = useState(shiftDateOnly(todayInMexico(), -6));
  const [to, setTo] = useState(todayInMexico());
  const [customer, setCustomer] = useState<PosReturn[]>([]);
  const [factory, setFactory] = useState<FactoryReturn[]>([]);
  const [totals, setTotals] = useState({ customer: 0, factory: 0 });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { branchId, from, to, limit: 200 };
      const [customerResult, factoryResult] = await Promise.all([
        httpClient.get<ListResponse<PosReturn>>("/pos/returns", params),
        httpClient.get<ListResponse<FactoryReturn>>("/pos/factory-returns", params),
      ]);
      setCustomer(customerResult.items);
      setFactory(factoryResult.items);
      setTotals({ customer: customerResult.total, factory: factoryResult.total });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar las devoluciones"));
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Una devolución de cliente avisa como venta; la de fábrica, como pedido de surtido.
  useEffect(() => {
    return subscribe((event) => {
      if (
        (event.type === "pos_sales_changed" || event.type === "restock_orders_changed") &&
        event.branchId === branchId
      ) {
        void load();
      }
    });
  }, [subscribe, branchId, load]);

  const summary = useMemo(() => {
    let refunded = 0;
    let restocked = 0;
    let waste = 0;
    for (const ret of customer) {
      refunded += Number(ret.total);
      for (const item of ret.items ?? []) {
        if (item.restock) restocked += Number(item.total);
        else waste += Number(item.total);
      }
    }
    const factoryValue = factory.reduce((sum, ret) => sum + Number(ret.total ?? 0), 0);
    return { refunded, restocked, waste, factoryValue };
  }, [customer, factory]);

  return (
    <div className="page-stack">
      <FilterBar>
        <FilterDateRange
          from={from}
          to={to}
          options={RANGES}
          onChange={(range) => {
            setFrom(range.from);
            setTo(range.to);
          }}
        />
        <FilterMeta>
          {totals.customer} de cliente · {totals.factory} a fábrica
          {loading ? " · cargando…" : ""}
        </FilterMeta>
      </FilterBar>

      <section className="grid grid-4">
        <div className="card metric">
          <div className="metric-head">
            <span>Devuelto a clientes</span>
            <div className="metric-icon">
              <Undo2 size={22} />
            </div>
          </div>
          <strong>{formatMoney(summary.refunded)}</strong>
          <small>
            {customer.length} {customer.length === 1 ? "devolución" : "devoluciones"} · ya restado en Cortes
          </small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Volvió al anaquel</span>
            <div className="metric-icon">
              <PackageCheck size={22} />
            </div>
          </div>
          <strong>{formatMoney(summary.restocked)}</strong>
          <small>De clientes, en buen estado: regresó al inventario</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>A merma</span>
            <div className="metric-icon">
              <Trash2 size={22} />
            </div>
          </div>
          <strong>{formatMoney(summary.waste)}</strong>
          <small>De clientes: se regresó el dinero y el producto no vuelve</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>A fábrica</span>
            <div className="metric-icon">
              <Factory size={22} />
            </div>
          </div>
          <strong>{formatMoney(summary.factoryValue)}</strong>
          <small>
            {factory.length} {factory.length === 1 ? "devolución" : "devoluciones"} a precio de tienda · no toca la caja
          </small>
        </div>
      </section>

      <section className="panel">
        <div className="p-5" style={{ paddingBottom: 8 }}>
          <h2>
            De cliente
          </h2>
          <p className="page-kicker" style={{ margin: "4px 0 0" }}>
            Lo que un cliente regresó de un ticket de esta sucursal. Resta en Cortes el día de la devolución, por la forma
            de pago del ticket.
          </p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Fecha</th>
                <th>Folio</th>
                <th>Ticket</th>
                <th>Cliente</th>
                <th>Cajero</th>
                <th style={{ minWidth: 360 }}>Productos</th>
                <th style={{ textAlign: "right", width: 130 }}>Devuelto</th>
              </tr>
            </thead>
            <tbody>
              {customer.map((ret) => (
                <tr key={ret.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(ret.returnedAt)}</td>
                  <td style={{ fontWeight: 600, color: "var(--glam-navy)", whiteSpace: "nowrap" }}>
                    {ret.returnNumber}
                    {ret.recordedOffline ? (
                      <Tooltip title="Se hizo sin internet y subió después">
                        <span style={{ marginLeft: 6, color: "#b45309", verticalAlign: "middle" }}>
                          <CloudOff size={13} />
                        </span>
                      </Tooltip>
                    ) : null}
                    {ret.refundMismatch ? (
                      <Tooltip title="La caja regresó un monto distinto al que calcula el sistema; se guardó lo que regresó la caja">
                        <span style={{ marginLeft: 6, color: "#c62828", verticalAlign: "middle" }}>
                          <TriangleAlert size={13} />
                        </span>
                      </Tooltip>
                    ) : null}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{ret.sale?.ticketNumber ?? "—"}</td>
                  <td>{ret.customer?.name ?? <span className="pill-muted">Mostrador</span>}</td>
                  <td>{ret.cashier?.name ?? "—"}</td>
                  <td>
                    {(ret.items ?? []).map((item) => (
                      <div key={item.id} style={{ fontSize: 13 }}>
                        {formatQuantity(item.quantity)} {unitLabel(item.saleUnit)} {item.productName}
                        <span className="page-kicker" style={{ margin: "0 0 0 6px" }}>
                          {POS_RETURN_REASON_LABELS[item.reason] ?? item.reason} ·{" "}
                          <span style={{ color: item.restock ? "#15803d" : "#b45309" }}>
                            {item.restock ? "al anaquel" : "merma"}
                          </span>
                        </span>
                      </div>
                    ))}
                    {ret.notes ? (
                      <div className="page-kicker" style={{ margin: "2px 0 0" }}>
                        Nota: {ret.notes}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <b style={{ color: "#c62828" }}>-{formatMoney(ret.total)}</b>
                    <div className="page-kicker" style={{ margin: 0 }}>
                      {posPaymentMethodLabel(ret.paymentMethod)}
                    </div>
                  </td>
                </tr>
              ))}
              {!customer.length && !loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "var(--muted)" }}>
                    Sin devoluciones de cliente en este periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="p-5" style={{ paddingBottom: 8 }}>
          <h2>
            A fábrica
          </h2>
          <p className="page-kicker" style={{ margin: "4px 0 0" }}>
            Lo roto o echado a perder que se llevó el transportista. Sale del inventario y se ve en rojo en el pedido; no
            toca el dinero de la caja.
          </p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Fecha</th>
                <th>Folio</th>
                <th>Pedido</th>
                <th>Entregó</th>
                <th style={{ minWidth: 360 }}>Productos</th>
                <th style={{ textAlign: "right", width: 130 }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {factory.map((ret) => (
                <tr key={ret.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(ret.createdAt)}</td>
                  <td style={{ fontWeight: 600, color: "var(--glam-navy)", whiteSpace: "nowrap" }}>{ret.folio}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {ret.restockOrderId ? (
                      <Link href={`/dashboard/pos/surtido/pedidos/${ret.restockOrderId}`}>
                        {ret.restockOrderId.slice(0, 8).toUpperCase()}
                      </Link>
                    ) : (
                      <span className="pill-muted">Sin pedido</span>
                    )}
                  </td>
                  <td>{ret.user?.name ?? "—"}</td>
                  <td>
                    {ret.items.map((item) => (
                      <div key={item.id} style={{ fontSize: 13 }}>
                        {formatQuantity(item.quantity)} {unitLabel(item.saleUnit)} {item.productName}
                        <span className="page-kicker" style={{ margin: "0 0 0 6px" }}>
                          {FACTORY_RETURN_REASON_LABELS[item.reason] ?? item.reason}
                        </span>
                      </div>
                    ))}
                    {ret.notes ? (
                      <div className="page-kicker" style={{ margin: "2px 0 0" }}>
                        Nota: {ret.notes}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(ret.total)}</td>
                </tr>
              ))}
              {!factory.length && !loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)" }}>
                    Sin devoluciones a fábrica en este periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
