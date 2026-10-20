"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Tab, Tabs, Tooltip } from "@mui/material";
import { AlertTriangle, Droplets, Package } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatQuantity } from "@/lib/format-money";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { toast } from "sonner";
import { FilterBar, FilterMeta, FilterSearch } from "./FilterBar";

export interface OverviewBranch {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface OverviewCell {
  stock: number;
  minStock: number;
}

interface OverviewRowBase {
  name: string;
  categoryName: string | null;
  byBranch: Record<string, OverviewCell>;
  totalStock: number;
  totalMin: number;
  branchesBelowMin: number;
}

export interface OverviewLine extends OverviewRowBase {
  lineId: string;
  litersPerBidon: number;
  canSellByLiter: boolean;
}

export interface OverviewProduct extends OverviewRowBase {
  productId: string;
  sku: string | null;
}

export interface InventoryOverview {
  branches: OverviewBranch[];
  lines: OverviewLine[];
  products: OverviewProduct[];
}

/**
 * Inventario de varias sucursales lado a lado: un renglón por línea o
 * producto y una columna por sucursal, con el total de las elegidas. Lo que
 * está bajo su stock en una sucursal se pinta en esa celda. Es de consulta: el
 * stock y los ajustes se editan eligiendo UNA sucursal (clic en su columna).
 */
export function BranchesInventoryMatrix({
  branchIds,
  onPickBranch,
}: {
  /** Vacío = todas las sucursales activas, igual que el Back. */
  branchIds: string[];
  onPickBranch: (branchId: string) => void;
}) {
  const { subscribe } = useRealtime();
  const [tab, setTab] = useState(0);
  const [data, setData] = useState<InventoryOverview>({ branches: [], lines: [], products: [] });
  const [search, setSearch] = useState("");
  const [belowMin, setBelowMin] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const key = branchIds.join(",");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await httpClient.get<InventoryOverview>("/pos/inventory", {
          ...(key ? { branchIds: key } : {}),
          search: debouncedSearch,
          ...(belowMin ? { belowMin: "true" } : {}),
        })
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar el inventario"));
    } finally {
      setLoading(false);
    }
  }, [key, debouncedSearch, belowMin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type !== "pos_sales_changed" && event.type !== "restock_orders_changed") return;
      if (!key || key.split(",").includes(event.branchId ?? "")) void load();
    });
  }, [subscribe, key, load]);

  const isLine = tab === 0;
  const rows: OverviewRowBase[] = isLine ? data.lines : data.products;
  const unit = isLine ? "L" : "pz";
  const belowCount = useMemo(
    () => [...data.lines, ...data.products].filter((row) => row.branchesBelowMin > 0).length,
    [data]
  );

  return (
    <div className="page-stack">
      <FilterBar>
        <FilterSearch value={search} onChange={setSearch} placeholder="Buscar línea o producto por nombre o SKU" />
        <Button
          variant={belowMin ? "contained" : "outlined"}
          color={belowMin ? "warning" : "inherit"}
          startIcon={<AlertTriangle size={15} />}
          onClick={() => setBelowMin((value) => !value)}
          sx={{ whiteSpace: "nowrap", height: 40 }}
        >
          Bajo su stock{!belowMin && belowCount ? ` (${belowCount})` : ""}
        </Button>
        <FilterMeta>
          <strong>{rows.length.toLocaleString("es-MX")}</strong> {isLine ? "líneas" : "productos"} en{" "}
          <strong>{data.branches.length}</strong> {data.branches.length === 1 ? "sucursal" : "sucursales"}
        </FilterMeta>
      </FilterBar>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Tabs value={tab} onChange={(_e, value) => setTab(value)}>
          <Tab icon={<Droplets size={15} />} iconPosition="start" label={`Líquidos en litros (${data.lines.length})`} />
          <Tab icon={<Package size={15} />} iconPosition="start" label={`Piezas (${data.products.length})`} />
        </Tabs>
        <span className="inv-legend">
          <i className="is-below" /> Bajo su stock en esa sucursal
          <i className="is-negative" /> Existencia negativa
        </span>
      </div>

      <div className="inv-matrix-wrap">
        <table className="inv-matrix">
          <thead>
            <tr>
              <th className="inv-sticky">{isLine ? "Línea" : "Producto"}</th>
              <th className="inv-num inv-total">Total</th>
              {data.branches.map((branch) => (
                <th key={branch.id} className="inv-num">
                  <Tooltip title={`Ver y editar solo ${branch.name}`}>
                    <button type="button" className="inv-branch-head" onClick={() => onPickBranch(branch.id)}>
                      <span className="branch-code-badge">{branch.code}</span>
                      <small>{branch.name}</small>
                    </button>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = isLine ? (row as OverviewLine).lineId : (row as OverviewProduct).productId;
              const sku = isLine ? null : (row as OverviewProduct).sku;
              return (
                <tr key={id}>
                  <td className="inv-sticky">
                    <div className="inv-name">{row.name}</div>
                    <div className="inv-sub">
                      {[sku, row.categoryName ?? "Sin categoría"].filter(Boolean).join(" · ")}
                      {row.branchesBelowMin ? (
                        <span className="inv-below-count">
                          {row.branchesBelowMin} bajo su stock
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="inv-num inv-total">
                    {formatQuantity(row.totalStock)} {unit}
                  </td>
                  {data.branches.map((branch) => {
                    const cell = row.byBranch[branch.id] ?? { stock: 0, minStock: 0 };
                    const shortage = Math.max(0, cell.minStock - cell.stock);
                    const below = cell.minStock > 0 && shortage > 0;
                    const className = [
                      "inv-num",
                      below ? "is-below" : "",
                      cell.stock < 0 ? "is-negative" : "",
                      !cell.stock && !cell.minStock ? "is-empty" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td key={branch.id} className={className}>
                        <Tooltip
                          title={
                            cell.minStock
                              ? `${branch.code}: stock ${formatQuantity(cell.minStock)} ${unit}${
                                  below ? ` · faltan ${formatQuantity(shortage)} ${unit}` : ""
                                }`
                              : `${branch.code}: sin stock definido`
                          }
                        >
                          <span>{formatQuantity(cell.stock)}</span>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={data.branches.length + 2} className="inv-empty">
                  No hay registros con estos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {loading ? <p className="page-kicker">Cargando...</p> : null}
    </div>
  );
}
