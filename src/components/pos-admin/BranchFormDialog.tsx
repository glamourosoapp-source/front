"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { BRANCH_TYPES, TICKET_PAPER_WIDTHS } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { Branch } from "@/types";
import { toast } from "sonner";

interface BranchFormDialogProps {
  open: boolean;
  branch: Branch | null;
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

export function BranchFormDialog({ open, branch, onClose, onSaved }: BranchFormDialogProps) {
  const isEdit = Boolean(branch);
  const [isActive, setIsActive] = useState(branch?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const ticket = (branch?.ticketSettings ?? {}) as Record<string, unknown>;

  useEffect(() => {
    if (open) setIsActive(branch?.isActive ?? true);
  }, [open, branch]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const cutoffRaw = String(form.get("restockCutoffDow") || "");
    const headerRaw = String(form.get("headerLines") || "").trim();

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
      // El Back mergea esta sección: la impresora elegida en la PC de la
      // sucursal no viaja en este formulario y no debe perderse.
      ticketSettings: {
        paperWidthMm: Number(form.get("paperWidthMm") || 80),
        headerLines: headerRaw ? headerRaw.split("\n").map((line) => line.trim()).filter(Boolean) : [],
        footerMessage: String(form.get("footerMessage") || "").trim(),
      },
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
        <DialogTitle>{isEdit ? "Editar sucursal" : "Nueva sucursal"}</DialogTitle>
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
            defaultValue={branch?.type || BRANCH_TYPES.BRANCH}
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

          <Typography variant="subtitle2" sx={{ gridColumn: "1 / -1", mt: 1 }}>
            Ticket impreso
          </Typography>
          <TextField
            select
            name="paperWidthMm"
            label="Ancho de papel"
            defaultValue={Number(ticket.paperWidthMm ?? 80)}
            fullWidth
          >
            {TICKET_PAPER_WIDTHS.map((width) => (
              <MenuItem key={width} value={width}>
                {width} mm
              </MenuItem>
            ))}
          </TextField>
          <TextField
            name="footerMessage"
            label="Mensaje final"
            defaultValue={String(ticket.footerMessage ?? "")}
            fullWidth
          />
          <TextField
            name="headerLines"
            label="Encabezado del ticket"
            defaultValue={(Array.isArray(ticket.headerLines) ? ticket.headerLines : []).join("\n")}
            fullWidth
            multiline
            minRows={2}
            sx={{ gridColumn: "1 / -1" }}
            helperText="Una línea por renglón: domicilio, teléfono, RFC. Se imprime bajo el logo."
          />
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
