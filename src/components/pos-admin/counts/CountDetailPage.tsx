"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Button, Chip, Tooltip } from "@mui/material";
import { ArrowLeft, ClipboardCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { INVENTORY_COUNT_ITEM_STATUS, INVENTORY_COUNT_STATUS } from "@glamouroso/shared/constants";
import type { InventoryCount, InventoryCountItem } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { FilterBar, FilterMeta, FilterSegmented } from "../FilterBar";
import { formatBusinessTime, formatDateTime } from "../pos-labels";
import { CountStatusLight } from "./CountCard";
import { CountsNoAccess } from "./CountsPage";
import { RevertItemDialog } from "./RevertItemDialog";
import {
  COUNTS_HREF,
  COUNT_SELECTION_LABELS,
  COUNT_STATUS_LABELS,
  isRevertible,
  percentLabel,
  qtyLabel,
  signedMoney,
  signedQty,
  withinTolerance,
} from "./count-labels";
import "./counts.css";

type RowFilter = "all" | "diff" | "reverted";

const STATUS_CHIP_COLOR: Record<string, "info" | "success" | "default"> = {
  [INVENTORY_COUNT_STATUS.IN_PROGRESS]: "info",
  [INVENTORY_COUNT_STATUS.CLOSED]: "success",
  [INVENTORY_COUNT_STATUS.CANCELLED]: "default",
};

function magnitude(item: InventoryCountItem): number {
  return Math.abs(Number(item.varianceAmount ?? item.varianceQty ?? 0));
}

/** Estado del renglón mientras el conteo está abierto (ciego: sin esperado). */
function openItemState(item: InventoryCountItem) {
  if (item.recountQty != null) return <Chip size="small" color="success" variant="outlined" label="Recontado" />;
  if (item.needsRecount) return <Chip size="small" color="warning" label="Pide reconteo" />;
  if (item.countedQty != null) return <Chip size="small" color="success" variant="outlined" label="Contado" />;
  return <Chip size="small" variant="outlined" label="Pendiente" />;
}

function closedItemState(item: InventoryCountItem) {
  if (item.status === INVENTORY_COUNT_ITEM_STATUS.REVERTED) {
    return (
      <Tooltip
        title={`Revertido ${formatDateTime(item.revertedAt)}${item.revertReason ? ` · ${item.revertReason}` : ""}`}
      >
        <Chip size="small" label="Revertido" />
      </Tooltip>
    );
  }
  if (item.status === INVENTORY_COUNT_ITEM_STATUS.ADJUSTED) {
    return Number(item.varianceQty ?? 0) === 0 ? (
      <Chip size="small" variant="outlined" color="success" label="Cuadra" />
    ) : (
      <Chip size="small" color="success" label="Ajustado" />
    );
  }
  return <Chip size="small" variant="outlined" label="Sin ajuste" />;
}

/**
 * Detalle de un conteo: encabezado (sucursal, estado, quién y cuándo, notas),
 * resumen y renglón por renglón. Ya cerrado se ve lo esperado (si se tiene
 * `posInventory:view`), lo contado, el reconteo y la diferencia en unidades y en
 * pesos, con **Revertir** por renglón ajustado (`posCounts:update`). Abierto es
 * de solo lectura y ciego también aquí: el Back no manda lo esperado hasta cerrar.
 */
export function CountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { can } = usePermissions();
  const canView = can("posCounts", "view");
  const canRevert = can("posCounts", "update");

  const [count, setCount] = useState<InventoryCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [reverting, setReverting] = useState<InventoryCountItem | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setCount(await httpClient.get<InventoryCount>(`/pos/counts/${id}`));
      setNotFound(false);
    } catch (error) {
      setNotFound(true);
      toast.error(getApiErrorMessage(error, "No se pudo cargar el conteo"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const items = useMemo(() => count?.items ?? [], [count]);
  const closed = count?.status === INVENTORY_COUNT_STATUS.CLOSED;
  const inProgress = count?.status === INVENTORY_COUNT_STATUS.IN_PROGRESS;
  const showsExpected = closed && items.some((item) => item.expectedQty != null);
  const showsAmounts = closed && items.some((item) => item.varianceAmount != null);

  const summary = useMemo(() => {
    const counted = items.filter((item) => item.countedQty != null).length;
    const recounted = items.filter((item) => item.recountQty != null).length;
    const needsRecount = items.filter((item) => item.needsRecount && item.recountQty == null).length;
    const reverted = items.filter((item) => item.status === INVENTORY_COUNT_ITEM_STATUS.REVERTED);
    const withDiff = items.filter((item) => Number(item.varianceQty ?? 0) !== 0).length;
    const tolerance = items.map(withinTolerance);
    const known = tolerance.every((value) => value !== null) && items.length > 0;
    const inside = known
      ? tolerance.filter(Boolean).length
      : count?.accuracy != null
        ? Math.round((Number(count.accuracy) / 100) * items.length)
        : null;
    const accuracy = known && items.length ? (Number(inside) / items.length) * 100 : (count?.accuracy ?? null);
    // Merma neta vigente: lo ajustado menos lo que se revirtió.
    const net = items
      .filter((item) => item.status === INVENTORY_COUNT_ITEM_STATUS.ADJUSTED)
      .reduce((sum, item) => sum + Number(item.varianceAmount ?? 0), 0);
    const revertedAmount = reverted.reduce((sum, item) => sum + Number(item.varianceAmount ?? 0), 0);
    return { counted, recounted, needsRecount, reverted: reverted.length, revertedAmount, withDiff, inside, accuracy, net };
  }, [items, count?.accuracy]);

  const shown = useMemo(() => {
    const list = closed ? [...items].sort((a, b) => magnitude(b) - magnitude(a)) : items;
    if (filter === "diff") return list.filter((item) => Number(item.varianceQty ?? 0) !== 0);
    if (filter === "reverted") return list.filter((item) => item.status === INVENTORY_COUNT_ITEM_STATUS.REVERTED);
    return list;
  }, [items, closed, filter]);

  if (!canView) return <CountsNoAccess />;

  const progress = items.length ? Math.round((summary.counted / items.length) * 100) : 0;
  const showActions = closed && canRevert;
  const columns = 4 + (closed ? 1 : 0) + (showsExpected ? 1 : 0) + (showsAmounts ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div style={{ minWidth: 0 }}>
          <Link
            href={COUNTS_HREF}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            Volver a los conteos
          </Link>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ClipboardCheck size={22} style={{ color: "var(--glam-blue)", flex: "0 0 auto" }} />
            <span>
              Conteo
              {count?.branch ? ` · ${count.branch.code} · ${count.branch.name}` : ""}
            </span>
          </h1>
          {count ? (
            <div className="count-head-meta">
              <Chip
                size="small"
                label={COUNT_STATUS_LABELS[count.status] ?? count.status}
                color={STATUS_CHIP_COLOR[count.status] ?? "default"}
              />
              {count.pendingSync ? <Chip size="small" color="warning" label="Ventas por subir" /> : null}
              <span className="page-kicker" style={{ margin: 0 }}>
                Lo inició {count.startedByUser?.name ?? "—"} el {formatDateTime(count.startedAt)}
                {closed ? ` · cerrado ${formatDateTime(count.closedAt)}` : ""}
                {count.status === INVENTORY_COUNT_STATUS.CANCELLED
                  ? ` · cancelado ${formatDateTime(count.cancelledAt ?? count.closedAt)}`
                  : ""}
              </span>
            </div>
          ) : null}
        </div>
        {count ? <CountStatusLight status={count.status} accuracy={summary.accuracy} /> : null}
      </div>

      {loading && !count ? <p className="page-kicker">Cargando conteo...</p> : null}
      {!loading && notFound && !count ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          No se encontró el conteo. <Link href={COUNTS_HREF}>Volver a los conteos</Link>
        </div>
      ) : null}

      {count ? (
        <>
          {count.pendingSync ? (
            <Alert severity="warning">
              Al cerrar, la caja de esta sucursal tenía ventas sin subir. Lo esperado se recalcula cuando la caja
              sincroniza: si una diferencia cambia, revisa si conviene revertir el ajuste.
            </Alert>
          ) : null}

          {inProgress ? (
            <section className="panel p-5 count-progress">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong style={{ color: "var(--glam-navy)" }}>
                  {summary.counted} de {items.length} renglones contados
                </strong>
                <span className="page-kicker" style={{ margin: 0 }}>
                  {summary.recounted} recontados
                  {summary.needsRecount ? ` · ${summary.needsRecount} piden reconteo` : ""}
                </span>
              </div>
              <div className="count-progress-bar" aria-label={`${progress} % contado`}>
                <i style={{ width: `${progress}%` }} />
              </div>
              <span className="page-kicker" style={{ margin: 0 }}>
                El conteo sigue en curso y es ciego también aquí: lo esperado y las diferencias aparecen cuando el
                supervisor lo cierra y se ajusta el inventario.
              </span>
            </section>
          ) : null}

          {closed ? (
            <section className="grid grid-4 counts-metrics">
              <div className="card metric">
                <div className="metric-head">
                  <span>Renglones</span>
                </div>
                <strong>{items.length}</strong>
                <small>
                  {summary.recounted} recontados · {summary.withDiff} con diferencia
                </small>
              </div>
              <div className="card metric">
                <div className="metric-head">
                  <span>Dentro de tolerancia</span>
                </div>
                <strong>{summary.inside != null ? `${summary.inside} de ${items.length}` : "—"}</strong>
                <small>Exactitud {percentLabel(summary.accuracy)} · ±1 L/pz o ±2 %</small>
              </div>
              {showsAmounts ? (
                <div className="card metric">
                  <div className="metric-head">
                    <span>Merma neta</span>
                  </div>
                  <strong className={summary.net < 0 ? "count-negative" : undefined}>{signedMoney(summary.net)}</strong>
                  <small>A precio de tienda, sin lo revertido</small>
                </div>
              ) : null}
              <div className="card metric">
                <div className="metric-head">
                  <span>Revertidos</span>
                </div>
                <strong>{summary.reverted}</strong>
                <small>
                  {summary.reverted && showsAmounts
                    ? `${signedMoney(summary.revertedAmount)} deshechos`
                    : "Ajustes deshechos por el administrador"}
                </small>
              </div>
            </section>
          ) : null}

          {count.notes ? (
            <section className="panel p-5">
              <div className="page-kicker" style={{ margin: "0 0 4px" }}>
                Notas del supervisor
              </div>
              <p className="count-notes">{count.notes}</p>
            </section>
          ) : null}

          {closed ? (
            <FilterBar>
              <FilterSegmented
                label="Renglones"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "diff", label: "Con diferencia" },
                  { value: "reverted", label: "Revertidos" },
                ]}
              />
              <FilterMeta>
                <strong>{shown.length}</strong> de {items.length} renglones · de mayor a menor diferencia
              </FilterMeta>
            </FilterBar>
          ) : null}

          <div className="counts-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  {showsExpected ? <th className="is-num">Esperado</th> : null}
                  <th className="is-num">Contado</th>
                  <th className="is-num">Reconteo</th>
                  {closed ? <th className="is-num">Diferencia</th> : null}
                  {showsAmounts ? <th className="is-num">Valor</th> : null}
                  <th>Estado</th>
                  {showActions ? <th aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => {
                  const selection = COUNT_SELECTION_LABELS[item.selectionReason];
                  const variance = item.varianceQty;
                  const reverted = item.status === INVENTORY_COUNT_ITEM_STATUS.REVERTED;
                  const inside = withinTolerance(item);
                  return (
                    <tr key={item.id} className={reverted ? "is-reverted" : undefined}>
                      <td className="count-name">
                        <b>{item.name}</b>
                        {/* Clase ABC y por qué entró, bajo el nombre: la tabla cabe sin desplazarse. */}
                        <small>
                          <Tooltip title={`Clase ${item.abcClass} por venta de 90 días`}>
                            <span className={`count-abc is-${item.abcClass}`}>{item.abcClass}</span>
                          </Tooltip>{" "}
                          {selection ? (
                            <Tooltip title={selection.hint}>
                              <span>{selection.label}</span>
                            </Tooltip>
                          ) : (
                            item.selectionReason
                          )}
                          {" · "}
                          {[item.sku, item.unit === "liters" ? "litros" : "piezas"].filter(Boolean).join(" · ")}
                        </small>
                      </td>
                      {showsExpected ? <td className="is-num">{qtyLabel(item.expectedQty, item.unit)}</td> : null}
                      <td className="is-num">
                        <Tooltip title={item.countedAt ? `Contado a las ${formatBusinessTime(item.countedAt)}` : ""}>
                          <span>{qtyLabel(item.countedQty, item.unit)}</span>
                        </Tooltip>
                      </td>
                      <td className="is-num">
                        <Tooltip title={item.recountedAt ? `Recontado a las ${formatBusinessTime(item.recountedAt)}` : ""}>
                          <span>{item.recountQty != null ? qtyLabel(item.recountQty, item.unit) : "—"}</span>
                        </Tooltip>
                      </td>
                      {closed ? (
                        <td
                          className={`is-num${variance != null && variance < 0 ? " count-negative" : variance != null && variance > 0 ? " count-positive" : ""}`}
                        >
                          <strong>{signedQty(variance, item.unit)}</strong>
                          {inside === false ? (
                            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>fuera de tolerancia</div>
                          ) : null}
                        </td>
                      ) : null}
                      {showsAmounts ? (
                        <td className={`is-num${Number(item.varianceAmount ?? 0) < 0 ? " count-negative" : ""}`}>
                          {signedMoney(item.varianceAmount)}
                        </td>
                      ) : null}
                      <td>{closed ? closedItemState(item) : inProgress ? openItemState(item) : <span className="pos-branch-muted">—</span>}</td>
                      {showActions ? (
                        <td style={{ textAlign: "right" }}>
                          {isRevertible(count, item) ? (
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              startIcon={<Undo2 size={14} />}
                              onClick={() => setReverting(item)}
                            >
                              Revertir
                            </Button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {!shown.length ? (
                  <tr>
                    <td colSpan={columns} style={{ textAlign: "center", color: "var(--muted)" }}>
                      {items.length ? "Ningún renglón con este filtro." : "El conteo no tiene renglones."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {closed && !showsExpected ? (
            <p className="page-kicker" style={{ margin: 0 }}>
              Lo esperado se muestra solo con el permiso de Inventario del punto de venta.
            </p>
          ) : null}
        </>
      ) : null}

      {reverting && count ? (
        <RevertItemDialog
          countId={count.id}
          item={reverting}
          onClose={() => setReverting(null)}
          onReverted={() => {
            setReverting(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
