"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
} from "@mui/material";
import { MapPin, Plus, Truck } from "lucide-react";
import { formatCustomerLocationAddress, type CustomerLocation } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMxPhone } from "@/utils/format-phone";
import type { Customer } from "@/types";
import type { PosTicketDelivery } from "@/stores/pos.store";
import { toast } from "sonner";

export interface PosDeliveryChoice {
  customer: Customer;
  delivery: PosTicketDelivery;
}

interface PosDeliveryDialogProps {
  open: boolean;
  /** Lo que la pestaña ya tenía (se volvió a abrir el diálogo). */
  initialCustomer: { id: string; name: string } | null;
  initialDelivery: PosTicketDelivery | null;
  onClose: () => void;
  onConfirm: (choice: PosDeliveryChoice) => void;
}

const EMPTY_ADDRESS = {
  street: "",
  colony: "",
  postalCode: "",
  city: "",
  zone: "",
  reference: "",
  googleMapsUrl: "",
};

/** Mismo mínimo que el CRM: calle, colonia y ciudad, o un link de Google Maps. */
function addressIsComplete(address: typeof EMPTY_ADDRESS): boolean {
  const filled = (value: string) => value.trim().length > 0;
  return (
    (filled(address.street) && filled(address.colony) && filled(address.city)) ||
    filled(address.googleMapsUrl)
  );
}

/**
 * Datos de la venta a domicilio: el cliente (registrado, con nombre y
 * teléfono) y el domicilio adonde la fábrica lo va a entregar, con una nota
 * para el repartidor. Son los mismos datos que pide un pedido del CRM, porque
 * la venta crea uno: el domicilio queda guardado en el cliente.
 *
 * Necesita red: el cliente y sus domicilios viven en el servidor.
 */
export function PosDeliveryDialog({
  open,
  initialCustomer,
  initialDelivery,
  onClose,
  onConfirm,
}: PosDeliveryDialogProps) {
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [locationId, setLocationId] = useState("");
  const [addingAddress, setAddingAddress] = useState(false);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadLocations(customerId: string, select?: string) {
    try {
      const rows = await httpClient.get<CustomerLocation[]>(`/pos/customers/${customerId}/locations`);
      setLocations(rows);
      const preferred = select ?? rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? "";
      setLocationId(preferred);
      // Sin domicilios guardados, el formulario ya abierto: no hay nada que elegir.
      setAddingAddress(rows.length === 0);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los domicilios. Revisa la conexión."));
    }
  }

  useEffect(() => {
    if (!open) return;
    setPhone("");
    setNotFound(false);
    setAddress(EMPTY_ADDRESS);
    setNotes(initialDelivery?.notes ?? "");
    setLocations([]);
    setLocationId("");
    setAddingAddress(false);
    if (initialCustomer) {
      setCustomer({ id: initialCustomer.id, name: initialCustomer.name } as Customer);
      void loadLocations(initialCustomer.id, initialDelivery?.customerLocationId);
    } else {
      setCustomer(null);
    }
    // Solo al abrir: lo inicial es una foto de la pestaña en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 7) return;
    setSearching(true);
    setNotFound(false);
    setCustomer(null);
    setLocations([]);
    try {
      const result = await httpClient.get<{ found: boolean; customer: Customer | null }>(
        "/pos/customers/lookup",
        { phone: clean }
      );
      if (result.found && result.customer) {
        setCustomer(result.customer);
        await loadLocations(result.customer.id);
      } else {
        setNotFound(true);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Sin conexión: la venta a domicilio necesita internet."));
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
        email: String(form.get("email") || "").trim() || null,
      });
      setCustomer(created);
      setNotFound(false);
      setLocations([]);
      setAddingAddress(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo registrar el cliente"));
    } finally {
      setSaving(false);
    }
  }

  async function saveAddress() {
    if (!customer) return;
    if (!addressIsComplete(address)) {
      toast.error("Escribe calle, colonia y ciudad, o pega el link de Google Maps");
      return;
    }
    setSaving(true);
    try {
      const created = await httpClient.post<CustomerLocation>(
        `/pos/customers/${customer.id}/locations`,
        Object.fromEntries(Object.entries(address).map(([key, value]) => [key, value.trim() || null]))
      );
      setAddress(EMPTY_ADDRESS);
      await loadLocations(customer.id, created.id);
      setAddingAddress(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar el domicilio"));
    } finally {
      setSaving(false);
    }
  }

  const chosen = locations.find((row) => row.id === locationId) ?? null;
  const canContinue = Boolean(customer && chosen) && !addingAddress && !saving;

  function confirm() {
    if (!customer || !chosen) return;
    onConfirm({
      customer,
      delivery: {
        customerLocationId: chosen.id,
        addressLabel: formatCustomerLocationAddress(chosen),
        notes: notes.trim(),
      },
    });
  }

  const field = (key: keyof typeof EMPTY_ADDRESS) => ({
    value: address[key],
    onChange: (event: { target: { value: string } }) =>
      setAddress((current) => ({ ...current, [key]: event.target.value })),
  });

  return (
    <Dialog open={open} onClose={() => (saving ? null : onClose())} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, color: "#1d4ed8" }}>
        <Truck size={20} /> Venta a domicilio: cliente y domicilio
      </DialogTitle>
      <DialogContent dividers>
        {customer ? (
          <Alert
            severity="success"
            action={
              <Button size="small" onClick={() => { setCustomer(null); setLocations([]); setLocationId(""); }}>
                Cambiar
              </Button>
            }
          >
            <strong>{customer.name}</strong>
            {customer.phone ? ` · ${formatMxPhone(customer.phone)}` : ""}
          </Alert>
        ) : (
          <form onSubmit={search} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <TextField
              label="Teléfono móvil del cliente"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoFocus
              fullWidth
              helperText="Obligatorio: el pedido de entrega va a nombre del cliente."
              inputProps={{ inputMode: "numeric" }}
            />
            <Button type="submit" variant="contained" disabled={searching} sx={{ height: 40, mt: 0.5 }}>
              {searching ? "Buscando..." : "Buscar"}
            </Button>
          </form>
        )}

        {notFound && !customer ? (
          <form onSubmit={register} className="form-grid" style={{ marginTop: 16 }}>
            <Alert severity="info" sx={{ gridColumn: "1 / -1" }}>
              No hay cliente con ese teléfono. Regístralo con su nombre para seguir.
            </Alert>
            <TextField name="name" label="Nombre" required fullWidth autoFocus inputProps={{ minLength: 2 }} />
            <TextField name="email" label="Correo (opcional)" type="email" fullWidth />
            <Button type="submit" variant="contained" disabled={saving} sx={{ gridColumn: "1 / -1" }}>
              {saving ? "Guardando..." : "Registrar cliente"}
            </Button>
          </form>
        ) : null}

        {customer ? (
          <div style={{ marginTop: 16 }}>
            <div className="pos-total-label" style={{ marginBottom: 6 }}>
              Domicilio de entrega
            </div>
            {locations.length ? (
              <RadioGroup value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                {locations.map((row) => (
                  <FormControlLabel
                    key={row.id}
                    value={row.id}
                    control={<Radio size="small" />}
                    label={
                      <span>
                        <MapPin size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                        {row.label ? <strong>{row.label}: </strong> : null}
                        {formatCustomerLocationAddress(row)}
                      </span>
                    }
                  />
                ))}
              </RadioGroup>
            ) : null}

            {addingAddress ? (
              <div className="form-grid" style={{ marginTop: 8 }}>
                <Alert severity="info" sx={{ gridColumn: "1 / -1" }}>
                  Calle, colonia y ciudad, o el link de Google Maps que mandó el cliente.
                </Alert>
                <TextField label="Calle y número" fullWidth autoFocus {...field("street")} />
                <TextField label="Colonia" fullWidth {...field("colony")} />
                <TextField label="Código postal" fullWidth inputProps={{ inputMode: "numeric" }} {...field("postalCode")} />
                <TextField label="Ciudad" fullWidth {...field("city")} />
                <TextField label="Zona" fullWidth {...field("zone")} />
                <TextField label="Referencias" fullWidth {...field("reference")} />
                <TextField
                  label="URL de Google Maps"
                  fullWidth
                  sx={{ gridColumn: "1 / -1" }}
                  {...field("googleMapsUrl")}
                />
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                  <Button variant="contained" onClick={() => void saveAddress()} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar domicilio"}
                  </Button>
                  {locations.length ? (
                    <Button color="inherit" onClick={() => setAddingAddress(false)} disabled={saving}>
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <Button startIcon={<Plus size={14} />} size="small" onClick={() => setAddingAddress(true)} sx={{ mt: 1 }}>
                Agregar otro domicilio
              </Button>
            )}

            <TextField
              label="Nota para el repartidor (opcional)"
              placeholder="Referencias, horario en que hay alguien…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              fullWidth
              multiline
              minRows={2}
              sx={{ mt: 2 }}
              inputProps={{ maxLength: 500 }}
            />
          </div>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Cancelar (ESC)
        </Button>
        <Button variant="contained" onClick={confirm} disabled={!canContinue}>
          Continuar al cobro
        </Button>
      </DialogActions>
    </Dialog>
  );
}
