"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { Droplets, History, Package, ShieldAlert } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { Branch, InventoryMovement, ListResponse } from "@/types";
import { toast } from "sonner";

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

type EditTarget =
  | { kind: "line"; id: string; name: string; stock: number; minStock: number }
  | { kind: "product"; id: string; name: string; stock: number; minStock: number };

const MOVEMENT_LABELS: Record<string, string> = {
  sale: "Venta",
  sale_void: "Anulación",
  restock_in: "Surtido recibido",
  adjustment: "Ajuste",
  initial: "Carga inicial",
};

export default function BranchInventoryPage() {
  const { can } = usePermissions();
  const canView = can("posInventory", "view");
  const canEdit = can("posInventory", "update");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [tab, setTab] = useState(0);
  const [data, setData] = useState<InventoryResponse>({ lines: [], products: [] });
  const [search, setSearch] = useState("");
  const [belowMin, setBelowMin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[] | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (!canView) return;
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200, isActive: "true" })
      .then((res) => {
        setBranches(res.items);
        if (res.items.length && !branchId) setBranchId(res.items[0]!.id);
      })
      .catch((error) => toast.error(getApiErrorMessage(error, "Error al cargar las sucursales")));
    // Solo al montar: el selector maneja los cambios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const result = await httpClient.get<InventoryResponse>(
        `/pos/branches/${branchId}/inventory`,
        { search: debouncedSearch, limit: 300, ...(belowMin ? { belowMin: "true" } : {}) }
      );
      setData(result);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar el inventario"));
    } finally {
      setLoading(false);
    }
  }, [branchId, debouncedSearch, belowMin]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const belowMinCount = useMemo(
    () =>
      data.lines.filter((row) => row.minStock > 0 && row.stock < row.minStock).length +
      data.products.filter((row) => row.minStock > 0 && row.stock < row.minStock).length,
    [data]
  );

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              El inventario por sucursal necesita el permiso de Inventario del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function saveAdjustment(form: FormData) {
    if (!edit) return;
    const stock = String(form.get("stock") || "");
    const minStock = String(form.get("minStock") || "");
    const reason = String(form.get("reason") || "").trim();
    try {
      await httpClient.put(`/pos/branches/${branchId}/inventory`, {
        ...(edit.kind === "line" ? { lineId: edit.id } : { productId: edit.id }),
        ...(stock !== "" ? { stock: Number(stock) } : {}),
        ...(minStock !== "" ? { minStock: Number(minStock) } : {}),
        reason,
      });
      toast.success("Inventario actualizado");
      setEdit(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo ajustar el inventario"));
    }
  }

  async function openMovements(target: EditTarget) {
    try {
      const result = await httpClient.get<ListResponse<InventoryMovement>>(
        `/pos/branches/${branchId}/movements`,
        { ...(target.kind === "line" ? { lineId: target.id } : { productId: target.id }), limit: 50 }
      );
      setMovements(result.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el kardex"));
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Inventario por sucursal</h1>
          <p className="page-kicker">
            Los líquidos se llevan en litros por línea; el resto por pieza. El stock mínimo es de
            cada sucursal y es lo que dispara el faltante.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <TextField
          select
          label="Sucursal"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          sx={{ minWidth: 260 }}
        >
          {branches.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Buscar"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ minWidth: 240 }}
        />
        <Button
          variant={belowMin ? "contained" : "outlined"}
          color={belowMin ? "warning" : "inherit"}
          onClick={() => setBelowMin((value) => !value)}
        >
          Bajo mínimo {belowMinCount ? `(${belowMinCount})` : ""}
        </Button>
      </div>

      <Tabs value={tab} onChange={(_e, value) => setTab(value)}>
        <Tab
          icon={<Droplets size={15} />}
          iconPosition="start"
          label={`Líquidos en litros (${data.lines.length})`}
        />
        <Tab
          icon={<Package size={15} />}
          iconPosition="start"
          label={`Piezas (${data.products.length})`}
        />
      </Tabs>

      <div className="table-container-premium">
        <table className="table">
          <thead>
            <tr>
              <th>{tab === 0 ? "Línea" : "Producto"}</th>
              {tab === 1 ? <th>SKU</th> : null}
              <th>Categoría</th>
              <th style={{ textAlign: "right" }}>Existencia</th>
              {tab === 0 ? <th style={{ textAlign: "right" }}>≈ Bidones</th> : null}
              <th style={{ textAlign: "right" }}>Stock mínimo</th>
              <th style={{ textAlign: "right" }}>Faltante</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(tab === 0 ? data.lines : data.products).map((row) => {
              const isLine = tab === 0;
              const line = row as LineRow;
              const product = row as ProductRow;
              const id = isLine ? line.lineId : product.productId;
              const shortage = Math.max(0, row.minStock - row.stock);
              const target: EditTarget = isLine
                ? { kind: "line", id, name: row.name, stock: row.stock, minStock: row.minStock }
                : { kind: "product", id, name: row.name, stock: row.stock, minStock: row.minStock };
              return (
                <tr key={id}>
                  <td>
                    <strong>{row.name}</strong>
                    {isLine && !line.canSellByLiter ? (
                      <Chip
                        label="sin venta por litro"
                        size="small"
                        color="warning"
                        sx={{ ml: 1, height: 18, fontSize: 10 }}
                      />
                    ) : null}
                  </td>
                  {!isLine ? <td>{product.sku || "—"}</td> : null}
                  <td>{row.categoryName || "Sin categoría"}</td>
                  <td
                    style={{
                      textAlign: "right",
                      color: row.stock < 0 ? "#ef4444" : undefined,
                      fontWeight: row.stock < 0 ? 700 : 400,
                    }}
                  >
                    {formatQuantity(row.stock)} {isLine ? "L" : "pz"}
                  </td>
                  {isLine ? (
                    <td style={{ textAlign: "right" }}>{formatQuantity(line.bidonesEquivalent)}</td>
                  ) : null}
                  <td style={{ textAlign: "right" }}>
                    {row.minStock ? `${formatQuantity(row.minStock)} ${isLine ? "L" : "pz"}` : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {shortage > 0 ? (
                      <strong style={{ color: "#d97706" }}>
                        {formatQuantity(shortage)} {isLine ? "L" : "pz"}
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
                      <Button size="small" onClick={() => setEdit(target)}>
                        Ajustar
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!loading && !(tab === 0 ? data.lines : data.products).length ? (
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

      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} fullWidth maxWidth="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveAdjustment(new FormData(event.currentTarget));
          }}
        >
          <DialogTitle>Ajustar {edit?.name}</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <TextField
              name="stock"
              label={`Existencia (${edit?.kind === "line" ? "litros" : "piezas"})`}
              type="number"
              defaultValue={edit?.stock ?? 0}
              fullWidth
              inputProps={{ step: edit?.kind === "line" ? 0.01 : 1 }}
              helperText="Se registra el movimiento con la diferencia contra lo que había."
            />
            <TextField
              name="minStock"
              label="Stock mínimo de esta sucursal"
              type="number"
              defaultValue={edit?.minStock ?? 0}
              fullWidth
              inputProps={{ min: 0, step: edit?.kind === "line" ? 0.01 : 1 }}
              helperText="Nivel ideal: de aquí sale el faltante que se pide a fábrica."
            />
            <TextField
              name="reason"
              label="Motivo"
              required
              fullWidth
              sx={{ gridColumn: "1 / -1" }}
              placeholder="Conteo físico, merma, corrección de captura…"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEdit(null)}>Cancelar</Button>
            <Button type="submit" variant="contained">
              Guardar ajuste
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={movements !== null} onClose={() => setMovements(null)} fullWidth maxWidth="md">
        <DialogTitle>Kardex</DialogTitle>
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
              {(movements ?? []).map((movement) => (
                <tr key={movement.id}>
                  <td>
                    {movement.createdAt
                      ? new Date(movement.createdAt).toLocaleString("es-MX", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td>{MOVEMENT_LABELS[movement.type] ?? movement.type}</td>
                  <td
                    style={{
                      textAlign: "right",
                      color: Number(movement.quantity) < 0 ? "#c62828" : "#15803d",
                      fontWeight: 700,
                    }}
                  >
                    {Number(movement.quantity) > 0 ? "+" : ""}
                    {formatQuantity(movement.quantity)}
                  </td>
                  <td style={{ textAlign: "right" }}>{formatQuantity(movement.balanceAfter)}</td>
                  <td>{movement.user?.name ?? "—"}</td>
                  <td>{movement.notes ?? "—"}</td>
                </tr>
              ))}
              {movements && !movements.length ? (
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
