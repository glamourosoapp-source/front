"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { Customer, ListResponse, Team } from "@/types";
import { toast } from "sonner";
import {
  CustomerLocationsEditor,
  type CustomerLocationsEditorHandle,
} from "@/components/customers/CustomerLocationsEditor";

interface CustomerFormDialogProps {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: (customer?: Customer) => void;
}

export function CustomerFormDialog({ open, customer, onClose, onSaved }: CustomerFormDialogProps) {
  const isEdit = Boolean(customer);
  const { isAdmin } = usePermissions();
  const [saving, setSaving] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const locationsEditorRef = useRef<CustomerLocationsEditorHandle>(null);

  // Reasignación de equipo: solo admins en edición.
  const showTeamSelect = isAdmin && isEdit;
  useEffect(() => {
    if (!open || !showTeamSelect || teams.length) return;
    httpClient
      .get<ListResponse<Team>>("/teams", { limit: 200 })
      .then((r) => setTeams(r.items))
      .catch(() => undefined);
  }, [open, showTeamSelect, teams.length]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const teamIdRaw = String(form.get("teamId") || "");
    const payload = {
      name: String(form.get("name")),
      phone: String(form.get("phone")),
      email: String(form.get("email") || ""),
      notes: String(form.get("notes") || ""),
      pricingTier: String(form.get("pricingTier") || "retail"),
      ...(showTeamSelect ? { teamId: teamIdRaw ? teamIdRaw : null } : {}),
      ...(isEdit
        ? {}
        : {
            street: String(form.get("street") || ""),
            colony: String(form.get("colony") || ""),
            postalCode: String(form.get("postalCode") || ""),
            city: String(form.get("city") || ""),
            zone: String(form.get("zone") || ""),
            address: String(form.get("address") || ""),
          }),
    };
    setSaving(true);
    try {
      if (isEdit && customer) {
        const updated = await httpClient.put<Customer>(`/customers/${customer.id}`, payload);
        // El editor de ubicaciones maneja su propio estado: persistir aquí los
        // drafts sucios para que el Guardar del diálogo no los descarte.
        const locationsOk = (await locationsEditorRef.current?.saveAll()) ?? true;
        if (locationsOk) {
          toast.success("Cliente actualizado con éxito");
        } else {
          toast.warning("Cliente actualizado, pero alguna ubicación no se pudo guardar.");
        }
        onSaved(updated);
      } else {
        const created = await httpClient.post<Customer>("/customers", payload);
        const hasLocation =
          payload.street || payload.colony || payload.postalCode || payload.city ||
          payload.address || payload.zone;
        if (hasLocation) {
          // El cliente ya existe: si falla el domicilio no hay que "reintentar
          // guardar el cliente" (duplicaría), solo avisar qué faltó.
          try {
            await httpClient.post(`/customers/${created.id}/locations`, {
              label: "Principal",
              street: payload.street,
              colony: payload.colony,
              postalCode: payload.postalCode,
              city: payload.city,
              zone: payload.zone,
              reference: payload.address,
              isDefault: true,
            });
          } catch {
            toast.warning("Cliente creado, pero el domicilio no se pudo guardar. Agrégalo desde Editar.");
          }
        }
        toast.success("Cliente creado con éxito");
        onSaved(created);
      }
      onClose();
    } catch {
      toast.error("Error al guardar el cliente");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" key={customer?.id ?? "new"}>
      <form onSubmit={save}>
        <DialogTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
        <DialogContent className="form-grid" dividers>
          <TextField name="name" label="Nombre" defaultValue={customer?.name || ""} fullWidth required />
          <TextField name="phone" label="WhatsApp" defaultValue={customer?.phone || ""} fullWidth required />
          <TextField name="email" label="Correo" type="email" defaultValue={customer?.email || ""} fullWidth />

          <Typography variant="subtitle2" sx={{ gridColumn: "1 / -1", mt: 1 }}>
            {isEdit ? "Datos de contacto" : "Domicilio de entrega"}
          </Typography>
          {!isEdit ? (
            <>
              <TextField name="street" label="Calle y número" defaultValue={customer?.street || ""} fullWidth />
              <TextField name="colony" label="Colonia" defaultValue={customer?.colony || ""} fullWidth />
              <TextField
                name="postalCode"
                label="Código postal"
                defaultValue={customer?.postalCode || ""}
                fullWidth
                inputProps={{ maxLength: 10 }}
              />
              <TextField name="city" label="Ciudad" defaultValue={customer?.city || ""} fullWidth />
              <TextField name="zone" label="Zona" defaultValue={customer?.zone || ""} fullWidth />
              <TextField
                name="address"
                label="Referencias de entrega"
                defaultValue={customer?.address || ""}
                fullWidth
                multiline
                minRows={2}
                placeholder="Portón, entre calles, etc."
              />
            </>
          ) : null}
          <TextField
            select
            name="pricingTier"
            label="Lista de precios"
            defaultValue={customer?.pricingTier || "retail"}
            fullWidth
          >
            <MenuItem value="retail">Menudeo</MenuItem>
            <MenuItem value="wholesale">Mayoreo</MenuItem>
          </TextField>
          {showTeamSelect ? (
            <TextField
              select
              name="teamId"
              label="Equipo"
              defaultValue={customer?.teamId || ""}
              fullWidth
              helperText="Define qué equipo ve a este cliente."
            >
              <MenuItem value="">Sin equipo</MenuItem>
              {teams.map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {team.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          {isEdit && customer ? (
            <Box sx={{ gridColumn: "1 / -1" }}>
              <CustomerLocationsEditor
                ref={locationsEditorRef}
                customerId={customer.id}
                onChanged={() => onSaved()}
              />
            </Box>
          ) : null}

          <TextField name="notes" label="Notas" defaultValue={customer?.notes || ""} fullWidth multiline minRows={2} />
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
