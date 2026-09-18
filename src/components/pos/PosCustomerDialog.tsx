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
import { normalizePhone } from "@glamouroso/shared/utils/phone";
import { findCustomerByPhone, saveCustomers } from "@/lib/pos-offline/store";
import { posSync } from "@/lib/pos-offline/sync";
import { buildCustomerEvent } from "@/lib/pos-offline/sale-event";
import { formatMxPhone } from "@/utils/format-phone";
import type { Customer } from "@/types";
import { toast } from "sonner";

interface PosCustomerDialogProps {
  open: boolean;
  walkInName: string;
  /**
   * `charge`: se abrió desde F12, antes de cobrar. Un teléfono ya registrado
   * pasa directo al cobro sin un clic más. `assign` (F8) solo deja el cliente
   * en el ticket.
   */
  purpose?: "assign" | "charge";
  onClose: () => void;
  /** Quien recibe el cliente decide qué sigue (cobrar o volver al ticket) y cierra. */
  onPick: (customer: Customer | null) => void;
}

/** Fecha de nacimiento aproximada a partir de la edad: hoy menos N años. */
function birthdayFromAge(age: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - age);
  return date.toISOString().slice(0, 10);
}

/**
 * Cliente de la venta. Antes de cobrar (F12) la caja pide el teléfono: si ya
 * está registrado, con eso basta; si no, se registra ahí mismo con nombre y
 * teléfono como mínimo (correo y edad opcionales). El cliente queda en el CRM
 * con el mismo perfil que sus pedidos de WhatsApp.
 */
export function PosCustomerDialog({
  open,
  walkInName,
  purpose = "assign",
  onClose,
  onPick,
}: PosCustomerDialogProps) {
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Customer | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const beforeCharge = purpose === "charge";

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
      // Primero la copia local: es instantánea y es la única que responde con
      // el internet caído. Solo si ahí no está se pregunta al servidor, que
      // además conoce a los clientes de las otras sucursales.
      const local = await findCustomerByPhone(normalizePhone(clean));
      if (local) {
        const customer = { id: local.id, name: local.name, phone: local.phone } as Customer;
        if (beforeCharge) {
          onPick(customer);
          return;
        }
        setFound(customer);
        return;
      }

      const result = await httpClient.get<{ found: boolean; customer: Customer | null }>(
        "/pos/customers/lookup",
        { phone: clean }
      );
      if (result.found && result.customer) {
        // Antes de cobrar, el teléfono registrado es todo lo que hace falta.
        if (beforeCharge) {
          onPick(result.customer);
          return;
        }
        setFound(result.customer);
      } else {
        setNotFound(true);
      }
    } catch {
      // Sin red no es un error: simplemente no está en esta sucursal, y el
      // cajero lo registra aquí mismo como haría con cualquier cliente nuevo.
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ageRaw = String(form.get("age") || "").trim();
    const age = ageRaw ? Number(ageRaw) : null;
    if (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) {
      toast.error("La edad debe ser un número entre 1 y 120");
      return;
    }
    const data = {
      name: String(form.get("name") || "").trim(),
      phone: phone.replace(/\D/g, ""),
      birthday: age !== null ? birthdayFromAge(age) : null,
      email: String(form.get("email") || "").trim() || null,
    };

    setSaving(true);
    try {
      const created = await httpClient.post<Customer>("/pos/customers", data);
      await saveCustomers([
        {
          id: created.id,
          name: created.name,
          phone: created.phone ?? data.phone,
          phoneNormalized: normalizePhone(created.phone ?? data.phone),
          pricingTier: created.pricingTier ?? null,
          updatedAt: new Date().toISOString(),
        },
      ]);
      toast.success("Cliente registrado");
      onPick(created);
    } catch (error) {
      // Sin red el cliente se registra igual: se guarda con un id local, sube
      // como evento y el servidor lo empata por teléfono. La fila no se detiene
      // porque el internet esté caído.
      if (!navigator.onLine) {
        const localId = crypto.randomUUID();
        await saveCustomers([
          {
            id: localId,
            name: data.name,
            phone: data.phone,
            phoneNormalized: normalizePhone(data.phone),
            pricingTier: null,
            updatedAt: new Date().toISOString(),
            local: true,
          },
        ]);
        await posSync.push(buildCustomerEvent(localId, data, new Date()));
        toast.success("Cliente registrado en esta computadora. Subirá al volver el internet.");
        onPick({ id: localId, name: data.name, phone: data.phone } as Customer);
        return;
      }
      toast.error(getApiErrorMessage(error, "No se pudo registrar el cliente"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{beforeCharge ? "Cliente antes de cobrar" : "Cliente de la venta"}</DialogTitle>
      <DialogContent dividers>
        <form onSubmit={search} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <TextField
            label="Teléfono móvil del cliente"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoFocus
            fullWidth
            helperText={
              beforeCharge
                ? "Si ya está registrado, con el teléfono basta para cobrar. Si no, regístralo aquí."
                : "Buscar por teléfono. Si no existe, se puede registrar aquí mismo."
            }
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
              <Button size="small" onClick={() => onPick(found)}>
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
              No hay cliente con ese teléfono. Regístralo con su nombre; correo y edad son opcionales.
            </Alert>
            <TextField name="name" label="Nombre" required fullWidth autoFocus />
            <TextField
              name="age"
              label="Edad"
              type="number"
              fullWidth
              inputProps={{ min: 1, max: 120, inputMode: "numeric" }}
            />
            <TextField name="email" label="Correo" type="email" fullWidth sx={{ gridColumn: "1 / -1" }} />
            <Button type="submit" variant="contained" disabled={saving} sx={{ gridColumn: "1 / -1" }}>
              {saving ? "Guardando..." : beforeCharge ? "Registrar y cobrar" : "Registrar y usar"}
            </Button>
          </form>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onPick(null)} color="inherit">
          {beforeCharge ? `Cobrar como ${walkInName.toLowerCase()}` : `Sin cliente (${walkInName.toLowerCase()})`}
        </Button>
        <Button onClick={onClose}>Cancelar (ESC)</Button>
      </DialogActions>
    </Dialog>
  );
}
