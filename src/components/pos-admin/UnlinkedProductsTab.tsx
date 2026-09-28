"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, MenuItem, TextField } from "@mui/material";
import { FileSpreadsheet, Link2, RefreshCw } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { LinkToFormDialog } from "@/components/pos-admin/LinkToFormDialog";
import { FilterBar, FilterDivider, FilterMeta, FilterSearch } from "@/components/pos-admin/FilterBar";
import { Branch, UnlinkedRestockItem } from "@/types";
import { toast } from "sonner";

/**
 * Productos que la caja vendió sin estar ligados al formato de pedido. La venta
 * no se bloquea: la existencia baja a negativo, y como el surtido solo sale del
 * formato, nunca se repone. Aquí se ven para ligarlos en Formato de pedido.
 */
export function UnlinkedProductsTab({ branches }: { branches: Branch[] }) {
  const { can } = usePermissions();
  // Ligar escribe el formato y el inventario (mínimo y conteo): pide los dos.
  const canLink = can("posRestock", "update") && can("posInventory", "update");
  const [linking, setLinking] = useState<UnlinkedRestockItem[] | null>(null);
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<UnlinkedRestockItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(
        await httpClient.get<UnlinkedRestockItem[]>("/pos/restock/unlinked", branchId ? { branchId } : {})
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar los productos sin formato"));
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) => item.name.toLowerCase().includes(term) || (item.sku ?? "").toLowerCase().includes(term)
    );
  }, [items, search]);

  /**
   * Abre el diálogo con TODAS las sucursales donde ese producto quedó sin
   * formato, aunque la lista esté filtrada por una: al ligarlo sale de la lista
   * en todas, y cada una necesita su mínimo y su conteo.
   */
  async function openLink(item: UnlinkedRestockItem) {
    try {
      const all = branchId ? await httpClient.get<UnlinkedRestockItem[]>("/pos/restock/unlinked") : items;
      const same = all.filter((row) => (row.lineId ?? row.productId) === (item.lineId ?? item.productId));
      setLinking(same.length ? same : [item]);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo abrir el producto"));
    }
  }

  const productCount = useMemo(
    () => new Set(visible.map((item) => item.lineId ?? item.productId)).size,
    [visible]
  );

  return (
    <>
      <p className="page-kicker" style={{ margin: 0 }}>
        La caja deja vender cualquier producto aunque no esté en el formato de pedido; su existencia
        queda en negativo y nunca entra al surtido. Lígalos en Formato de pedido para que se repongan.
      </p>
      <FilterBar>
        <TextField
          select
          size="small"
          label="Sucursal"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          SelectProps={{ displayEmpty: true }}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 260 }}
        >
          <MenuItem value="">Todas las sucursales</MenuItem>
          {branches
            .filter((branch) => branch.type === "branch")
            .map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.code} · {branch.name}
              </MenuItem>
            ))}
        </TextField>
        <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por producto o SKU" />
        <Button
          variant="outlined"
          startIcon={<RefreshCw size={16} />}
          onClick={() => void load()}
          sx={{ height: 40, whiteSpace: "nowrap" }}
        >
          Actualizar
        </Button>
        <FilterDivider />
        <Button
          component={Link}
          href="/dashboard/pos/formato"
          variant="outlined"
          startIcon={<FileSpreadsheet size={16} />}
          sx={{ height: 40, whiteSpace: "nowrap" }}
        >
          Ir a Formato de pedido
        </Button>
        <FilterMeta>
          <strong>{productCount}</strong> {productCount === 1 ? "producto" : "productos"} sin formato
        </FilterMeta>
      </FilterBar>

      <div className="table-container-premium">
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Sucursal</th>
              <th style={{ textAlign: "right" }}>Vendido</th>
              <th style={{ textAlign: "right" }}>Existencia</th>
              <th>Última venta</th>
              {canLink ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const unit = item.unit === "liters" ? "L" : "pz";
              return (
                <tr key={`${item.branchId}:${item.lineId ?? item.productId}`}>
                  <td>
                    <strong>{item.name}</strong>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {item.unit === "liters" ? "Línea de líquidos" : item.sku ? `SKU ${item.sku}` : "Producto"}
                    </div>
                  </td>
                  <td>
                    {item.branchCode} · {item.branchName}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatQuantity(item.sold)} {unit}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      color: item.stock < 0 ? "#ef4444" : undefined,
                      fontWeight: item.stock < 0 ? 700 : 400,
                    }}
                  >
                    {formatQuantity(item.stock)} {unit}
                  </td>
                  <td>
                    {item.lastSoldAt
                      ? new Date(item.lastSoldAt).toLocaleString("es-MX", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  {canLink ? (
                    <td style={{ textAlign: "right" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Link2 size={14} />}
                        onClick={() => void openLink(item)}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        Ligar
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!visible.length && !loading ? (
              <tr>
                <td colSpan={canLink ? 6 : 5} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                  {search.trim()
                    ? "Ningún producto sin formato coincide con la búsqueda."
                    : "Todo lo vendido está ligado al formato de pedido."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {linking ? (
        <LinkToFormDialog
          items={linking}
          onClose={() => setLinking(null)}
          onLinked={() => {
            setLinking(null);
            void load();
          }}
        />
      ) : null}
    </>
  );
}
