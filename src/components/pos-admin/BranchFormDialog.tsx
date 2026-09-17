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
import { Branch } from "@/types";
import { toast } from "sonner";

interface BranchFormDialogProps {
  open: boolean;
  branch: Branch | null;
  /** Tipo preseleccionado al crear: la lista de franquicias crea franquicias. */
  defaultType?: BranchType;
  onClose: () => void;
  onSaved: () => void;
}

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

  useEffect(() => {
    if (open) setIsActive(branch?.isActive ?? true);
  }, [open, branch]);

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

    setSaving(true);
    try {
      if (isEdit && branch) {
        await httpClient.put(`/pos/branches/${branch.id}`, { ...payload, isActive });
        toast.success("Sucursal actualizada");
      } else {
        await httpClient.post("/pos/branches", payload);
        toast.success("Sucursal creada");
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
            defaultValue={branch?.type || defaultType}
            fullWidth
            helperText="Una franquicia solo levanta pedidos a fábrica, sin caja ni inventario."
          >
            <MenuItem value={BRANCH_TYPES.BRANCH}>Sucursal con punto de venta</MenuItem>
            <MenuItem value={BRANCH_TYPES.FRANCHISE}>Franquicia (solo pedidos)</MenuItem>
          </TextField>
          <TextField
            select
            name="restockCutoffDow"
            label="Día de corte de faltantes"
            defaultValue={branch?.restockCutoffDow ?? ""}
            fullWidth
            helperText="Ese día se calcula el faltante y se genera el pedido a fábrica."
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
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
