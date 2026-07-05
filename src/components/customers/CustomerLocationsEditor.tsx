"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { Plus, Trash2 } from "lucide-react";
import { MAX_CUSTOMER_LOCATIONS, type CustomerLocation } from "@glamouroso/shared";
import { formatCustomerDeliveryAddress } from "@glamouroso/shared";
import { httpClient } from "@/services/http-client";
import { toast } from "sonner";

type LocationDraft = {
  id?: string;
  label: string;
  street: string;
  colony: string;
  postalCode: string;
  city: string;
  zone: string;
  reference: string;
  googleMapsUrl: string;
  isDefault: boolean;
};

function emptyDraft(isDefault = false): LocationDraft {
  return {
    label: "",
    street: "",
    colony: "",
    postalCode: "",
    city: "",
    zone: "",
    reference: "",
    googleMapsUrl: "",
    isDefault,
  };
}

function fromApi(location: CustomerLocation): LocationDraft {
  return {
    id: location.id,
    label: location.label || "",
    street: location.street || "",
    colony: location.colony || "",
    postalCode: location.postalCode || "",
    city: location.city || "",
    zone: location.zone || "",
    reference: location.reference || "",
    googleMapsUrl: location.googleMapsUrl || "",
    isDefault: location.isDefault,
  };
}

function payloadFromDraft(draft: LocationDraft) {
  return {
    label: draft.label,
    street: draft.street,
    colony: draft.colony,
    postalCode: draft.postalCode,
    city: draft.city,
    zone: draft.zone,
    reference: draft.reference,
    googleMapsUrl: draft.googleMapsUrl,
    isDefault: draft.isDefault,
  };
}

interface CustomerLocationsEditorProps {
  customerId: string;
  onChanged?: () => void;
}

export function CustomerLocationsEditor({ customerId, onChanged }: CustomerLocationsEditorProps) {
  const [drafts, setDrafts] = useState<LocationDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const locations = await httpClient.get<CustomerLocation[]>(`/customers/${customerId}/locations`);
      setDrafts(locations.length ? locations.map(fromApi) : [emptyDraft(true)]);
    } catch {
      toast.error("No se pudieron cargar las ubicaciones");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDraft(index: number, patch: Partial<LocationDraft>) {
    setDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function setDefault(index: number) {
    setDrafts((prev) => prev.map((item, i) => ({ ...item, isDefault: i === index })));
  }

  async function saveDraft(index: number) {
    const draft = drafts[index];
    if (!draft) return;
    setSavingId(draft.id || `new-${index}`);
    try {
      if (draft.id) {
        await httpClient.put(`/customers/${customerId}/locations/${draft.id}`, payloadFromDraft(draft));
      } else {
        const created = await httpClient.post<CustomerLocation>(
          `/customers/${customerId}/locations`,
          payloadFromDraft(draft),
        );
        updateDraft(index, fromApi(created));
      }
      toast.success("Ubicación guardada");
      await load();
      onChanged?.();
    } catch {
      toast.error("No se pudo guardar la ubicación");
    } finally {
      setSavingId(null);
    }
  }

  async function removeDraft(index: number) {
    const draft = drafts[index];
    if (!draft) return;
    if (!draft.id) {
      setDrafts((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setSavingId(draft.id);
    try {
      await httpClient.delete(`/customers/${customerId}/locations/${draft.id}`);
      toast.success("Ubicación eliminada");
      await load();
      onChanged?.();
    } catch {
      toast.error("No se pudo eliminar la ubicación");
    } finally {
      setSavingId(null);
    }
  }

  function addDraft() {
    if (drafts.length >= MAX_CUSTOMER_LOCATIONS) return;
    setDrafts((prev) => [...prev, emptyDraft(prev.length === 0)]);
  }

  if (loading) {
    return <Typography variant="body2">Cargando ubicaciones...</Typography>;
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
        <div>
          <Typography variant="subtitle2">Ubicaciones de entrega</Typography>
          <Typography variant="caption" sx={{ color: "var(--muted)" }}>
            Máximo {MAX_CUSTOMER_LOCATIONS} ubicaciones por cliente.
          </Typography>
        </div>
        <Button
          size="small"
          startIcon={<Plus size={16} />}
          onClick={addDraft}
          disabled={drafts.length >= MAX_CUSTOMER_LOCATIONS}
        >
          Agregar ubicación
        </Button>
      </Box>

      {drafts.map((draft, index) => {
        const preview = formatCustomerDeliveryAddress({
          street: draft.street,
          colony: draft.colony,
          postalCode: draft.postalCode,
          city: draft.city,
          zone: draft.zone,
          address: draft.reference,
        });
        const busy = savingId === (draft.id || `new-${index}`);

        return (
          <Box
            key={draft.id || `draft-${index}`}
            sx={{
              border: "1px solid var(--border)",
              borderRadius: 2,
              p: 2,
              display: "grid",
              gap: 1.5,
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="subtitle2">
                {draft.label || `Ubicación ${index + 1}`}
                {draft.isDefault ? " (predeterminada)" : ""}
              </Typography>
              <IconButton
                size="small"
                aria-label="Eliminar ubicación"
                onClick={() => void removeDraft(index)}
                disabled={busy}
              >
                <Trash2 size={16} />
              </IconButton>
            </Box>

            <TextField
              label="Etiqueta"
              value={draft.label}
              onChange={(e) => updateDraft(index, { label: e.target.value })}
              placeholder="Casa, Local, Bodega..."
              fullWidth
              size="small"
            />
            <TextField
              label="Calle y número"
              value={draft.street}
              onChange={(e) => updateDraft(index, { street: e.target.value })}
              fullWidth
              size="small"
            />
            <TextField
              label="Colonia"
              value={draft.colony}
              onChange={(e) => updateDraft(index, { colony: e.target.value })}
              fullWidth
              size="small"
            />
            <TextField
              label="Código postal"
              value={draft.postalCode}
              onChange={(e) => updateDraft(index, { postalCode: e.target.value })}
              fullWidth
              size="small"
              inputProps={{ maxLength: 10 }}
            />
            <TextField
              label="Ciudad"
              value={draft.city}
              onChange={(e) => updateDraft(index, { city: e.target.value })}
              fullWidth
              size="small"
            />
            <TextField
              label="Zona"
              value={draft.zone}
              onChange={(e) => updateDraft(index, { zone: e.target.value })}
              fullWidth
              size="small"
            />
            <TextField
              label="Referencias"
              value={draft.reference}
              onChange={(e) => updateDraft(index, { reference: e.target.value })}
              fullWidth
              size="small"
              multiline
              minRows={2}
            />
            <TextField
              label="URL de Google Maps"
              value={draft.googleMapsUrl}
              onChange={(e) => updateDraft(index, { googleMapsUrl: e.target.value })}
              fullWidth
              size="small"
              placeholder="https://maps.app.goo.gl/..."
            />
            {draft.googleMapsUrl ? (
              <Typography variant="caption">
                <a href={draft.googleMapsUrl} target="_blank" rel="noreferrer">
                  Abrir en Google Maps
                </a>
              </Typography>
            ) : null}
            <FormControlLabel
              control={
                <Checkbox checked={draft.isDefault} onChange={() => setDefault(index)} />
              }
              label="Usar como ubicación predeterminada"
            />
            {preview ? (
              <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                Vista previa: {preview}
              </Typography>
            ) : null}
            <Button variant="outlined" size="small" onClick={() => void saveDraft(index)} disabled={busy}>
              {busy ? "Guardando..." : "Guardar ubicación"}
            </Button>
          </Box>
        );
      })}
    </Box>
  );
}
