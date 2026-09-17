"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, FormControlLabel, Switch } from "@mui/material";
import { Plus, ShieldAlert, Store } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { BranchFormDialog } from "@/components/pos-admin/BranchFormDialog";
import { BranchHealthChip } from "@/components/pos-admin/BranchHealthChip";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { BranchType } from "@glamouroso/shared/constants";
import type { BranchStats } from "@/types";
import { toast } from "sonner";
import { FilterBar, FilterMeta, FilterSearch } from "./FilterBar";
import { BRANCH_TYPE_COPY, WEEKDAY_LABELS, relativeDays } from "./pos-labels";

/**
 * Tabla de sucursales o de franquicias. Es la misma pantalla para las dos:
 * cambian las columnas (una franquicia no vende ni lleva inventario aquí) y
 * la copia. Clic en la fila abre el detalle.
 */
export function BranchListPage({ type }: { type: BranchType }) {
  const router = useRouter();
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

  const columns = [
    {
      key: "code",
      label: "Código",
      render: (row: BranchStats) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Store size={14} style={{ color: "var(--glam-blue)" }} />
          <strong>{row.code}</strong>
        </span>
      ),
    },
    {
      key: "name",
      label: "Nombre",
      render: (row: BranchStats) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--glam-navy)" }}>{row.name}</div>
          {row.city ? (
            <div className="page-kicker" style={{ margin: 0 }}>
              {row.city}
            </div>
          ) : null}
        </div>
      ),
    },
    { key: "health", label: "Salud", render: (row: BranchStats) => <BranchHealthChip health={row.health} /> },
    ...(!isFranchise && seesSales
      ? [
          {
            key: "month",
            label: "Ventas del mes",
            render: (row: BranchStats) => (
              <div>
                <strong>{formatMoney(row.sales?.month.total ?? 0)}</strong>
                <div className="page-kicker" style={{ margin: 0 }}>
                  {row.sales?.month.tickets ?? 0} tickets · hoy {formatMoney(row.sales?.today.total ?? 0)}
                </div>
              </div>
            ),
          },
          {
            key: "avg",
            label: "Ticket promedio",
            render: (row: BranchStats) => formatMoney(row.sales?.month.avgTicket ?? 0),
          },
          {
            key: "lastSale",
            label: "Última venta",
            render: (row: BranchStats) => relativeDays(row.sales?.lastSaleAt),
          },
        ]
      : []),
    ...(!isFranchise && seesInventory
      ? [
          {
            key: "belowMin",
            label: "Bajo mínimo",
            render: (row: BranchStats) =>
              row.inventory?.belowMinCount ? (
                <strong style={{ color: "#d97706" }}>{row.inventory.belowMinCount}</strong>
              ) : (
                "—"
              ),
          },
        ]
      : []),
    {
      key: "restock",
      label: isFranchise ? "Pedidos a fábrica" : "Surtido",
      render: (row: BranchStats) => (
        <div>
          {row.restock.openCount ? (
            <strong style={{ color: "var(--glam-navy)" }}>{row.restock.openCount} por enviar</strong>
          ) : (
            <span>Al día</span>
          )}
          <div className="page-kicker" style={{ margin: 0 }}>
            {isFranchise
              ? `${row.restock.monthCount} este mes · último ${relativeDays(row.restock.lastOrderAt)}`
              : row.restockCutoffDow == null
                ? "Corte manual"
                : `Corte ${WEEKDAY_LABELS[row.restockCutoffDow]}`}
          </div>
        </div>
      ),
    },
    { key: "users", label: "Usuarios", render: (row: BranchStats) => row.usersCount || "—" },
    {
      key: "status",
      label: "Estado",
      render: (row: BranchStats) =>
        row.isActive ? (
          <Chip label="Activa" size="small" color="primary" />
        ) : (
          <Chip label="Inactiva" size="small" />
        ),
    },
  ];

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

      {visible.length ? (
      <DataTable
        rows={visible}
        getKey={(row: BranchStats) => row.branchId}
        onRowClick={(row: BranchStats) => router.push(`${copy.listHref}/${row.branchId}`)}
        columns={columns}
      />
      ) : null}

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
