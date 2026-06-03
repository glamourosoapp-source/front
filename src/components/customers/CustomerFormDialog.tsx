"use client";

import { FormEvent } from "react";
import {
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
import { Customer } from "@/types";
import { toast } from "sonner";

interface CustomerFormDialogProps {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: (customer?: Customer) => void;
}

export function CustomerFormDialog({ open, customer, onClose, onSaved }: CustomerFormDialogProps) {
  const isEdit = Boolean(customer);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name")),
      phone: String(form.get("phone")),
      email: String(form.get("email") || ""),
      street: String(form.get("street") || ""),
      colony: String(form.get("colony") || ""),
      postalCode: String(form.get("postalCode") || ""),
      city: String(form.get("city") || ""),
      zone: String(form.get("zone") || ""),
      address: String(form.get("address") || ""),
      notes: String(form.get("notes") || ""),
      pricingTier: String(form.get("pricingTier") || "retail"),
    };
    try {
      if (isEdit && customer) {
        const updated = await httpClient.put<Customer>(`/customers/${customer.id}`, payload);
        toast.success("Cliente actualizado con éxito");
        onSaved(updated);
      } else {
        const created = await httpClient.post<Customer>("/customers", payload);
        toast.success("Cliente creado con éxito");
        onSaved(created);
      }
      onClose();
    } catch {
      toast.error("Error al guardar el cliente");
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
            Domicilio de entrega
          </Typography>
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
            select
            name="pricingTier"
            label="Lista de precios"
            defaultValue={customer?.pricingTier || "retail"}
            fullWidth
          >
            <MenuItem value="retail">Menudeo</MenuItem>
            <MenuItem value="wholesale">Mayoreo</MenuItem>
          </TextField>
          <TextField
            name="address"
            label="Referencias de entrega"
            defaultValue={customer?.address || ""}
            fullWidth
            multiline
            minRows={2}
            placeholder="Portón, entre calles, etc."
          />

          <TextField name="notes" label="Notas" defaultValue={customer?.notes || ""} fullWidth multiline minRows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
