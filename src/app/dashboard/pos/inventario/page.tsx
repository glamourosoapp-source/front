"use client";

import { useEffect, useState } from "react";
import { Button } from "@mui/material";
import { FileSpreadsheet, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { exportInventoryToXlsx, type InventoryExportRow } from "@/lib/export-inventory-xlsx";
import { BranchPicker, branchSelectionLabel } from "@/components/pos-admin/BranchPicker";
import { BranchesInventoryMatrix, type InventoryOverview } from "@/components/pos-admin/BranchesInventoryMatrix";
import { BranchInventoryTab } from "@/components/pos-admin/tabs/BranchInventoryTab";
import type { Branch, ListResponse } from "@/types";

/**
 * Inventario desde el menú, para **una, varias o todas** las sucursales:
 * - Una sola: la MISMA pestaña "Inventario y stock" del detalle de la
 *   sucursal (stock editable en la fila, kardex y ajustes).
 * - Varias o todas: una tabla con una columna por sucursal para comparar.
 * En ambos casos el Excel baja el inventario completo de lo elegido. Se queda
 * en el menú porque un perfil con inventario pero sin Sucursales no puede
 * abrir el detalle.
 */
export default function PosInventarioPage() {
  const { can } = usePermissions();
  const canView = can("posInventory", "view");
  const [branches, setBranches] = useState<Branch[]>([]);
  /** Vacío = todas las sucursales activas. */
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!canView) return;
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200, isActive: "true" })
      .then((res) => {
        // Una franquicia lleva su propio inventario fuera del sistema: aquí
        // no tiene nada que mostrar.
        const withInventory = res.items.filter((branch) => branch.type !== BRANCH_TYPES.FRANCHISE);
        setBranches(withInventory);
        // Si solo hay una sucursal, "todas" es esa: se abre editable.
        if (withInventory.length === 1) setBranchIds([withInventory[0]!.id]);
      })
      .catch((error) => toast.error(getApiErrorMessage(error, "Error al cargar las sucursales")));
  }, [canView]);

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              El inventario necesita el permiso de Inventario del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const single = branchIds.length === 1 ? branchIds[0]! : null;
  const label = branchSelectionLabel(branches, branchIds);

  /** Baja todo el inventario de lo elegido, sin los filtros de búsqueda de la pantalla. */
  async function downloadExcel() {
    setExporting(true);
    try {
      const data = await httpClient.get<InventoryOverview>("/pos/inventory", {
        ...(branchIds.length ? { branchIds: branchIds.join(",") } : {}),
      });
      const rows: InventoryExportRow[] = [
        ...data.lines.map((line) => ({
          kind: "line" as const,
          name: line.name,
          sku: null,
          categoryName: line.categoryName,
          byBranch: line.byBranch,
        })),
        ...data.products.map((product) => ({
          kind: "product" as const,
          name: product.name,
          sku: product.sku,
          categoryName: product.categoryName,
          byBranch: product.byBranch,
        })),
      ];
      await exportInventoryToXlsx({ branches: data.branches, rows, label });
      toast.success("Excel de inventario descargado");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo generar el Excel"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Inventario por sucursal</h1>
          <p className="page-kicker" style={{ margin: 0 }}>
            {single
              ? "Existencia, stock (lo que la sucursal debe tener siempre) editable en la fila, kardex y ajustes."
              : "Existencia de cada sucursal lado a lado. Da clic en una sucursal para editar su stock y sus ajustes."}
          </p>
        </div>
        <div className="inv-actions">
          <BranchPicker branches={branches} value={branchIds} onChange={setBranchIds} />
          <Button
            variant="contained"
            startIcon={<FileSpreadsheet size={16} />}
            onClick={() => void downloadExcel()}
            disabled={exporting || !branches.length}
            sx={{ height: 40, whiteSpace: "nowrap" }}
          >
            {exporting ? "Generando…" : "Descargar Excel"}
          </Button>
        </div>
      </div>

      {single ? (
        <BranchInventoryTab key={single} branchId={single} />
      ) : branches.length ? (
        <BranchesInventoryMatrix branchIds={branchIds} onPickBranch={(id) => setBranchIds([id])} />
      ) : (
        <p className="page-kicker">Cargando...</p>
      )}
    </div>
  );
}
