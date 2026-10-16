"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, ClipboardList, RefreshCw, Search, Send, Truck } from "lucide-react";
import { toast } from "sonner";
import { BRANCH_TYPES, RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { isAwaitingRestockOrder } from "@/components/pos-admin/RestockOrderActions";
import { blockingRestockOrder } from "@/components/pos-admin/RestockAwaitingDialog";
import { formatDateTime, relativeDays } from "@/components/pos-admin/pos-labels";
import { usePosLinks } from "@/components/pos-admin/pos-links";
import type { Branch, BranchShortage, ListResponse, RestockOrder } from "@/types";

/**
 * En qué va el pedido de cada sucursal:
 * - `draft`: hay un pedido creado que todavía no se envía (Por enviar);
 * - `pending`: tiene faltante y nada en camino (Por pedir);
 * - `transit`: ya se envió a fábrica y no ha llegado (En camino);
 * - `ok`: sin faltante ni pedido abierto (Al día).
 */
type Step = "draft" | "pending" | "transit" | "ok" | "loading";
type Filter = "todo" | "draft" | "pending" | "transit" | "ok";

const STEP_ORDER: Record<Step, number> = { draft: 0, pending: 1, transit: 2, loading: 3, ok: 4 };
const STEP_LABELS: Record<Step, string> = {
  draft: "Por enviar",
  pending: "Por pedir",
  transit: "En camino",
  ok: "Al día",
  loading: "Calculando…",
};

interface Row {
  branch: Branch;
  step: Step;
  /** El pedido abierto más viejo: el que manda (por enviar o en camino). */
  order: RestockOrder | null;
  /** Productos con algo que pedir hoy; `null` mientras se calcula. */
  missing: number | null;
}

function OrderCard({ row }: { row: Row }) {
  const links = usePosLinks();
  const { branch, step, order, missing } = row;
  const href = step === "transit" && order ? links.orderSheet(order.id) : links.review(branch.id);
  const detail =
    step === "draft" && order
      ? `Creado ${formatDateTime(order.createdAt)} · sin enviar`
      : step === "transit" && order
        ? `Enviado ${formatDateTime(order.sentAt ?? order.createdAt)} · ${relativeDays(order.sentAt ?? order.createdAt)}`
        : step === "pending"
          ? `${missing} ${missing === 1 ? "producto" : "productos"} por pedir`
          : step === "ok"
            ? "Completa en su stock"
            : "Calculando el faltante…";
  const action =
    step === "draft" ? "Revisar y enviar" : step === "transit" ? "Ver pedido" : "Hacer pedido";
  const Icon = step === "ok" ? CheckCircle2 : step === "transit" ? Truck : step === "draft" ? Send : ClipboardList;

  return (
    <Link href={href} className={`sup-card sup-order is-${step}`}>
      <div className="sup-branch-head">
        <span className={`sup-light is-step-${step}`} aria-hidden>
          <Icon size={16} />
        </span>
        <div className="sup-branch-name">
          <strong>{branch.name}</strong>
          <small>{[branch.code, branch.city].filter(Boolean).join(" · ")}</small>
        </div>
        <span className={`sup-pill is-step-${step}`}>{STEP_LABELS[step]}</span>
      </div>
      <p className="sup-order-detail">{detail}</p>
      <span className="sup-card-link">
        {action}
        <ChevronRight size={16} />
      </span>
    </Link>
  );
}

/**
 * Pedidos a fábrica de todas las sucursales, para el supervisor: qué sucursal
 * tiene un pedido por enviar, cuál tiene faltante sin pedir, qué va en camino.
 * Cada tarjeta abre la revisión de esa sucursal (Resumen o Formato), donde se
 * editan cantidades y se envía; lo que va en camino abre su hoja.
 */
export function SupervisorOrdersPage() {
  const { subscribe } = useRealtime();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [missingByBranch, setMissingByBranch] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("todo");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [branchList, orderList] = await Promise.all([
        httpClient.get<ListResponse<Branch>>("/pos/branches", { limit: 200, isActive: "true" }),
        httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", { limit: 100 }),
      ]);
      const stores = branchList.items.filter((branch) => branch.type === BRANCH_TYPES.BRANCH);
      setBranches(stores);
      setOrders(orderList.items.filter((order) => order.origin !== RESTOCK_ORIGIN.FRANCHISE));
      setMissingByBranch((prev) => Object.fromEntries(stores.map((branch) => [branch.id, prev[branch.id] ?? null])));
      // El faltante se calcula por sucursal: en paralelo, y cada tarjeta se pinta al llegar la suya.
      await Promise.all(
        stores.map(async (branch) => {
          try {
            const rows = await httpClient.get<BranchShortage[]>(`/pos/restock/branches/${branch.id}/shortages`);
            const count = rows.filter((row) => Number(row.requestedQty) > 0).length;
            setMissingByBranch((prev) => ({ ...prev, [branch.id]: count }));
          } catch {
            setMissingByBranch((prev) => ({ ...prev, [branch.id]: 0 }));
          }
        })
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los pedidos"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Un pedido que se envía (aquí o en el panel) cambia su tarjeta.
  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "restock_orders_changed") void load();
    });
  }, [subscribe, load]);

  const rows: Row[] = useMemo(
    () =>
      branches
        .map((branch) => {
          const awaiting = orders.filter((order) => order.branchId === branch.id && isAwaitingRestockOrder(order));
          // Igual que la revisión: con algo ya enviado manda ese (en camino);
          // solo si todo lo abierto está sin enviar, es un pedido por enviar.
          const sent = awaiting.filter((order) => order.status !== RESTOCK_ORDER_STATUS.PENDING);
          const order = blockingRestockOrder(sent.length ? sent : awaiting);
          const missing = missingByBranch[branch.id] ?? null;
          const step: Step = order
            ? sent.length
              ? "transit"
              : "draft"
            : missing === null
              ? "loading"
              : missing > 0
                ? "pending"
                : "ok";
          return { branch, step, order, missing };
        })
        .sort((a, b) => STEP_ORDER[a.step] - STEP_ORDER[b.step] || a.branch.name.localeCompare(b.branch.name)),
    [branches, orders, missingByBranch]
  );

  const counts = useMemo(() => {
    const of = (step: Step) => rows.filter((row) => row.step === step).length;
    return { todo: rows.length, draft: of("draft"), pending: of("pending"), transit: of("transit"), ok: of("ok") };
  }, [rows]);

  const shown = rows.filter((row) => {
    if (filter !== "todo" && row.step !== filter) return false;
    const term = search.trim().toLowerCase();
    return !term || `${row.branch.code} ${row.branch.name} ${row.branch.city ?? ""}`.toLowerCase().includes(term);
  });

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "todo", label: "Todas" },
    { key: "draft", label: "Por enviar" },
    { key: "pending", label: "Por pedir" },
    { key: "transit", label: "En camino" },
    { key: "ok", label: "Al día" },
  ];

  return (
    <div className="sup-page">
      <div className="sup-page-head">
        <div>
          <h1>Pedidos a fábrica</h1>
          <p>Abre una sucursal para revisar su pedido, ajustar cantidades y enviarlo.</p>
        </div>
        <button type="button" className="sup-icon-button" onClick={() => void load()} disabled={loading} aria-label="Actualizar">
          <RefreshCw size={18} className={loading ? "sup-spin" : undefined} />
        </button>
      </div>

      <div className="sup-summary is-five" role="tablist" aria-label="Filtrar por paso">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`sup-summary-item is-step-${key}${filter === key ? " is-active" : ""}`}
            onClick={() => setFilter(key)}
          >
            <b>{counts[key]}</b>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <label className="sup-search">
        <Search size={16} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar sucursal"
          aria-label="Buscar sucursal"
        />
      </label>

      {loading && !rows.length ? <p className="page-kicker">Cargando pedidos…</p> : null}
      {!loading && !shown.length ? <p className="sup-empty">Ninguna sucursal en este filtro.</p> : null}

      <div className="sup-grid">
        {shown.map((row) => (
          <OrderCard key={row.branch.id} row={row} />
        ))}
      </div>
    </div>
  );
}
