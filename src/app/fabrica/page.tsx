"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button, Chip, Tab, Tabs, TextField } from "@mui/material";
import { LogOut, PackageCheck, RefreshCw, Send, Truck } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useAuthStore } from "@/stores/auth.store";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { formatQuantity } from "@/lib/format-money";
import { RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import { ListResponse, RestockOrder, RestockOrderItem } from "@/types";
import { toast } from "sonner";

interface FactoryStats {
  items: Array<{ name: string; unit: string; dispatched: number; liters: number; orders: number }>;
  totalLiters: number;
  totalPieces: number;
  totalBidones: number;
}

const ORIGIN_LABELS: Record<string, string> = {
  shortage_auto: "corte automático",
  shortage_manual: "manual",
  franchise: "franquicia",
};

function todayInMexico(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

export default function FactoryPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { subscribe } = useRealtime();

  const [tab, setTab] = useState(0);
  const [pending, setPending] = useState<RestockOrder[]>([]);
  const [history, setHistory] = useState<RestockOrder[]>([]);
  const [stats, setStats] = useState<FactoryStats | null>(null);
  const [from, setFrom] = useState(todayInMexico());
  const [to, setTo] = useState(todayInMexico());
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const result = await httpClient.get<ListResponse<RestockOrder>>("/factory/orders", {
        limit: 100,
      });
      setPending(result.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los pedidos"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await httpClient.get<ListResponse<RestockOrder>>("/factory/history", {
        limit: 100,
      });
      setHistory(result.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el historial"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setStats(await httpClient.get<FactoryStats>("/factory/stats", { from, to }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el resumen"));
    }
  }, [from, to]);

  useEffect(() => {
    if (tab === 0) void loadPending();
    else if (tab === 1) void loadHistory();
    else void loadStats();
  }, [tab, loadPending, loadHistory, loadStats]);

  // Una sucursal generó su corte: el pedido aparece sin recargar la tablet.
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === "restock_orders_changed" && tab === 0) void loadPending();
    });
    return unsubscribe;
  }, [subscribe, tab, loadPending]);

  async function toggleItem(order: RestockOrder, item: RestockOrderItem, prepared: boolean) {
    try {
      const updated = await httpClient.put<RestockOrder>(
        `/factory/orders/${order.id}/items/${item.id}`,
        { prepared }
      );
      setPending((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo marcar la partida"));
    }
  }

  async function setDispatched(order: RestockOrder, item: RestockOrderItem, value: string) {
    const parsed = value === "" ? null : Number(value);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    try {
      const updated = await httpClient.put<RestockOrder>(
        `/factory/orders/${order.id}/items/${item.id}`,
        { dispatchedQty: parsed }
      );
      setPending((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar la cantidad"));
    }
  }

  async function send(order: RestockOrder) {
    setSendingId(order.id);
    try {
      await httpClient.post(`/factory/orders/${order.id}/send`, {});
      toast.success(`Pedido de ${order.branch?.code} enviado: el inventario de la sucursal ya subió`);
      await loadPending();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo enviar el pedido"));
    } finally {
      setSendingId(null);
    }
  }

  const readyToSend = useMemo(
    () =>
      new Map(
        pending.map((order) => [
          order.id,
          (order.items ?? []).length > 0 && (order.items ?? []).every((item) => item.prepared),
        ])
      ),
    [pending]
  );

  return (
    <main className="factory">
      <header className="factory-topbar">
        <Image
          className="pos-logo"
          src="/branding/glamouroso-logo-azul-sobre-blanco.svg"
          alt="Glamouroso"
          width={478}
          height={117}
          priority
        />
        <div>
          <strong style={{ fontSize: 18, color: "var(--glam-navy)" }}>Fábrica · surtido</strong>
          <div className="page-kicker" style={{ margin: 0 }}>
            {user?.name}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button startIcon={<RefreshCw size={18} />} onClick={() => void loadPending()}>
          Actualizar
        </Button>
        <Button startIcon={<LogOut size={18} />} onClick={() => logout()}>
          Salir
        </Button>
      </header>

      <div className="factory-body">
        <Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab label={`Por enviar (${pending.length})`} />
          <Tab label="Enviados" />
          <Tab label="Información" />
        </Tabs>

        {tab === 0 ? (
          <>
            {pending.map((order) => (
              <div key={order.id} className="factory-card">
                <div className="factory-card-head">
                  <Truck size={20} style={{ color: "var(--glam-blue)" }} />
                  <span className="factory-branch">
                    {order.branch?.code} · {order.branch?.name}
                  </span>
                  <Chip label={ORIGIN_LABELS[order.origin] ?? order.origin} size="small" variant="outlined" />
                  <span className="page-kicker" style={{ margin: 0 }}>
                    {order.createdAt
                      ? new Date(order.createdAt).toLocaleDateString("es-MX", { dateStyle: "long" })
                      : ""}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button
                    className="factory-send"
                    disabled={!readyToSend.get(order.id) || sendingId === order.id}
                    onClick={() => void send(order)}
                    title={
                      readyToSend.get(order.id)
                        ? "Carga el inventario de la sucursal"
                        : "Marca todas las partidas como preparadas"
                    }
                  >
                    <Send size={18} />
                    {sendingId === order.id ? "Enviando..." : "Marcar enviado"}
                  </button>
                </div>

                <table className="factory-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Listo</th>
                      <th>Producto</th>
                      <th style={{ width: 130, textAlign: "right" }}>Pedido</th>
                      <th style={{ width: 150, textAlign: "right" }}>Despachado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.items ?? []).map((item) => (
                      <tr key={item.id} className={item.prepared ? "prepared" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            className="factory-check"
                            checked={item.prepared}
                            onChange={(event) => void toggleItem(order, item, event.target.checked)}
                            aria-label={`Preparado ${item.productName}`}
                          />
                        </td>
                        <td>
                          <strong>{item.productName}</strong>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span className="factory-requested">
                            {formatQuantity(item.requestedQty)}
                          </span>{" "}
                          {item.unit === "bidon" ? "bidones" : "pz"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <input
                            className="factory-qty"
                            defaultValue={item.dispatchedQty == null ? "" : String(item.dispatchedQty)}
                            placeholder={String(item.requestedQty)}
                            onBlur={(event) => void setDispatched(order, item, event.target.value)}
                            inputMode="numeric"
                            aria-label={`Despachado ${item.productName}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="page-kicker" style={{ marginBottom: 0 }}>
                  Si mandas una cantidad distinta, escríbela: el inventario de la sucursal sube con
                  lo que realmente despachaste. En blanco se usa lo pedido.
                </p>
              </div>
            ))}
            {!pending.length && !loading ? (
              <div className="factory-card factory-empty">
                <PackageCheck size={34} style={{ color: "#15803d" }} />
                <h2>No hay pedidos por enviar</h2>
                <p>Cuando una sucursal haga su corte de faltantes, aparecerá aquí.</p>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === 1 ? (
          <>
            {history.map((order) => (
              <div key={order.id} className="factory-card">
                <div className="factory-card-head">
                  <span className="factory-branch">
                    {order.branch?.code} · {order.branch?.name}
                  </span>
                  <Chip
                    label={order.status === "received" ? "Recibido en sucursal" : "Enviado"}
                    size="small"
                    color="success"
                  />
                  <span className="page-kicker" style={{ margin: 0 }}>
                    {order.sentAt
                      ? new Date(order.sentAt).toLocaleString("es-MX", {
                          dateStyle: "long",
                          timeStyle: "short",
                        })
                      : ""}
                  </span>
                </div>
                <table className="factory-table">
                  <tbody>
                    {(order.items ?? []).map((item) => (
                      <tr key={item.id}>
                        <td>{item.productName}</td>
                        <td style={{ textAlign: "right" }}>
                          {formatQuantity(item.dispatchedQty ?? item.requestedQty)}{" "}
                          {item.unit === "bidon" ? "bidones" : "pz"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {!history.length && !loading ? (
              <div className="factory-card factory-empty">Todavía no hay pedidos enviados.</div>
            ) : null}
          </>
        ) : null}

        {tab === 2 ? (
          <div className="factory-card">
            <div className="factory-card-head">
              <TextField
                label="Desde"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Hasta"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <Button variant="outlined" onClick={() => void loadStats()}>
                Ver
              </Button>
            </div>

            <div className="grid-4" style={{ marginBottom: 18 }}>
              <div className="metric">
                <div className="metric-small">Litros despachados</div>
                <div className="metric-strong">{formatQuantity(stats?.totalLiters ?? 0)} L</div>
              </div>
              <div className="metric">
                <div className="metric-small">Bidones</div>
                <div className="metric-strong">{formatQuantity(stats?.totalBidones ?? 0)}</div>
              </div>
              <div className="metric">
                <div className="metric-small">Piezas</div>
                <div className="metric-strong">{formatQuantity(stats?.totalPieces ?? 0)}</div>
              </div>
              <div className="metric">
                <div className="metric-small">Productos distintos</div>
                <div className="metric-strong">{stats?.items.length ?? 0}</div>
              </div>
            </div>

            <table className="factory-table">
              <thead>
                <tr>
                  <th>Producto más solicitado</th>
                  <th style={{ textAlign: "right" }}>Despachado</th>
                  <th style={{ textAlign: "right" }}>Litros</th>
                  <th style={{ textAlign: "right" }}>Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.items ?? []).map((row) => (
                  <tr key={`${row.name}-${row.unit}`}>
                    <td>{row.name}</td>
                    <td style={{ textAlign: "right" }}>
                      {formatQuantity(row.dispatched)} {row.unit === "bidon" ? "bidones" : "pz"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {row.liters ? `${formatQuantity(row.liters)} L` : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>{row.orders}</td>
                  </tr>
                ))}
                {!stats?.items.length ? (
                  <tr>
                    <td colSpan={4} className="factory-empty">
                      Sin despachos en este periodo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {loading ? <p className="page-kicker">Cargando...</p> : null}
      </div>
    </main>
  );
}
