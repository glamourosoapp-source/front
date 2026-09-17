"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, FormControlLabel, Switch } from "@mui/material";
import { Droplets, FileDown, Package, RefreshCw, ShieldAlert } from "lucide-react";
import { RESTOCK_ORDER_STATUS } from "@glamouroso/shared/constants";
import { FilterBar, FilterDivider, FilterMeta, FilterSegmented } from "@/components/pos-admin/FilterBar";
import { formatQuantity } from "@/lib/format-money";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { ListResponse, RestockOrder } from "@/types";
import { toast } from "sonner";

type Scope = "approved" | "all";

const SCOPE_OPTIONS: Array<{ value: Scope; label: string }> = [
  { value: "approved", label: "Aprobados y en preparación" },
  { value: "all", label: "También por aprobar" },
];

const APPROVED = new Set<string>([RESTOCK_ORDER_STATUS.APPROVED, RESTOCK_ORDER_STATUS.PREPARING]);
const WITH_PENDING = new Set<string>([...APPROVED, RESTOCK_ORDER_STATUS.PENDING]);

/** Una línea de líquido o un producto por pieza, sumado a través de todos los pedidos. */
interface Need {
  key: string;
  name: string;
  unit: "bidon" | "pieza";
  /** Bidones o piezas por preparar. */
  qty: number;
  /** Solo líquidos: bidones × litros por bidón. */
  liters: number;
  orders: number;
  /** Código de sucursal → cantidad, para saber para quién es. */
  byBranch: Map<string, number>;
}

function consolidate(orders: RestockOrder[], includePrepared: boolean): Need[] {
  const needs = new Map<string, Need>();
  for (const order of orders) {
    const branchCode = order.branch?.code ?? "—";
    for (const item of order.items ?? []) {
      // Lo que ya está marcado "Listo" en la tablet ya se apartó: no hay que producirlo.
      if (item.prepared && !includePrepared) continue;
      const qty = Number(item.requestedQty ?? 0);
      if (!qty) continue;
      const unit = item.unit === "bidon" ? "bidon" : "pieza";
      const key = `${unit}:${item.lineId ?? item.productId ?? item.productName}`;
      const litersPerUnit = unit === "bidon" ? Number(item.litersPerUnit ?? 20) || 20 : 0;
      let need = needs.get(key);
      if (!need) {
        need = { key, name: item.productName, unit, qty: 0, liters: 0, orders: 0, byBranch: new Map() };
        needs.set(key, need);
      }
      need.qty += qty;
      need.liters += qty * litersPerUnit;
      need.orders += 1;
      need.byBranch.set(branchCode, (need.byBranch.get(branchCode) ?? 0) + qty);
    }
  }
  return [...needs.values()].sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}

function branchesLabel(need: Need): string {
  return [...need.byBranch.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, qty]) => `${code} ×${formatQuantity(qty)}`)
    .join(" · ");
}

/**
 * Producción y compras: todos los pedidos de surtido abiertos, de sucursales y
 * franquicias, sumados por producto. Los líquidos salen en bidones y litros
 * (lo que fábrica tiene que producir) y lo demás en piezas (lo que se compra,
 * como escobas o fibras). Se calcula aquí a partir de `GET /pos/restock/orders`.
 */
export default function FactoryProductionPage() {
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const canView = can("posRestock", "view");

  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [scope, setScope] = useState<Scope>("approved");
  const [includePrepared, setIncludePrepared] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      // El endpoint filtra un estado a la vez: se traen los últimos 200 y se
      // quedan los abiertos.
      const result = await httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", {
        limit: 200,
      });
      setOrders(result.items.filter((order) => WITH_PENDING.has(order.status)));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los pedidos"));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "restock_orders_changed") void load();
    });
  }, [subscribe, load]);

  const scoped = useMemo(
    () => orders.filter((order) => (scope === "all" ? WITH_PENDING : APPROVED).has(order.status)),
    [orders, scope]
  );

  const needs = useMemo(() => consolidate(scoped, includePrepared), [scoped, includePrepared]);
  const liquids = useMemo(() => needs.filter((need) => need.unit === "bidon"), [needs]);
  const pieces = useMemo(() => needs.filter((need) => need.unit === "pieza"), [needs]);

  const totals = useMemo(
    () => ({
      bidones: liquids.reduce((sum, need) => sum + need.qty, 0),
      liters: liquids.reduce((sum, need) => sum + need.liters, 0),
      pieces: pieces.reduce((sum, need) => sum + need.qty, 0),
      orders: scoped.length,
      branches: new Set(scoped.map((order) => order.branchId)).size,
    }),
    [liquids, pieces, scoped]
  );

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Producción y compras necesita el permiso de Faltantes y surtido.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /** Una sola hoja con las dos listas: la que se lleva a producción y a comprar. */
  function exportCsv() {
    const rows: string[][] = [["Tipo", "Producto", "Cantidad", "Unidad", "Litros", "Pedidos", "Para quién"]];
    for (const need of liquids) {
      rows.push([
        "Producir",
        need.name,
        String(need.qty),
        "bidones",
        String(need.liters),
        String(need.orders),
        branchesLabel(need),
      ]);
    }
    for (const need of pieces) {
      rows.push(["Comprar", need.name, String(need.qty), "piezas", "", String(need.orders), branchesLabel(need)]);
    }
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `produccion-y-compras-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Producción y compras</h1>
          <p className="page-kicker">
            Todos los pedidos abiertos de sucursales y franquicias sumados por producto: los
            líquidos en bidones y litros para producir, y las piezas para comprar.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={16} />}
            onClick={() => void load()}
            sx={{ whiteSpace: "nowrap" }}
          >
            Actualizar
          </Button>
          <Button
            variant="contained"
            startIcon={<FileDown size={16} />}
            onClick={exportCsv}
            disabled={!needs.length}
            sx={{ whiteSpace: "nowrap" }}
          >
            CSV
          </Button>
        </div>
      </div>

      <section className="grid grid-4">
        <div className="card metric">
          <div className="metric-head">
            <span>Bidones a producir</span>
          </div>
          <strong>{formatQuantity(totals.bidones)}</strong>
          <small>{formatQuantity(totals.liters)} litros en total</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Líneas de líquido</span>
          </div>
          <strong>{liquids.length}</strong>
          <small>Con algo pendiente de producir</small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Piezas a comprar</span>
          </div>
          <strong>{formatQuantity(totals.pieces)}</strong>
          <small>
            {pieces.length} {pieces.length === 1 ? "producto" : "productos"} distintos
          </small>
        </div>
        <div className="card metric">
          <div className="metric-head">
            <span>Pedidos sumados</span>
          </div>
          <strong>{totals.orders}</strong>
          <small>
            De {totals.branches} {totals.branches === 1 ? "sucursal" : "sucursales"} y franquicias
          </small>
        </div>
      </section>

      <FilterBar>
        <FilterSegmented label="Pedidos" options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        <FilterDivider />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={includePrepared}
              onChange={(event) => setIncludePrepared(event.target.checked)}
            />
          }
          label="Incluir partidas ya preparadas"
          sx={{ ml: 0, ".MuiFormControlLabel-label": { fontSize: 14 } }}
        />
        <FilterMeta>
          {scope === "approved"
            ? "Lo que fábrica ya puede surtir"
            : "Incluye lo que el administrador todavía no aprueba"}
        </FilterMeta>
      </FilterBar>

      <section className="panel">
        <div className="toolbar" style={{ padding: "16px 20px 0" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 17 }}>
            <Droplets size={18} style={{ color: "var(--glam-blue)" }} /> Para producir
          </h2>
          <span className="page-kicker" style={{ margin: 0 }}>
            {formatQuantity(totals.bidones)} bidones · {formatQuantity(totals.liters)} L
          </span>
        </div>
        <div className="table-container-premium">
          <table className="table">
            <thead>
              <tr>
                <th>Línea</th>
                <th style={{ textAlign: "right" }}>Bidones</th>
                <th style={{ textAlign: "right" }}>Litros</th>
                <th style={{ textAlign: "right" }}>Pedidos</th>
                <th>Para quién</th>
              </tr>
            </thead>
            <tbody>
              {liquids.map((need) => (
                <tr key={need.key}>
                  <td>
                    <strong>{need.name}</strong>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--glam-navy)" }}>
                    {formatQuantity(need.qty)}
                  </td>
                  <td style={{ textAlign: "right" }}>{formatQuantity(need.liters)} L</td>
                  <td style={{ textAlign: "right" }}>{need.orders}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{branchesLabel(need)}</td>
                </tr>
              ))}
              {!liquids.length && !loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                    No hay líquidos pendientes de producir.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar" style={{ padding: "16px 20px 0" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, fontSize: 17 }}>
            <Package size={18} style={{ color: "var(--glam-blue)" }} /> Para comprar
          </h2>
          <span className="page-kicker" style={{ margin: 0 }}>
            {formatQuantity(totals.pieces)} piezas
          </span>
        </div>
        <div className="table-container-premium">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th style={{ textAlign: "right" }}>Piezas</th>
                <th style={{ textAlign: "right" }}>Pedidos</th>
                <th>Para quién</th>
              </tr>
            </thead>
            <tbody>
              {pieces.map((need) => (
                <tr key={need.key}>
                  <td>
                    <strong>{need.name}</strong>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--glam-navy)" }}>
                    {formatQuantity(need.qty)}
                  </td>
                  <td style={{ textAlign: "right" }}>{need.orders}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{branchesLabel(need)}</td>
                </tr>
              ))}
              {!pieces.length && !loading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                    No hay piezas pendientes de comprar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {loading ? <p className="page-kicker">Cargando...</p> : null}
    </div>
  );
}
