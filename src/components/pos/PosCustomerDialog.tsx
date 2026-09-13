"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMxPhone } from "@/utils/format-phone";
import type { Customer } from "@/types";
import { toast } from "sonner";

interface PosCustomerDialogProps {
  open: boolean;
  walkInName: string;
  onClose: () => void;
  onPick: (customer: Customer | null) => void;
}

/**
 * Cliente de la venta (F8).
 *
 * El registro es **opcional**: si el cliente no quiere dar sus datos, la venta
 * se cobra como mostrador y la fila no se detiene. Cuando sí se registra, el
 * cliente queda en el CRM con el mismo perfil que sus pedidos de WhatsApp.
 */
export function PosCustomerDialog({ open, walkInName, onClose, onPick }: PosCustomerDialogProps) {
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Customer | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPhone("");
      setFound(null);
      setNotFound(false);
    }
  }, [open]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 7) return;
    setSearching(true);
    setNotFound(false);
    setFound(null);
    try {
      const result = await httpClient.get<{ found: boolean; customer: Customer | null }>(
        "/pos/customers/lookup",
        { phone: clean }
      );
      if (result.found && result.customer) setFound(result.customer);
      else setNotFound(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo buscar el cliente"));
    } finally {
      setSearching(false);
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const created = await httpClient.post<Customer>("/pos/customers", {
        name: String(form.get("name") || "").trim(),
        phone: phone.replace(/\D/g, ""),
        birthday: String(form.get("birthday") || "") || null,
        email: String(form.get("email") || "").trim() || null,
      });
      toast.success("Cliente registrado");
      onPick(created);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo registrar el cliente"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Cliente de la venta</DialogTitle>
      <DialogContent dividers>
        <form onSubmit={search} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <TextField
            label="WhatsApp del cliente"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoFocus
            fullWidth
            helperText="Buscar por teléfono. Si no existe, se puede registrar aquí mismo."
            inputProps={{ inputMode: "numeric" }}
          />
          <Button type="submit" variant="contained" disabled={searching} sx={{ height: 40, mt: 0.5 }}>
            {searching ? "Buscando..." : "Buscar"}
          </Button>
        </form>

        {found ? (
          <Alert
            severity="success"
            sx={{ mt: 2 }}
            action={
              <Button
                size="small"
                onClick={() => {
                  onPick(found);
                  onClose();
                }}
              >
                Usar
              </Button>
            }
          >
            <strong>{found.name}</strong> · {formatMxPhone(found.phone)}
            {found.pricingTier === "wholesale" ? " · lista de mayoreo" : ""}
            {Number(found.posSalesCount ?? 0) > 0
              ? ` · ${found.posSalesCount} compras en sucursal`
              : ""}
          </Alert>
        ) : null}

        {notFound ? (
          <form onSubmit={register} className="form-grid" style={{ marginTop: 16 }}>
            <Alert severity="info" sx={{ gridColumn: "1 / -1" }}>
              No hay cliente con ese teléfono. Regístralo o cobra como {walkInName.toLowerCase()}.
            </Alert>
            <TextField name="name" label="Nombre" required fullWidth autoFocus />
            <TextField
              name="birthday"
              label="Fecha de nacimiento"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField name="email" label="Correo" type="email" fullWidth sx={{ gridColumn: "1 / -1" }} />
            <Button type="submit" variant="contained" disabled={saving} sx={{ gridColumn: "1 / -1" }}>
              {saving ? "Guardando..." : "Registrar y usar"}
            </Button>
          </form>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            onPick(null);
            onClose();
          }}
        >
          Cobrar como {walkInName.toLowerCase()}
        </Button>
        <Button onClick={onClose}>Cancelar (ESC)</Button>
      </DialogActions>
    </Dialog>
  );
}
