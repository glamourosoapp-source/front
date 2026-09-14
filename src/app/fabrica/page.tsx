"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button, Chip, Tab, Tabs, TextField } from "@mui/material";
import {
  AlertTriangle,
  Boxes,
  Droplets,
  LogOut,
  Package,
  PackageCheck,
  RefreshCw,
  Send,
  Tags,
  Truck,
} from "lucide-react";
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

/** Día de Ciudad de México desplazado, para los rangos rápidos. */
function dayInMexico(offset: number): string {
  const now = new Date();
  now.setDate(now.getDate() + offset);
  return now.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function firstOfMonthInMexico(): string {
  return `${todayInMexico().slice(0, 7)}-01`;
}

/** "1 bidón" y no "1 bidones": lo lee una persona de almacén. */
function unitLabel(quantity: number, unit: string): string {
  if (unit === "bidon") return quantity === 1 ? "bidón" : "bidones";
  return quantity === 1 ? "pieza" : "piezas";
}

/**
 * Rangos que de verdad se usan en almacén: cuánto salió hoy, cuánto ayer,
 * cuánto en la semana. Teclear dos fechas para ver el día de hoy es trabajo
 * que no hacía falta.
 */
const RANGES: Array<{ key: string; label: string; from: () => string; to: () => string }> = [
  { key: "hoy", label: "Hoy", from: todayInMexico, to: todayInMexico },
  { key: "ayer", label: "Ayer", from: () => dayInMexico(-1), to: () => dayInMexico(-1) },
  { key: "7d", label: "Últimos 7 días", from: () => dayInMexico(-6), to: todayInMexico },
  { key: "mes", label: "Este mes", from: firstOfMonthInMexico, to: todayInMexico },
];

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
  /** Nota de envío en captura, por pedido. Se manda al marcar enviado. */
  const [dispatchNotes, setDispatchNotes] = useState<Record<string, string>>({});

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

  async function setItemNotes(order: RestockOrder, item: RestockOrderItem, value: string) {
    try {
      const updated = await httpClient.put<RestockOrder>(
        `/factory/orders/${order.id}/items/${item.id}`,
        { notes: value }
      );
      setPending((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar la nota"));
    }
  }

  async function send(order: RestockOrder) {
    setSendingId(order.id);
    try {
      await httpClient.post(`/factory/orders/${order.id}/send`, {
        notes: dispatchNotes[order.id]?.trim() || null,
      });
      toast.success(`Pedido de ${order.branch?.code} enviado: el inventario de la sucursal ya subió`);
      setDispatchNotes((current) => {
        const next = { ...current };
        delete next[order.id];
        return next;
      });
      await loadPending();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo enviar el pedido"));
    } finally {
      setSendingId(null);
    }
  }

  /**
   * Partidas donde se manda MENOS de lo pedido. Es el caso que hay que
   * explicar: quien pidió ve el pedido después y sin motivo no sabe si fue
   * falta de inventario, un error de captura o que se le olvidó a alguien.
   */
  const shortItems = useMemo(
    () =>
      new Map(
        pending.map((order) => [
          order.id,
          (order.items ?? []).filter(
            (item) =>
              item.dispatchedQty != null &&
              Number(item.dispatchedQty) < Number(item.requestedQty)
          ),
        ])
      ),
    [pending]
  );

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
                      <th>Motivo (si mandas menos)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.items ?? []).map((item) => {
                      const short =
                        item.dispatchedQty != null &&
                        Number(item.dispatchedQty) < Number(item.requestedQty);
                      return (
                      <tr
                        key={item.id}
                        className={`${item.prepared ? "prepared" : ""} ${short ? "short" : ""}`}
                      >
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
                        <td>
                          <input
                            className={`factory-note ${short && !item.notes ? "needed" : ""}`}
                            defaultValue={item.notes ?? ""}
                            placeholder={
                              short ? "Por qué mandas menos" : "Opcional"
                            }
                            maxLength={500}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value === (item.notes ?? "")) return;
                              void setItemNotes(order, item, value);
                            }}
                            aria-label={`Motivo de ${item.productName}`}
                          />
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="page-kicker" style={{ marginBottom: 0 }}>
                  Si mandas una cantidad distinta, escríbela: el inventario de la sucursal sube con
                  lo que realmente despachaste. En blanco se usa lo pedido.
                </p>

                {(shortItems.get(order.id) ?? []).length ? (
                  <div className="factory-short-warning">
                    <AlertTriangle size={18} style={{ flex: "0 0 auto", marginTop: 1 }} />
                    <span>
                      Vas a mandar menos de lo pedido en{" "}
                      <strong>
                        {(shortItems.get(order.id) ?? []).length}{" "}
                        {(shortItems.get(order.id) ?? []).length === 1 ? "partida" : "partidas"}
                      </strong>
                      . Escribe el motivo de cada una: {order.origin === RESTOCK_ORIGIN.FRANCHISE
                        ? "la franquicia lo ve en su historial de pedidos."
                        : "queda en el pedido para quien lo revise."}
                    </span>
                  </div>
                ) : null}

                <div className="factory-dispatch-note">
                  <label htmlFor={`nota-${order.id}`}>
                    Nota del envío (la lee quien pidió)
                  </label>
                  <textarea
                    id={`nota-${order.id}`}
                    value={dispatchNotes[order.id] ?? ""}
                    placeholder="Ej. Faltó desengrasante, el resto sale el jueves."
                    maxLength={500}
                    onChange={(event) =>
                      setDispatchNotes((current) => ({
                        ...current,
                        [order.id]: event.target.value,
                      }))
                    }
                  />
                </div>
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
                    {(order.items ?? []).map((item) => {
                      const enviado = Number(item.dispatchedQty ?? item.requestedQty);
                      const short = enviado < Number(item.requestedQty);
                      return (
                        <tr key={item.id} className={short ? "short" : ""}>
                          <td>
                            {item.productName}
                            {item.notes ? (
                              <p className="factory-note-read">{item.notes}</p>
                            ) : null}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {formatQuantity(enviado)} {item.unit === "bidon" ? "bidones" : "pz"}
                            {short ? (
                              <div className="page-kicker" style={{ margin: 0 }}>
                                de {formatQuantity(item.requestedQty)} pedidos
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {order.dispatchNotes ? (
                  <div className="factory-short-warning" style={{ marginTop: 12 }}>
                    <span>{order.dispatchNotes}</span>
                  </div>
                ) : null}
              </div>
            ))}
            {!history.length && !loading ? (
              <div className="factory-card factory-empty">Todavía no hay pedidos enviados.</div>
            ) : null}
          </>
        ) : null}

        {tab === 2 ? (
          <div className="factory-card">
            <div className="factory-range">
              <div className="factory-presets">
                {RANGES.map((range) => (
                  <button
                    key={range.key}
                    type="button"
                    className={`factory-preset ${
                      from === range.from() && to === range.to() ? "active" : ""
                    }`}
                    onClick={() => {
                      setFrom(range.from());
                      setTo(range.to());
                    }}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <TextField
                label="Desde"
                type="date"
                size="small"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Hasta"
                type="date"
                size="small"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <Button variant="outlined" onClick={() => void loadStats()}>
                Ver
              </Button>
            </div>

            <div className="factory-metrics">
              <div className="factory-metric">
                <span className="factory-metric-icon">
                  <Droplets size={22} />
                </span>
                <div className="factory-metric-body">
                  <div className="factory-metric-label">Litros despachados</div>
                  <div className="factory-metric-value">
                    {formatQuantity(stats?.totalLiters ?? 0)}
                    <small>L</small>
                  </div>
                </div>
              </div>
              <div className="factory-metric">
                <span className="factory-metric-icon">
                  <Boxes size={22} />
                </span>
                <div className="factory-metric-body">
                  <div className="factory-metric-label">Bidones</div>
                  <div className="factory-metric-value">
                    {formatQuantity(stats?.totalBidones ?? 0)}
                  </div>
                </div>
              </div>
              <div className="factory-metric">
                <span className="factory-metric-icon">
                  <Package size={22} />
                </span>
                <div className="factory-metric-body">
                  <div className="factory-metric-label">Piezas</div>
                  <div className="factory-metric-value">
                    {formatQuantity(stats?.totalPieces ?? 0)}
                  </div>
                </div>
              </div>
              <div className="factory-metric">
                <span className="factory-metric-icon">
                  <Tags size={22} />
                </span>
                <div className="factory-metric-body">
                  <div className="factory-metric-label">Productos distintos</div>
                  <div className="factory-metric-value">{stats?.items.length ?? 0}</div>
                </div>
              </div>
            </div>

            {stats?.items.length ? (
              <table className="factory-table">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>#</th>
                    <th>Producto</th>
                    <th style={{ width: 150, textAlign: "right" }}>Despachado</th>
                    <th style={{ width: 110, textAlign: "right" }}>Litros</th>
                    <th style={{ width: 110, textAlign: "right" }}>Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.items.map((row, index) => (
                    <tr key={`${row.name}-${row.unit}`}>
                      <td>
                        <span className={`factory-rank ${index < 3 ? "top" : ""}`}>
                          {index + 1}
                        </span>
                      </td>
                      <td>
                        <strong>{row.name}</strong>
                        {/*
                          Barra proporcional al más despachado del periodo: de un
                          vistazo se ve qué hay que producir primero, sin comparar
                          números renglón por renglón.
                        */}
                        <div className="factory-bar">
                          <span
                            style={{
                              width: `${Math.max(
                                2,
                                (row.dispatched / (stats.items[0]?.dispatched || 1)) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="factory-num">
                        <strong>{formatQuantity(row.dispatched)}</strong>{" "}
                        {unitLabel(row.dispatched, row.unit)}
                      </td>
                      <td className="factory-num">
                        {row.liters ? `${formatQuantity(row.liters)} L` : "—"}
                      </td>
                      <td className="factory-num">{row.orders}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td>Total del periodo</td>
                    <td className="factory-num">
                      {formatQuantity(stats.totalBidones)} bidones ·{" "}
                      {formatQuantity(stats.totalPieces)} pz
                    </td>
                    <td className="factory-num">{formatQuantity(stats.totalLiters)} L</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            ) : (
              <div className="factory-empty" style={{ padding: "34px 12px" }}>
                <PackageCheck size={30} style={{ color: "var(--muted)" }} />
                <h2 style={{ fontSize: 18 }}>Sin despachos en este periodo</h2>
                <p>Elige otro rango de fechas o marca un pedido como enviado.</p>
              </div>
            )}
          </div>
        ) : null}

        {loading ? <p className="page-kicker">Cargando...</p> : null}
      </div>
    </main>
  );
}
