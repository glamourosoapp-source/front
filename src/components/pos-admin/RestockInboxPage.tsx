"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, MenuItem, Tab, Tabs, TextField } from "@mui/material";
import { ArrowRight, Lock, ShieldAlert, Truck } from "lucide-react";
import { toast } from "sonner";
import { BRANCH_TYPES, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import type { Branch, BranchShortage, ListResponse, RestockOrder } from "@/types";
import { FilterBar, FilterDateRange, FilterMeta, type DateRangeOption } from "./FilterBar";
import { RestockOrdersTable } from "./RestockOrdersTable";
import { isAwaitingRestockOrder } from "./RestockOrderActions";
import { RestockAwaitingDialog, blockingRestockOrder, isAwaitingOrderError } from "./RestockAwaitingDialog";
import { RESTOCK_STATUS_LABELS, WEEKDAY_LABELS, formatDateTime, packTotals, relativeDays } from "./pos-labels";

const RANGES: DateRangeOption[] = [
  { key: "todo", label: "Todo", days: null },
  { key: "hoy", label: "Hoy", days: 0 },
  { key: "7d", label: "7 días", days: 6 },
  { key: "30d", label: "30 días", days: 29 },
];

type View = "sucursales" | "pedidos";

/** Una fila de la bandeja: lo que cada sucursal necesita hoy. */
interface InboxRow {
  branch: Branch;
  /** `null` mientras se calcula o si falló. */
  shortages: BranchShortage[] | null;
  awaiting: RestockOrder[];
  lastOrderAt: string | null;
}

function packSummary(shortages: BranchShortage[]): string {
  const totals = packTotals(shortages);
  const parts = [
    totals.bidones ? `${totals.bidones} ${totals.bidones === 1 ? "bidón" : "bidones"}` : "",
    totals.cajas ? `${totals.cajas} ${totals.cajas === 1 ? "caja" : "cajas"}` : "",
    totals.piezas ? `${totals.piezas} ${totals.piezas === 1 ? "pieza" : "piezas"}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * Faltantes y surtido: la bandeja de TODAS las sucursales. No repite la
 * pestaña "Pedidos a fábrica" de cada sucursal (ahí se trabaja el detalle):
 * aquí se ve de un vistazo qué sucursal tiene faltante sin pedir y qué pedidos
 * siguen sin llegar, y se confirma el pedido sin entrar a cada una.
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
  const [generating, setGenerating] = useState<string | null>(null);
  /** Pedido en camino que impide confirmar otro, con su sucursal: abre el modal. */
  const [blockedBy, setBlockedBy] = useState<{ order: RestockOrder; branch: Branch } | null>(null);

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

  const rows: InboxRow[] = useMemo(
    () =>
      branches.map((branch) => {
        const mine = recent.filter((order) => order.branchId === branch.id);
        return {
          branch,
          shortages: shortagesByBranch[branch.id] ?? null,
          awaiting: mine.filter(isAwaitingRestockOrder),
          lastOrderAt: mine[0]?.createdAt ?? null,
        };
      }),
    [branches, recent, shortagesByBranch]
  );
  const withShortage = rows.filter((row) => row.shortages?.length).length;
  const awaitingTotal = rows.reduce((sum, row) => sum + row.awaiting.length, 0);

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

  async function generate(branch: Branch, awaiting: RestockOrder[]) {
    // Un pedido a la vez por sucursal: con uno en camino no se confirma otro.
    const blocking = blockingRestockOrder(awaiting);
    if (blocking) {
      setBlockedBy({ order: blocking, branch });
      return;
    }
    setGenerating(branch.id);
    try {
      const result = await httpClient.post<RestockOrder | { created: false; message: string }>(
        `/pos/restock/branches/${branch.id}/generate`,
        {}
      );
      if ("created" in result && result.created === false) {
        toast.info(result.message);
        return;
      }
      toast.success(`Pedido de ${branch.code} confirmado: quedó por recibir`);
      await loadInbox();
    } catch (error) {
      if (isAwaitingOrderError(error)) {
        const fresh = await httpClient
          .get<ListResponse<RestockOrder>>("/pos/restock/orders", { branchId: branch.id, limit: 100 })
          .then((res) => res.items.filter(isAwaitingRestockOrder))
          .catch(() => []);
        const order = blockingRestockOrder(fresh);
        if (order) setBlockedBy({ order, branch });
        void loadInbox();
      } else {
        toast.error(getApiErrorMessage(error, "No se pudo generar el pedido"));
      }
    } finally {
      setGenerating(null);
    }
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
          <FilterBar>
            <span className="page-kicker" style={{ margin: 0 }}>
              <strong style={{ color: "var(--glam-navy)" }}>{withShortage}</strong>{" "}
              {withShortage === 1 ? "sucursal con faltante" : "sucursales con faltante"} ·{" "}
              <strong style={{ color: "var(--glam-navy)" }}>{awaitingTotal}</strong>{" "}
              {awaitingTotal === 1 ? "pedido por recibir" : "pedidos por recibir"}
            </span>
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

          <div className="table-container-premium">
            <table className="table">
              <thead>
                <tr>
                  <th>Sucursal</th>
                  <th>Faltante de hoy</th>
                  <th>Por recibir</th>
                  <th>Último pedido</th>
                  <th>Corte</th>
                  <th style={{ textAlign: "right" }} aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const oldest = row.awaiting[row.awaiting.length - 1];
                  return (
                    <tr
                      key={row.branch.id}
                      className="clickable-row"
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      onClick={() => openBranch(row.branch)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && event.target === event.currentTarget) openBranch(row.branch);
                      }}
                    >
                      <td>
                        <strong>{row.branch.code}</strong>
                        <div className="page-kicker" style={{ margin: 0 }}>
                          {row.branch.name}
                        </div>
                      </td>
                      <td>
                        {row.shortages === null ? (
                          <span className="page-kicker" style={{ margin: 0 }}>
                            Calculando...
                          </span>
                        ) : row.shortages.length ? (
                          <>
                            <strong style={{ color: "var(--glam-navy)" }}>{packSummary(row.shortages)}</strong>
                            <div className="page-kicker" style={{ margin: 0 }}>
                              {row.shortages.length} {row.shortages.length === 1 ? "producto" : "productos"}
                            </div>
                          </>
                        ) : (
                          <span className="page-kicker" style={{ margin: 0 }}>
                            Nada que pedir
                          </span>
                        )}
                      </td>
                      <td>
                        {row.awaiting.length ? (
                          <>
                            <strong>
                              {row.awaiting.length} {row.awaiting.length === 1 ? "pedido" : "pedidos"}
                            </strong>
                            <div className="page-kicker" style={{ margin: 0 }}>
                              el más viejo {relativeDays(oldest?.createdAt)}
                            </div>
                          </>
                        ) : (
                          <span className="page-kicker" style={{ margin: 0 }}>
                            Al día
                          </span>
                        )}
                      </td>
                      <td>
                        {row.lastOrderAt ? (
                          <span title={formatDateTime(row.lastOrderAt)}>{relativeDays(row.lastOrderAt)}</span>
                        ) : (
                          <span className="page-kicker" style={{ margin: 0 }}>
                            Nunca
                          </span>
                        )}
                      </td>
                      <td>
                        {row.branch.restockCutoffDow == null
                          ? "Manual"
                          : WEEKDAY_LABELS[row.branch.restockCutoffDow]}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }} onClick={(event) => event.stopPropagation()}>
                        {canCreate && row.shortages?.length ? (
                          <Button
                            size="small"
                            variant={row.awaiting.length ? "outlined" : "contained"}
                            startIcon={row.awaiting.length ? <Lock size={14} /> : <Truck size={14} />}
                            disabled={generating === row.branch.id}
                            onClick={() => void generate(row.branch, row.awaiting)}
                            title={
                              row.awaiting.length
                                ? "Hay un pedido en camino: se podrá confirmar otro cuando se reciba"
                                : undefined
                            }
                          >
                            {generating === row.branch.id ? "Confirmando..." : "Confirmar pedido"}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
                      Cargando sucursales...
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
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
              {Object.entries(RESTOCK_STATUS_LABELS).map(([value, label]) => (
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

      <RestockAwaitingDialog
        order={blockedBy?.order ?? null}
        branchLabel={blockedBy ? `${blockedBy.branch.code} · ${blockedBy.branch.name}` : null}
        onClose={() => setBlockedBy(null)}
      />
    </div>
  );
}
