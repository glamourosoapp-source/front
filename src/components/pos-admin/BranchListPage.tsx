"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, FormControlLabel, Switch, Tooltip } from "@mui/material";
import { ChevronRight, Clock, PackageMinus, Plus, ShieldAlert, Store, Truck } from "lucide-react";
import { BranchFormDialog } from "@/components/pos-admin/BranchFormDialog";
import { BranchHealthChip } from "@/components/pos-admin/BranchHealthChip";
import { BranchSyncCell } from "@/components/pos-admin/BranchSyncCell";
import { BranchStoreTodayCell, storeTime } from "@/components/pos-admin/BranchStoreTodayCell";
import type { StoreDayEvaluation } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { BranchType } from "@glamouroso/shared/constants";
import type { BranchStats } from "@/types";
import { toast } from "sonner";
import { FilterBar, FilterMeta, FilterSearch } from "./FilterBar";
import { BRANCH_TYPE_COPY, WEEKDAY_LABELS, relativeDays } from "./pos-labels";

/** Bloque de cifra de la tarjeta: etiqueta, valor grande y una nota debajo. */
function RowStat({ label, value, note, total }: { label: string; value: string; note?: string; total?: boolean }) {
  return (
    <span className={`pos-day-stat${total ? " is-total" : ""}`}>
      <small>{label}</small>
      <b>{value}</b>
      {note ? <em>{note}</em> : null}
    </span>
  );
}

/**
 * Foco de la tienda: verde con ondas mientras está abierta, rojo si no ha
 * abierto o ya cerró. Es lo primero que se busca al recorrer la lista.
 */
export function StoreLight({ day }: { day: StoreDayEvaluation }) {
  const open = day.status === "open";
  const label = open ? "Abierta" : day.status === "closed" ? "Cerrada" : "Sin abrir";
  const title = open
    ? `Abierta desde ${storeTime(day.openedAt)}`
    : day.status === "closed"
      ? day.autoClosed
        ? `Se cerró sola a las ${storeTime(day.closedAt)}: el cajero no cerró`
        : `Cerró a las ${storeTime(day.closedAt)}`
      : day.hours
        ? `No ha abierto · abre ${day.hours.open}`
        : "No ha abierto hoy";
  return (
    <Tooltip title={title}>
      <span className={`store-light ${open ? "is-open" : "is-closed"}`}>
        <span className="store-light-dot">
          <Store size={16} />
        </span>
        <span className="store-light-label">{label}</span>
      </span>
    </Tooltip>
  );
}

const ticketsLabel =(count: number) => `${count} ${count === 1 ? "ticket" : "tickets"}`;

/**
 * Una sucursal (o franquicia) como tarjeta, igual que las de Cortes: a la
 * izquierda quién es y su salud, en medio cómo va su operación (caja, tienda,
 * surtido) y a la derecha las cifras. Toda la tarjeta abre el detalle.
 */
function BranchRow({
  row,
  href,
  isFranchise,
  seesSales,
  seesInventory,
}: {
  row: BranchStats;
  href: string;
  isFranchise: boolean;
  seesSales: boolean;
  seesInventory: boolean;
}) {
  const sales = row.sales;
  const belowMin = row.inventory?.belowMinCount ?? 0;
  const subline = [
    row.code,
    row.city,
    row.usersCount ? `${row.usersCount} ${row.usersCount === 1 ? "usuario" : "usuarios"}` : "sin usuarios",
    !isFranchise && sales ? `última venta ${relativeDays(sales.lastSaleAt)}` : null,
  ].filter(Boolean);
  const restockNote = isFranchise
    ? `${row.restock.monthCount} este mes · último ${relativeDays(row.restock.lastOrderAt)}`
    : row.restockCutoffDow == null
      ? "corte manual"
      : `corte ${WEEKDAY_LABELS[row.restockCutoffDow].toLowerCase()}`;

  return (
    <section className={`pos-day pos-cut pos-branch${row.isActive ? "" : " is-inactive"}`}>
      <Link href={href} className="pos-day-head">
        {isFranchise || !row.isActive || !row.storeToday ? (
          <span className="pos-day-chevron" aria-hidden>
            <Store size={17} />
          </span>
        ) : (
          <StoreLight day={row.storeToday} />
        )}
        <span className="pos-day-date">
          <span className="pos-day-weekday">
            {row.name}
            {row.isActive ? null : <span className="pos-day-badge is-muted">Inactiva</span>}
          </span>
          <span className="pos-day-fulldate">{subline.join(" · ")}</span>
          <span className="pos-branch-health">
            <BranchHealthChip health={row.health} />
          </span>
        </span>
        <span className="pos-branch-status">
          <span>
            <BranchSyncCell stats={row} />
          </span>
          {!isFranchise && row.storeToday ? (
            <span>
              <Clock size={15} className="pos-branch-status-icon" />
              <BranchStoreTodayCell day={row.storeToday} />
            </span>
          ) : null}
          <span>
            <Truck size={15} className="pos-branch-status-icon" />
            <span>
              {row.restock.openCount ? (
                <strong style={{ color: "var(--glam-navy)" }}>
                  {row.restock.openCount} {isFranchise ? "pedido" : "surtido"}
                  {row.restock.openCount === 1 ? "" : "s"} por enviar
                </strong>
              ) : (
                <span>{isFranchise ? "Pedidos al día" : "Surtido al día"}</span>
              )}
              <span className="pos-branch-muted"> · {restockNote}</span>
            </span>
          </span>
          {!isFranchise && seesInventory && belowMin ? (
            <span>
              <PackageMinus size={15} className="pos-branch-status-icon" />
              <span>
                {belowMin} {belowMin === 1 ? "producto" : "productos"} bajo su stock
              </span>
            </span>
          ) : null}
        </span>
        {isFranchise ? (
          <span className="pos-day-stats">
            <RowStat label="Por enviar" value={String(row.restock.openCount)} note="pedidos" />
            <RowStat label="Este mes" value={String(row.restock.monthCount)} note="pedidos" total />
          </span>
        ) : seesSales ? (
          <span className="pos-day-stats">
            <RowStat
              label="Hoy"
              value={formatMoney(sales?.today.total ?? 0)}
              note={ticketsLabel(sales?.today.tickets ?? 0)}
            />
            <RowStat
              label="Semana"
              value={formatMoney(sales?.week.total ?? 0)}
              note={ticketsLabel(sales?.week.tickets ?? 0)}
            />
            <RowStat
              label="Mes"
              value={formatMoney(sales?.month.total ?? 0)}
              note={`prom. ${formatMoney(sales?.month.avgTicket ?? 0)}`}
              total
            />
          </span>
        ) : (
          <span />
        )}
        <ChevronRight size={18} className="pos-branch-go" aria-hidden />
      </Link>
    </section>
  );
}

/**
 * Lista de sucursales o de franquicias. Es la misma pantalla para las dos:
 * cambian las cifras (una franquicia no vende ni lleva inventario aquí) y la
 * copia. Clic en la tarjeta abre el detalle.
 */
export function BranchListPage({ type }: { type: BranchType }) {
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const copy = BRANCH_TYPE_COPY[type];
  const isFranchise = type === "franchise";
  const canView = can("posBranches", "view");
  const canCreate = can("posBranches", "create");
  const seesSales = can("posReports", "view");
  const seesInventory = can("posInventory", "view");

  const [rows, setRows] = useState<BranchStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await httpClient.get<BranchStats[]>("/pos/branches/stats", { type }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, `Error al cargar las ${copy.plural}`));
    } finally {
      setLoading(false);
    }
  }, [type, copy.plural]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  // Una venta o un pedido nuevo mueven las cifras y la salud sin recargar.
  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "pos_sales_changed" || event.type === "restock_orders_changed") void load();
    });
  }, [subscribe, load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showInactive && !row.isActive) return false;
      if (!term) return true;
      return [row.code, row.name, row.city ?? ""].some((value) => value.toLowerCase().includes(term));
    });
  }, [rows, search, showInactive]);

  const totals = useMemo(
    () => ({
      active: rows.filter((row) => row.isActive).length,
      critical: rows.filter((row) => row.isActive && row.health.level === "critical").length,
      warning: rows.filter((row) => row.isActive && row.health.level === "warning").length,
      monthTotal: rows.reduce((sum, row) => sum + (row.sales?.month.total ?? 0), 0),
      openRestock: rows.reduce((sum, row) => sum + row.restock.openCount, 0),
    }),
    [rows]
  );

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              La administración de {copy.plural} necesita el permiso de Sucursales del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">{copy.Plural}</h1>
          <p className="page-kicker">{copy.kicker}</p>
        </div>
        {canCreate ? (
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setDialogOpen(true)}>
            Nueva {copy.singular}
          </Button>
        ) : null}
      </div>

      <section className="grid grid-4">
        <div className="card metric">
          <div className="metric-head">
            <span>{copy.Plural} activas</span>
          </div>
          <strong>{totals.active}</strong>
          <small>{rows.length - totals.active ? `${rows.length - totals.active} inactivas` : "Todas activas"}</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Con alertas</span>
          </div>
          <strong style={{ color: totals.critical ? "#c62828" : totals.warning ? "#d97706" : undefined }}>
            {totals.critical + totals.warning}
          </strong>
          <small>
            {totals.critical} críticas · {totals.warning} en atención
          </small>
        </div>
        {!isFranchise && seesSales ? (
          <div className="card metric">
            <div className="metric-head">
              <span>Ventas del mes</span>
            </div>
            <strong>{formatMoney(totals.monthTotal)}</strong>
            <small>Todas las sucursales, sin anulados</small>
          </div>
        ) : null}
        <div className="card metric">
          <div className="metric-head">
            <span>Pedidos por enviar</span>
          </div>
          <strong>{totals.openRestock}</strong>
          <small>Pendientes, aprobados o en preparación</small>
        </div>
      </section>

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={setSearch}
          placeholder={`Buscar por código, nombre o ciudad`}
        />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
          }
          label="Mostrar inactivas"
          sx={{ mr: 0, whiteSpace: "nowrap" }}
        />
        <FilterMeta>
          <strong>{visible.length}</strong> de {rows.length} {copy.plural}
        </FilterMeta>
      </FilterBar>

      {visible.map((row) => (
        <BranchRow
          key={row.branchId}
          row={row}
          href={`${copy.listHref}/${row.branchId}`}
          isFranchise={isFranchise}
          seesSales={seesSales}
          seesInventory={seesInventory}
        />
      ))}

      {loading ? <p className="page-kicker">Cargando...</p> : null}
      {!loading && !rows.length ? (
        <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
          Todavía no hay {copy.plural}. {canCreate ? `Crea la primera con "Nueva ${copy.singular}".` : ""}
        </div>
      ) : null}

      <BranchFormDialog
        open={dialogOpen}
        branch={null}
        defaultType={type}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
