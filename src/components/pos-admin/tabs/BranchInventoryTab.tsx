"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs, TextField } from "@mui/material";
import { AlertTriangle, Check, Droplets, History, Package, Pencil, X } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { InventoryMovement, ListResponse } from "@/types";
import { toast } from "sonner";
import { FilterBar, FilterMeta, FilterSearch } from "../FilterBar";
import { formatDateTime } from "../pos-labels";

interface LineRow {
  lineId: string;
  name: string;
  categoryName: string | null;
  stock: number;
  minStock: number;
  litersPerBidon: number;
  bidonesEquivalent: number;
  canSellByLiter: boolean;
  updatedAt: string | null;
}

interface ProductRow {
  productId: string;
  name: string;
  sku: string | null;
  categoryName: string | null;
  unit: string;
  stock: number;
  minStock: number;
  updatedAt: string | null;
}

interface InventoryResponse {
  lines: LineRow[];
  products: ProductRow[];
}

type Target = { kind: "line" | "product"; id: string; name: string; stock: number; minStock: number };

const MOVEMENT_LABELS: Record<string, string> = {
  sale: "Venta",
  sale_void: "Anulación",
  restock_in: "Surtido recibido",
  adjustment: "Ajuste",
  initial: "Carga inicial",
};

/**
 * Inventario de la sucursal con el stock mínimo editable en la propia fila:
 * es el único parámetro del faltante y es distinto por sucursal, así que
 * cambiarlo no debería costar abrir un diálogo por producto.
 */
export function BranchInventoryTab({ branchId }: { branchId: string }) {
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const canView = can("posInventory", "view");
  const canEdit = can("posInventory", "update");

  const [tab, setTab] = useState(0);
  const [data, setData] = useState<InventoryResponse>({ lines: [], products: [] });
  const [search, setSearch] = useState("");
  const [belowMin, setBelowMin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingMin, setEditingMin] = useState<{ target: Target; value: string } | null>(null);
  const [adjust, setAdjust] = useState<Target | null>(null);
  const [movements, setMovements] = useState<{ target: Target; rows: InventoryMovement[] } | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      setData(
        await httpClient.get<InventoryResponse>(`/pos/branches/${branchId}/inventory`, {
          search: debouncedSearch,
          limit: 500,
          ...(belowMin ? { belowMin: "true" } : {}),
        })
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar el inventario"));
    } finally {
      setLoading(false);
    }
  }, [canView, branchId, debouncedSearch, belowMin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe((event) => {
      if (
        (event.type === "pos_sales_changed" || event.type === "restock_orders_changed") &&
        event.branchId === branchId
      ) {
        void load();
      }
    });
  }, [subscribe, branchId, load]);

  const belowMinCount = useMemo(
    () =>
      data.lines.filter((row) => row.minStock > 0 && row.stock < row.minStock).length +
      data.products.filter((row) => row.minStock > 0 && row.stock < row.minStock).length,
    [data]
  );

  if (!canView) {
    return (
      <div className="panel p-5" style={{ color: "var(--muted)" }}>
        El inventario necesita el permiso de Inventario del punto de venta.
      </div>
    );
  }

  async function saveMin() {
    if (!editingMin) return;
    const value = Number(editingMin.value);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("El mínimo debe ser un número mayor o igual a cero");
      return;
    }
    try {
      await httpClient.put(`/pos/branches/${branchId}/inventory`, {
        ...(editingMin.target.kind === "line"
          ? { lineId: editingMin.target.id }
          : { productId: editingMin.target.id }),
        minStock: value,
        reason: "Stock mínimo actualizado desde la sucursal",
      });
      toast.success(`Mínimo de ${editingMin.target.name} guardado`);
      setEditingMin(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar el mínimo"));
    }
  }

  async function saveAdjust(form: FormData) {
    if (!adjust) return;
    const stock = String(form.get("stock") || "");
    const reason = String(form.get("reason") || "").trim();
    try {
      await httpClient.put(`/pos/branches/${branchId}/inventory`, {
        ...(adjust.kind === "line" ? { lineId: adjust.id } : { productId: adjust.id }),
        ...(stock !== "" ? { stock: Number(stock) } : {}),
        reason,
      });
      toast.success("Existencia ajustada");
      setAdjust(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo ajustar la existencia"));
    }
  }

  const rows = tab === 0 ? data.lines : data.products;
  const isLine = tab === 0;
  const unit = isLine ? "L" : "pz";

  async function openMovements(target: Target) {
    try {
      const result = await httpClient.get<ListResponse<InventoryMovement>>(
        `/pos/branches/${branchId}/movements`,
        { ...(target.kind === "line" ? { lineId: target.id } : { productId: target.id }), limit: 50 }
      );
      setMovements({ target, rows: result.items });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el kardex"));
    }
  }

  return (
    <div className="page-stack">
      <p className="page-kicker" style={{ margin: 0 }}>
        Los líquidos se llevan en litros por línea; el resto por pieza.{" "}
        {canEdit ? "Da clic en el lápiz para cambiar el mínimo de esta sucursal." : ""}
      </p>

      <FilterBar>
        <FilterSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar línea o producto por nombre"
        />
        <Button
          variant={belowMin ? "contained" : "outlined"}
          color={belowMin ? "warning" : "inherit"}
          startIcon={<AlertTriangle size={15} />}
          onClick={() => setBelowMin((value) => !value)}
          sx={{ whiteSpace: "nowrap", height: 40 }}
        >
          Bajo mínimo{belowMinCount ? ` (${belowMinCount})` : ""}
        </Button>
        <FilterMeta>
          <strong>{rows.length}</strong> {isLine ? "líneas" : "productos"}
        </FilterMeta>
      </FilterBar>

      <Tabs value={tab} onChange={(_e, value) => setTab(value)}>
        <Tab icon={<Droplets size={15} />} iconPosition="start" label={`Líquidos en litros (${data.lines.length})`} />
        <Tab icon={<Package size={15} />} iconPosition="start" label={`Piezas (${data.products.length})`} />
      </Tabs>

      <div className="table-container-premium">
        <table className="table">
          <thead>
            <tr>
              <th>{isLine ? "Línea" : "Producto"}</th>
              {!isLine ? <th>SKU</th> : null}
              <th>Categoría</th>
              <th style={{ textAlign: "right" }}>Existencia</th>
              {isLine ? <th style={{ textAlign: "right" }}>≈ Bidones</th> : null}
              <th style={{ textAlign: "right", minWidth: 190 }}>Stock mínimo</th>
              <th style={{ textAlign: "right" }}>Faltante</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const line = row as LineRow;
              const product = row as ProductRow;
              const id = isLine ? line.lineId : product.productId;
              const target: Target = {
                kind: isLine ? "line" : "product",
                id,
                name: row.name,
                stock: row.stock,
                minStock: row.minStock,
              };
              const shortage = Math.max(0, row.minStock - row.stock);
              const editing = editingMin?.target.id === id;
              return (
                <tr key={id}>
                  <td>
                    <strong>{row.name}</strong>
                    {isLine && !line.canSellByLiter ? (
                      <Chip label="sin venta por litro" size="small" color="warning" sx={{ ml: 1, height: 18, fontSize: 10 }} />
                    ) : null}
                  </td>
                  {!isLine ? <td>{product.sku || "—"}</td> : null}
                  <td>{row.categoryName || "Sin categoría"}</td>
                  <td style={{ textAlign: "right", color: row.stock < 0 ? "#ef4444" : undefined, fontWeight: row.stock < 0 ? 700 : 400 }}>
                    {formatQuantity(row.stock)} {unit}
                  </td>
                  {isLine ? <td style={{ textAlign: "right" }}>{formatQuantity(line.bidonesEquivalent)}</td> : null}
                  <td style={{ textAlign: "right" }}>
                    {editing ? (
                      <form
                        style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveMin();
                        }}
                      >
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step={isLine ? 0.01 : 1}
                          autoFocus
                          onFocus={(event) => event.currentTarget.select()}
                          value={editingMin.value}
                          onChange={(event) =>
                            setEditingMin((current) => current && { ...current, value: event.target.value })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setEditingMin(null);
                          }}
                          style={{ width: 96, padding: "4px 8px", textAlign: "right" }}
                          aria-label={`Stock mínimo de ${row.name}`}
                        />
                        <span>{unit}</span>
                        <Button
                          size="small"
                          variant="contained"
                          type="submit"
                          sx={{ minWidth: 0, px: 1 }}
                          aria-label={`Guardar mínimo de ${row.name}`}
                        >
                          <Check size={14} />
                        </Button>
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => setEditingMin(null)}
                          sx={{ minWidth: 0, px: 1 }}
                          aria-label="Cancelar edición del mínimo"
                        >
                          <X size={14} />
                        </Button>
                      </form>
                    ) : (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        {row.minStock ? `${formatQuantity(row.minStock)} ${unit}` : <span className="pill-muted">Sin mínimo</span>}
                        {canEdit ? (
                          <Button
                            size="small"
                            color="inherit"
                            sx={{ minWidth: 0, px: 0.5 }}
                            onClick={() => setEditingMin({ target, value: String(row.minStock ?? 0) })}
                            aria-label={`Editar mínimo de ${row.name}`}
                          >
                            <Pencil size={14} />
                          </Button>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {shortage > 0 ? (
                      <strong style={{ color: "#d97706" }}>
                        {formatQuantity(shortage)} {unit}
                      </strong>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <Button size="small" startIcon={<History size={14} />} onClick={() => void openMovements(target)}>
                      Kardex
                    </Button>
                    {canEdit ? (
                      <Button size="small" onClick={() => setAdjust(target)}>
                        Ajustar
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                  No hay registros con estos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {loading ? <p className="page-kicker">Cargando...</p> : null}

      <Dialog open={Boolean(adjust)} onClose={() => setAdjust(null)} fullWidth maxWidth="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveAdjust(new FormData(event.currentTarget));
          }}
        >
          <DialogTitle>Ajustar existencia de {adjust?.name}</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <TextField
              name="stock"
              label={`Existencia (${adjust?.kind === "line" ? "litros" : "piezas"})`}
              type="number"
              defaultValue={adjust?.stock ?? 0}
              fullWidth
              inputProps={{ step: adjust?.kind === "line" ? 0.01 : 1 }}
              helperText="Se registra el movimiento con la diferencia contra lo que había."
            />
            <TextField
              name="reason"
              label="Motivo"
              required
              fullWidth
              placeholder="Conteo físico, merma, corrección de captura…"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAdjust(null)}>Cancelar</Button>
            <Button type="submit" variant="contained">
              Guardar ajuste
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={Boolean(movements)} onClose={() => setMovements(null)} fullWidth maxWidth="md">
        <DialogTitle>Kardex · {movements?.target.name}</DialogTitle>
        <DialogContent dividers>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Movimiento</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th style={{ textAlign: "right" }}>Saldo</th>
                <th>Usuario</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {(movements?.rows ?? []).map((movement) => (
                <tr key={movement.id}>
                  <td>{formatDateTime(movement.createdAt)}</td>
                  <td>{MOVEMENT_LABELS[movement.type] ?? movement.type}</td>
                  <td style={{ textAlign: "right", color: Number(movement.quantity) < 0 ? "#c62828" : "#15803d", fontWeight: 700 }}>
                    {Number(movement.quantity) > 0 ? "+" : ""}
                    {formatQuantity(movement.quantity)}
                  </td>
                  <td style={{ textAlign: "right" }}>{formatQuantity(movement.balanceAfter)}</td>
                  <td>{movement.user?.name ?? "—"}</td>
                  <td>{movement.notes ?? "—"}</td>
                </tr>
              ))}
              {movements && !movements.rows.length ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
                    Sin movimientos todavía.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMovements(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
