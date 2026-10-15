"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, MenuItem, Tab, Tabs, TextField, Tooltip } from "@mui/material";
import { ArrowRight, CheckCircle2, PackageCheck, PackagePlus, ShieldAlert, Truck } from "lucide-react";
import { toast } from "sonner";
import { BRANCH_TYPES, RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { formatMoney } from "@/lib/format-money";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { Branch, BranchShortage, ListResponse, RestockOrder } from "@/types";
import { FilterBar, FilterDateRange, FilterMeta, FilterSearch, FilterSegmented, type DateRangeOption } from "./FilterBar";
import { RestockOrdersTable } from "./RestockOrdersTable";
import { isAwaitingRestockOrder, isOpenRestockOrder, restockArrivalHref } from "./RestockOrderActions";
import { blockingRestockOrder } from "./RestockAwaitingDialog";
import {
  RESTOCK_STATUS_FILTER_OPTIONS,
  RESTOCK_STATUS_LABELS,
  businessDayOf,
  packSummary,
  packTotals,
  posWeekStart,
  relativeDays,
  restockOrderSheetHref,
  restockReviewHref,
} from "./pos-labels";

const RANGES: DateRangeOption[] = [
  { key: "todo", label: "Todo", days: null },
  { key: "hoy", label: "Hoy", days: 0 },
  { key: "7d", label: "7 días", days: 6 },
  { key: "30d", label: "30 días", days: 29 },
];

type View = "sucursales" | "pedidos";

/** En qué paso va una sucursal: lo que decide su color, su texto y su botón. */
type Step = "pending" | "transit" | "stuck" | "ok" | "loading";
type StepFilter = "all" | "pending" | "transit" | "ok";

/** Un pedido en camino por más de esto se marca como atorado. */
const STUCK_DAYS = 3;

const STEP_FILTERS: Array<{ value: StepFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Por pedir" },
  { value: "transit", label: "En camino" },
  { value: "ok", label: "Al día" },
];

/** Una tarjeta de la bandeja: lo que cada sucursal necesita hoy. */
interface InboxRow {
  branch: Branch;
  /** `null` mientras se calcula o si falló. */
  shortages: BranchShortage[] | null;
  awaiting: RestockOrder[];
  /** El más viejo en camino: el que hay que recibir. */
  inTransit: RestockOrder | null;
  lastReceived: RestockOrder | null;
  step: Step;
}

function ageDays(value: string | null | undefined): number {
  if (!value) return 0;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

/**
 * Luz del paso, hermana del foco de tienda de Sucursales: ámbar "Por pedir",
 * azul "En camino" (con ondas), rojo "Atorado" y verde "Al día".
 */
function RestockStepLight({ step }: { step: Step }) {
  const label =
    step === "pending" ? "Por pedir" : step === "transit" ? "En camino" : step === "stuck" ? "Atorado" : step === "ok" ? "Al día" : "…";
  return (
    <span className={`store-light restock-light is-${step}`}>
      <span className="store-light-dot">
        {step === "ok" ? <CheckCircle2 size={16} /> : <Truck size={16} />}
      </span>
      <span className="store-light-label">{label}</span>
    </span>
  );
}

/**
 * Faltantes y surtido: la bandeja de TODAS las sucursales. No repite la
 * pestaña "Pedidos a fábrica" de cada sucursal (ahí se trabaja el detalle):
 * aquí se ve de un vistazo qué sucursal tiene faltante sin pedir y qué pedidos
 * siguen sin llegar. Confirmar se hace en la sucursal, viendo qué se va a pedir.
 * - **Por sucursal**: una fila por sucursal; clic abre su pestaña de pedidos.
 * - **Pedidos**: todos los pedidos de sucursales con filtros (las franquicias
 *   tienen su propio módulo).
 * La vista va en `?vista=` para poder mandar un link directo.
 */
export function RestockInboxPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canView = can("posRestock", "view");
  const canCreate = can("posRestock", "create");
  const canUpdate = can("posRestock", "update");
  const canDispatch = canUpdate && can("posInventory", "update");
  // El detalle de la sucursal pide Sucursales; sin él, la fila filtra la vista Pedidos.
  const canOpenBranch = can("posBranches", "view");
  const view: View = searchParams.get("vista") === "pedidos" ? "pedidos" : "sucursales";

  const [branches, setBranches] = useState<Branch[]>([]);
  const [shortagesByBranch, setShortagesByBranch] = useState<Record<string, BranchShortage[] | null>>({});
  const [recent, setRecent] = useState<RestockOrder[]>([]);
  const [stepFilter, setStepFilter] = useState<StepFilter>("all");
  const [search, setSearch] = useState("");
  const { subscribe } = useRealtime();

  // Vista Pedidos
  const [branchFilter, setBranchFilter] = useState("");
  const [status, setStatus] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  function selectView(next: View) {
    const query = new URLSearchParams(searchParams.toString());
    if (next === "sucursales") query.delete("vista");
    else query.set("vista", next);
    const qs = query.toString();
    router.replace(`/dashboard/pos/surtido${qs ? `?${qs}` : ""}`);
  }

  const loadInbox = useCallback(async () => {
    if (!canView) return;
    try {
      const [branchList, orderList] = await Promise.all([
        httpClient.get<ListResponse<Branch>>("/pos/branches", { limit: 200, isActive: "true" }),
        httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", { limit: 100 }),
      ]);
      const stores = branchList.items.filter((branch) => branch.type === BRANCH_TYPES.BRANCH);
      setBranches(stores);
      setRecent(orderList.items.filter((order) => order.origin !== RESTOCK_ORIGIN.FRANCHISE));
      // El faltante se calcula por sucursal: en paralelo, y cada fila se pinta
      // en cuanto llega la suya.
      setShortagesByBranch(Object.fromEntries(stores.map((branch) => [branch.id, null])));
      await Promise.all(
        stores.map(async (branch) => {
          try {
            const rows = await httpClient.get<BranchShortage[]>(`/pos/restock/branches/${branch.id}/shortages`);
            setShortagesByBranch((prev) => ({ ...prev, [branch.id]: rows }));
          } catch {
            setShortagesByBranch((prev) => ({ ...prev, [branch.id]: [] }));
          }
        })
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el surtido"));
    }
  }, [canView]);

  const loadOrders = useCallback(async () => {
    if (!canView) return;
    setLoadingOrders(true);
    try {
      const result = await httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", {
        limit: 100,
        ...(branchFilter ? { branchId: branchFilter } : {}),
        ...(status ? { status } : {}),
        ...(range.from ? { from: range.from } : {}),
        ...(range.to ? { to: range.to } : {}),
      });
      // El endpoint no filtra "todo menos franquicia": se descartan al recibir.
      setOrders(result.items.filter((order) => order.origin !== RESTOCK_ORIGIN.FRANCHISE));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los pedidos"));
    } finally {
      setLoadingOrders(false);
    }
  }, [canView, branchFilter, status, range.from, range.to]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (view === "pedidos") void loadOrders();
  }, [view, loadOrders]);

  // Un pedido que se envía o se recibe en otra pantalla cambia la tarjeta.
  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "restock_orders_changed") {
        void loadInbox();
        if (view === "pedidos") void loadOrders();
      }
    });
  }, [subscribe, loadInbox, loadOrders, view]);

  const rows: InboxRow[] = useMemo(() => {
    const order: Record<Step, number> = { stuck: 0, pending: 1, transit: 2, loading: 3, ok: 4 };
    return branches
      .map((branch) => {
        const mine = recent.filter((item) => item.branchId === branch.id);
        const awaiting = mine.filter(isAwaitingRestockOrder);
        const inTransit = blockingRestockOrder(awaiting);
        const shortages = shortagesByBranch[branch.id] ?? null;
        const step: Step = inTransit
          ? ageDays(inTransit.createdAt) > STUCK_DAYS
            ? "stuck"
            : "transit"
          : shortages === null
            ? "loading"
            : shortages.length
              ? "pending"
              : "ok";
        return {
          branch,
          shortages,
          awaiting,
          inTransit,
          lastReceived: mine.find((item) => item.status === RESTOCK_ORDER_STATUS.RECEIVED) ?? null,
          step,
        };
      })
      .sort((a, b) => order[a.step] - order[b.step] || a.branch.code.localeCompare(b.branch.code));
  }, [branches, recent, shortagesByBranch]);

  const kpis = useMemo(() => {
    const weekStart = posWeekStart(businessDayOf(new Date().toISOString()));
    const receivedThisWeek = recent.filter(
      (order) => order.status === RESTOCK_ORDER_STATUS.RECEIVED && businessDayOf(order.receivedAt) >= weekStart
    );
    return {
      pending: rows.filter((row) => row.step === "pending").length,
      transit: rows.filter((row) => row.step === "transit" || row.step === "stuck").length,
      stuck: rows.filter((row) => row.step === "stuck").length,
      receivedCount: receivedThisWeek.length,
      receivedTotal: receivedThisWeek.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
    };
  }, [rows, recent]);

  const shown = rows.filter((row) => {
    if (stepFilter === "pending" && row.step !== "pending") return false;
    if (stepFilter === "transit" && row.step !== "transit" && row.step !== "stuck") return false;
    if (stepFilter === "ok" && row.step !== "ok") return false;
    const term = search.trim().toLowerCase();
    return !term || `${row.branch.code} ${row.branch.name}`.toLowerCase().includes(term);
  });

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Faltantes y surtido necesitan el permiso correspondiente del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  function openBranch(branch: Branch) {
    if (canOpenBranch) {
      router.push(`/dashboard/pos/sucursales/${branch.id}?tab=pedidos`);
      return;
    }
    setBranchFilter(branch.id);
    selectView("pedidos");
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Faltantes y surtido</h1>
          <p className="page-kicker">
            Todas las sucursales de un vistazo: qué falta pedir y qué no ha llegado. El faltante sale del stock
            que cada sucursal debe tener siempre y se pide un empaque completo por cada empaque del que ya se vendió la mitad. Para ver
            el detalle o registrar una llegada, abre la sucursal.
          </p>
        </div>
      </div>

      <Tabs value={view} onChange={(_e, value) => selectView(value as View)}>
        <Tab value="sucursales" label="Por sucursal" />
        <Tab value="pedidos" label="Pedidos" />
      </Tabs>

      {view === "sucursales" ? (
        <>
          <section className="grid grid-4">
            <div className="card metric">
              <div className="metric-head">
                <span>Por pedir</span>
              </div>
              <strong style={{ color: kpis.pending ? "#b45309" : undefined }}>{kpis.pending}</strong>
              <small>{kpis.pending === 1 ? "Sucursal con faltante y nada en camino" : "Sucursales con faltante y nada en camino"}</small>
            </div>
            <div className="card metric">
              <div className="metric-head">
                <span>En camino</span>
              </div>
              <strong style={{ color: "var(--glam-blue)" }}>{kpis.transit}</strong>
              <small>Pedidos enviados a fábrica sin recibir</small>
            </div>
            <div className="card metric">
              <div className="metric-head">
                <span>Atorados</span>
              </div>
              <strong style={{ color: kpis.stuck ? "#c62828" : undefined }}>{kpis.stuck}</strong>
              <small>En camino desde hace más de {STUCK_DAYS} días</small>
            </div>
            <div className="card metric">
              <div className="metric-head">
                <span>Recibido esta semana</span>
              </div>
              <strong>{formatMoney(kpis.receivedTotal)}</strong>
              <small>
                {kpis.receivedCount} {kpis.receivedCount === 1 ? "pedido" : "pedidos"} · semana de viernes a jueves
              </small>
            </div>
          </section>

          <FilterBar>
            <FilterSegmented label="Paso" options={STEP_FILTERS} value={stepFilter} onChange={setStepFilter} />
            <FilterSearch value={search} onChange={setSearch} placeholder="Buscar sucursal por código o nombre" />
            <FilterMeta>
              <Link
                href="/dashboard/pos/formato?vista=no-ligados"
                className="inline-flex items-center gap-1 text-sm"
                style={{ color: "var(--glam-blue)", fontWeight: 600 }}
              >
                Productos vendidos fuera del formato <ArrowRight size={14} />
              </Link>
            </FilterMeta>
          </FilterBar>

          <div className="restock-rows">
            {!rows.length ? <p className="page-kicker">Cargando sucursales...</p> : null}
            {rows.length && !shown.length ? <p className="page-kicker">Ninguna sucursal con este filtro.</p> : null}
            {shown.map((row) => {
              const order = row.inTransit;
              const totals = packTotals(row.shortages ?? []);
              const transit = row.step === "transit" || row.step === "stuck";
              let action: React.ReactNode = null;
              if (order && transit) {
                if (canDispatch && isOpenRestockOrder(order) && order.status !== RESTOCK_ORDER_STATUS.PENDING) {
                  action = (
                    <Button size="small" variant="contained" color="success" startIcon={<PackagePlus size={14} />} component={Link} href={restockArrivalHref(order)}>
                      Recibir
                    </Button>
                  );
                } else {
                  action = (
                    <Button size="small" variant="outlined" component={Link} href={restockOrderSheetHref(order.id)}>
                      Ver pedido
                    </Button>
                  );
                }
              } else if (row.step === "pending" && canCreate) {
                action = (
                  <Button size="small" variant="contained" startIcon={<Truck size={14} />} component={Link} href={restockReviewHref(row.branch.id)}>
                    Revisar y enviar
                  </Button>
                );
              }
              return (
                <section key={row.branch.id} className={`pos-day pos-cut pos-branch restock-branch is-${row.step}`}>
                  <div
                    className="pos-day-head"
                    role="link"
                    tabIndex={0}
                    onClick={() => openBranch(row.branch)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && event.target === event.currentTarget) openBranch(row.branch);
                    }}
                  >
                    <RestockStepLight step={row.step} />
                    <span className="pos-day-date">
                      <span className="pos-day-weekday">
                        {row.branch.code} · {row.branch.name}
                      </span>
                      <span className="pos-day-fulldate">
                        {row.branch.city ? `${row.branch.city} · ` : ""}
                        {row.lastReceived?.receivedAt
                          ? `último surtido recibido ${relativeDays(row.lastReceived.receivedAt)}`
                          : "sin surtido recibido todavía"}
                      </span>
                    </span>
                    <span className="pos-branch-status">
                      <span>
                        <Truck size={15} className="pos-branch-status-icon" />
                        {order && transit ? (
                          <span>
                            <strong>{RESTOCK_STATUS_LABELS[order.status] ?? order.status}</strong> {relativeDays(order.createdAt)}
                            {row.step === "stuck" ? <strong style={{ color: "#c62828" }}> · revisa si ya llegó</strong> : null}
                            {row.awaiting.length > 1 ? <span className="pos-branch-muted"> · {row.awaiting.length} pedidos abiertos</span> : null}
                          </span>
                        ) : row.step === "pending" ? (
                          <span>
                            Faltan <strong>{packSummary(row.shortages ?? [])}</strong>
                          </span>
                        ) : row.step === "ok" ? (
                          <span className="pos-branch-muted">Completa en su stock</span>
                        ) : (
                          <span className="pos-branch-muted">Calculando el faltante…</span>
                        )}
                      </span>
                      {order && transit && row.shortages?.length ? (
                        <span className="pos-branch-muted">
                          <PackageCheck size={15} className="pos-branch-status-icon" />
                          Faltante de hoy: {packSummary(row.shortages)}
                        </span>
                      ) : null}
                    </span>
                    <span className="pos-day-stats">
                      {order && transit ? (
                        <>
                          <span className="pos-day-stat">
                            <small>Productos</small>
                            <b>{order.items?.length ?? 0}</b>
                          </span>
                          <span className="pos-day-stat is-total">
                            <small>Pedido</small>
                            <b>{order.total != null ? formatMoney(order.total) : "—"}</b>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="pos-day-stat">
                            <small>Bidones</small>
                            <b>{totals.bidones}</b>
                          </span>
                          <span className="pos-day-stat">
                            <small>Cajas</small>
                            <b>{totals.cajas}</b>
                          </span>
                          <span className="pos-day-stat">
                            <small>Piezas</small>
                            <b>{totals.piezas}</b>
                          </span>
                        </>
                      )}
                    </span>
                    <span className="restock-branch-action" onClick={(event) => event.stopPropagation()}>
                      {action ?? (
                        <Tooltip title="Abrir la sucursal">
                          <ArrowRight size={18} className="pos-branch-go" />
                        </Tooltip>
                      )}
                    </span>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <FilterBar>
            <TextField
              select
              size="small"
              label="Sucursal"
              value={branchFilter}
              onChange={(event) => setBranchFilter(event.target.value)}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">Todas</MenuItem>
              {branches.map((branch) => (
                <MenuItem key={branch.id} value={branch.id}>
                  {branch.code} · {branch.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Estado"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="">Todos los estados</MenuItem>
              {RESTOCK_STATUS_FILTER_OPTIONS.map(({ value, label }) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <FilterDateRange
              label="Fecha del pedido"
              options={RANGES}
              from={range.from}
              to={range.to}
              onChange={setRange}
              collapsible
            />
            <FilterMeta>
              <strong>{orders.length}</strong> {orders.length === 1 ? "pedido" : "pedidos"}
            </FilterMeta>
          </FilterBar>
          <RestockOrdersTable
            orders={orders}
            canUpdate={canUpdate}
            canDispatch={canDispatch}
            onChanged={() => {
              void loadOrders();
              void loadInbox();
            }}
            showBranch
            loading={loadingOrders}
            emptyText="No hay pedidos con este filtro."
          />
        </>
      )}

    </div>
  );
}
