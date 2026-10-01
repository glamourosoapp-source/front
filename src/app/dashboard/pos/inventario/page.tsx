"use client";

import { useEffect, useState } from "react";
import { MenuItem, TextField } from "@mui/material";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { BranchInventoryTab } from "@/components/pos-admin/tabs/BranchInventoryTab";
import type { Branch, ListResponse } from "@/types";

/**
 * Inventario por sucursal desde el menú: un selector de sucursal y la MISMA
 * pestaña "Inventario y mínimos" del detalle de la sucursal. Antes era una
 * pantalla aparte con otra tabla que no dejaba editar el mínimo en la fila;
 * ahora las dos entradas llevan a lo mismo. Se queda en el menú porque un
 * perfil con inventario pero sin Sucursales no puede abrir el detalle.
 */
export default function PosInventarioPage() {
  const { can } = usePermissions();
  const canView = can("posInventory", "view");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    if (!canView) return;
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200, isActive: "true" })
      .then((res) => {
        // Una franquicia lleva su propio inventario fuera del sistema: aquí
        // no tiene nada que mostrar.
        const withInventory = res.items.filter((branch) => branch.type !== BRANCH_TYPES.FRANCHISE);
        setBranches(withInventory);
        setBranchId((current) => current || withInventory[0]?.id || "");
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

  return (
    <div className="page-stack">
      <div className="toolbar" style={{ alignItems: "flex-end" }}>
        <div>
          <h1 className="page-title">Inventario por sucursal</h1>
          <p className="page-kicker" style={{ margin: 0 }}>
            Lo mismo que la pestaña Inventario y stock de cada sucursal: existencia, stock (lo que la sucursal debe
            tener siempre) editable en la fila, kardex y ajustes.
          </p>
        </div>
        <TextField
          select
          size="small"
          label="Sucursal"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 260 }}
        >
          {branches.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </MenuItem>
          ))}
        </TextField>
      </div>
      {branchId ? <BranchInventoryTab key={branchId} branchId={branchId} /> : <p className="page-kicker">Cargando...</p>}
    </div>
  );
}
