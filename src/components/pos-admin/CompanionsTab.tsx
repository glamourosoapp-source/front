"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { Plus, Trash2 } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import type { PosProductCompanion, Product } from "@/types";
import { toast } from "sonner";
import { ProductPicker } from "./ContainerRulesTab";

interface Draft {
  product: Product | null;
  companion: Product | null;
  quantity: number;
  /** Editando una fila: el producto no cambia (sería otra fila). */
  locked?: boolean;
}

/**
 * Palos y accesorios: productos que al venderse descuentan además otro. La
 * escoba sale con su palo puesto, así que cada pieza vendida baja 1 escoba y 1
 * de PALOS (que la fábrica surte como "PALOS X 100"). Anular o devolver al
 * anaquel regresa el palo; la merma no.
 */
export function CompanionsTab({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<PosProductCompanion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await httpClient.get<PosProductCompanion[]>("/pos/product-companions"));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los palos y accesorios"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // El acompañante más usado (PALOS) se propone al agregar uno nuevo.
  const usual = useMemo(() => {
    const counts = new Map<string, { product: Product; n: number }>();
    for (const row of rows) {
      const companion = row.companionProduct as Product | null | undefined;
      if (!companion) continue;
      const entry = counts.get(companion.id) ?? { product: companion, n: 0 };
      entry.n += 1;
      counts.set(companion.id, entry);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.product ?? null;
  }, [rows]);

  async function save(draft: Draft) {
    if (!draft.product || !draft.companion) return;
    setSaving(draft.product.id);
    try {
      await httpClient.put<PosProductCompanion>("/pos/product-companions", {
        productId: draft.product.id,
        companionProductId: draft.companion.id,
        quantity: draft.quantity,
      });
      toast.success(`${draft.product.name} lleva ${draft.quantity} × ${draft.companion.name}`);
      setDialog(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar"));
    } finally {
      setSaving(null);
    }
  }

  async function remove(row: PosProductCompanion) {
    const name = (row.product as Product | null)?.name ?? "este producto";
    if (!window.confirm(`¿${name} deja de descontar ${(row.companionProduct as Product | null)?.name ?? "su acompañante"}? Lo ya vendido no cambia.`)) return;
    setSaving(row.productId);
    try {
      await httpClient.delete(`/pos/product-companions/${row.productId}`);
      toast.success(`${name} ya no descuenta acompañante`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo quitar"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="page-stack">
      <div className="panel p-4">
        <p className="page-kicker" style={{ margin: 0 }}>
          Productos que salen de la tienda con otro puesto. Al vender 1 escoba la caja descuenta{" "}
          <strong>1 escoba y 1 palo</strong> del inventario de la sucursal; así el pedido a fábrica
          propone los PALOS X 100 que se fueron con las ventas. Anular el ticket o devolver la pieza
          al anaquel regresa el palo; la merma no.
        </p>
      </div>

      <div className="toolbar">
        <div>
          <Chip size="small" label={`${rows.length} ${rows.length === 1 ? "producto" : "productos"}`} />
        </div>
        {canManage ? (
          <Button
            variant="contained"
            startIcon={<Plus size={16} />}
            onClick={() => setDialog({ product: null, companion: usual, quantity: 1 })}
          >
            Agregar producto
          </Button>
        ) : null}
      </div>

      <div className="table-container-premium">
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th style={{ width: 110 }}>SKU</th>
              <th>Descuenta además</th>
              <th style={{ width: 120, textAlign: "right" }}>Por pieza</th>
              <th style={{ width: 160 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const product = row.product as Product | null;
              const companion = row.companionProduct as Product | null;
              return (
                <tr key={row.productId}>
                  <td>
                    <strong>{product?.name ?? "—"}</strong>
                  </td>
                  <td>{product?.sku ?? "—"}</td>
                  <td>{companion?.name ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{row.quantity}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {canManage ? (
                      <>
                        <Button
                          size="small"
                          disabled={saving === row.productId}
                          onClick={() => setDialog({ product, companion, quantity: row.quantity, locked: true })}
                        >
                          Editar
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<Trash2 size={14} />}
                          disabled={saving === row.productId}
                          onClick={() => void remove(row)}
                        >
                          Quitar
                        </Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!rows.length && !loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                  Ningún producto descuenta acompañante.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {loading ? <p className="page-kicker">Cargando...</p> : null}

      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>Producto que lleva acompañante</DialogTitle>
        {dialog ? (
          <DialogContent dividers>
            <div className="page-stack">
              <ProductPicker
                label="Al vender"
                value={dialog.product}
                disabled={dialog.locked}
                onChange={(product) => setDialog({ ...dialog, product })}
              />
              <ProductPicker
                label="Descuenta además"
                value={dialog.companion}
                onChange={(companion) => setDialog({ ...dialog, companion })}
              />
              <TextField
                size="small"
                label="Cuántos por pieza"
                type="number"
                value={dialog.quantity}
                inputProps={{ min: 1, max: 100, step: 1 }}
                onChange={(e) => setDialog({ ...dialog, quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
              />
            </div>
          </DialogContent>
        ) : null}
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!dialog?.product || !dialog?.companion || Boolean(saving)}
            onClick={() => dialog && void save(dialog)}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
