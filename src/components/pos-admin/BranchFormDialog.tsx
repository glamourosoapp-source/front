"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Link as MuiLink,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { BRANCH_TYPES, type BranchType } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { config } from "@/config";
import { Branch } from "@/types";
import { usePermissions } from "@/lib/permissions";
import { completeOpeningHours, OpeningHoursEditor, openingHoursError } from "./OpeningHoursEditor";
import type { StockSheetResult } from "@/lib/stock-sheet";
import { toast } from "sonner";
import {
  StockSheetPicker,
  StockSheetResultDialog,
  applyStockChoice,
  type StockSheetChoice,
} from "./StockSheetUpload";

interface BranchFormDialogProps {
  open: boolean;
  branch: Branch | null;
  /** Tipo preseleccionado al crear: la lista de franquicias crea franquicias. */
  defaultType?: BranchType;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Día de corte que se propone al dar de alta: el jueves, cierre de la semana del
 * punto de venta (viernes a jueves), que es cuando se saca el pedido a fábrica.
 * Solo a sucursales con caja: una franquicia no lleva inventario y no tiene faltante.
 */
const DEFAULT_RESTOCK_CUTOFF_DOW = 4;

/** Domingo primero, como el `restock_cutoff_dow` que guarda la base (0..6). */
const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

export function BranchFormDialog({
  open,
  branch,
  defaultType = BRANCH_TYPES.BRANCH,
  onClose,
  onSaved,
}: BranchFormDialogProps) {
  const isEdit = Boolean(branch);
  const [isActive, setIsActive] = useState(branch?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<string>(branch?.type || defaultType);
  const [stockChoice, setStockChoice] = useState<StockSheetChoice | null>(null);
  const [stockResult, setStockResult] = useState<StockSheetResult | null>(null);
  const [openingHours, setOpeningHours] = useState(() => completeOpeningHours(branch?.openingHours));
  const { can } = usePermissions();
  // El Excel de stock solo al dar de alta una sucursal con caja: una franquicia no lleva inventario.
  const canAttachStock = !isEdit && type === BRANCH_TYPES.BRANCH && can("posInventory", "update");

  useEffect(() => {
    if (!open) return;
    setIsActive(branch?.isActive ?? true);
    setType(branch?.type || defaultType);
    setStockChoice(null);
    setOpeningHours(completeOpeningHours(branch?.openingHours));
  }, [open, branch, defaultType]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const cutoffRaw = String(form.get("restockCutoffDow") || "");

    const payload: Record<string, unknown> = {
      code: String(form.get("code") || "").trim().toUpperCase(),
      name: String(form.get("name") || "").trim(),
      type: String(form.get("type") || BRANCH_TYPES.BRANCH),
      street: String(form.get("street") || "").trim() || null,
      colony: String(form.get("colony") || "").trim() || null,
      city: String(form.get("city") || "").trim() || null,
      postalCode: String(form.get("postalCode") || "").trim() || null,
      phone: String(form.get("phone") || "").trim() || null,
      restockCutoffDow: cutoffRaw === "" ? null : Number(cutoffRaw),
      notes: String(form.get("notes") || "").trim() || null,
    };
    // Solo una sucursal con caja abre y cierra tienda; una franquicia no lleva horario.
    if (type === BRANCH_TYPES.BRANCH) {
      const hoursError = openingHoursError(openingHours);
      if (hoursError) {
        toast.error(hoursError);
        return;
      }
      payload.openingHours = openingHours;
    }

    const stock = canAttachStock ? stockChoice : null;
    if (stock && stock.asInventory === null) {
      toast.error("Contesta si las cantidades del Excel son también el inventario de hoy");
      return;
    }

    setSaving(true);
    try {
      if (isEdit && branch) {
        await httpClient.put(`/pos/branches/${branch.id}`, { ...payload, isActive });
        toast.success("Sucursal actualizada");
      } else {
        const created = await httpClient.post<Branch>("/pos/branches", payload);
        toast.success("Sucursal creada");
        if (stock) {
          // La sucursal ya existe: si el Excel falla no se deshace el alta, se avisa
          // para cargarlo después desde su Stock.
          try {
            setStockResult(await applyStockChoice(created.id, stock));
          } catch (error) {
            toast.error(
              `La sucursal se creó, pero el Excel no se cargó: ${getApiErrorMessage(error, "error desconocido")}. Cárgalo desde Inventario → Stock de la sucursal.`
            );
          }
        }
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar la sucursal"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <StockSheetResultDialog result={stockResult} onClose={() => setStockResult(null)} />
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" key={branch?.id ?? "new"}>
      <form onSubmit={save}>
        <DialogTitle>
          {isEdit
            ? branch?.type === BRANCH_TYPES.FRANCHISE
              ? "Editar franquicia"
              : "Editar sucursal"
            : defaultType === BRANCH_TYPES.FRANCHISE
              ? "Nueva franquicia"
              : "Nueva sucursal"}
        </DialogTitle>
        <DialogContent className="form-grid" dividers>
          <TextField
            name="code"
            label="Código"
            defaultValue={branch?.code || ""}
            required
            fullWidth
            inputProps={{ style: { textTransform: "uppercase" } }}
            helperText="Prefijo del folio del ticket, p. ej. SUC01."
          />
          <TextField name="name" label="Nombre" defaultValue={branch?.name || ""} required fullWidth />
          <TextField
            select
            name="type"
            label="Tipo"
            value={type}
            onChange={(event) => setType(event.target.value)}
            fullWidth
            helperText="Una franquicia solo levanta pedidos a fábrica, sin caja ni inventario."
          >
            <MenuItem value={BRANCH_TYPES.BRANCH}>Sucursal con punto de venta</MenuItem>
            {/* Con el módulo de franquicias apagado no se crean nuevas; una que ya lo es conserva su tipo. */}
            {(config.franchiseModuleEnabled || branch?.type === BRANCH_TYPES.FRANCHISE) && (
              <MenuItem value={BRANCH_TYPES.FRANCHISE}>Franquicia (solo pedidos)</MenuItem>
            )}
          </TextField>
          <TextField
            select
            name="restockCutoffDow"
            label="Día de corte de faltantes"
            defaultValue={
              branch
                ? (branch.restockCutoffDow ?? "")
                : defaultType === BRANCH_TYPES.FRANCHISE
                  ? ""
                  : DEFAULT_RESTOCK_CUTOFF_DOW
            }
            fullWidth
            helperText="Ese día se calcula el faltante y se genera el pedido a fábrica. Normalmente el jueves, al cerrar la semana."
          >
            <MenuItem value="">Sin corte automático</MenuItem>
            {WEEKDAYS.map((day) => (
              <MenuItem key={day.value} value={day.value}>
                {day.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField name="street" label="Calle y número" defaultValue={branch?.street || ""} fullWidth />
          <TextField name="colony" label="Colonia" defaultValue={branch?.colony || ""} fullWidth />
          <TextField name="city" label="Ciudad" defaultValue={branch?.city || ""} fullWidth />
          <TextField name="postalCode" label="Código postal" defaultValue={branch?.postalCode || ""} fullWidth />
          <TextField name="phone" label="Teléfono" defaultValue={branch?.phone || ""} fullWidth />
          {type === BRANCH_TYPES.BRANCH ? (
            <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} disabled={saving} />
          ) : null}

          {/* El ticket (datos de facturación, letra y qué se imprime) se configura
              en Punto de venta → Ticket de venta, que además tiene vista previa. */}
          {isEdit ? (
            <Typography variant="body2" sx={{ gridColumn: "1 / -1", color: "var(--muted)" }}>
              El ticket impreso de esta sucursal se configura en{" "}
              <MuiLink component={Link} href={`/dashboard/pos/ticket?branch=${branch?.id}`}>
                Ticket de venta
              </MuiLink>
              : ahí se eligen los datos de facturación, el tamaño de letra y qué se imprime.
            </Typography>
          ) : null}
          <TextField
            name="notes"
            label="Notas internas"
            defaultValue={branch?.notes || ""}
            fullWidth
            multiline
            minRows={2}
            sx={{ gridColumn: "1 / -1" }}
          />
          {isEdit ? (
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
              label={isActive ? "Activa" : "Inactiva"}
              sx={{ gridColumn: "1 / -1" }}
            />
          ) : null}
          {canAttachStock ? (
            <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
              <Typography variant="subtitle2">Stock de la sucursal (opcional)</Typography>
              <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                El formato de pedido a tiendas en Excel con la columna Cant llena: lo que la sucursal debe tener siempre,
                en empaques como en el papel.
              </Typography>
              <StockSheetPicker value={stockChoice} onChange={setStockChoice} disabled={saving} />
            </div>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? (stockChoice && canAttachStock ? "Creando y cargando stock..." : "Guardando...") : "Guardar"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
    </>
  );
}
