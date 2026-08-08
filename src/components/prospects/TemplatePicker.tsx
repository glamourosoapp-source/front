"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { Plus, RefreshCw } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import type { WhatsAppTemplateDto } from "@glamouroso/shared/schemas/campaign";
import { toast } from "sonner";

const STATUS_META: Record<string, { label: string; className: string }> = {
  APPROVED: { label: "Aprobada", className: "pill-success" },
  PENDING: { label: "En revision", className: "pill warning" },
  REJECTED: { label: "Rechazada", className: "pill-danger" },
};

interface TemplatePickerProps {
  value: string;
  onChange: (name: string) => void;
  /** Texto de ayuda extra debajo del selector. */
  helperText?: string;
  size?: "small" | "medium";
  required?: boolean;
}

/**
 * Selector de plantillas de Meta conectado a Kapso: lista las plantillas del
 * WhatsApp Business de la organizacion, muestra su estado de aprobacion y
 * permite crear una nueva (texto simple) sin salir del CRM.
 */
export function TemplatePicker({ value, onChange, helperText, size = "small", required }: TemplatePickerProps) {
  const { can } = usePermissions();
  const [templates, setTemplates] = useState<WhatsAppTemplateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await httpClient.get<{ items: WhatsAppTemplateDto[] }>("/campaigns/templates");
      setTemplates(response.items);
    } catch (error) {
      // Sin catalogo se puede seguir escribiendo el nombre a mano.
      setLoadError(getApiErrorMessage(error, "No se pudieron cargar las plantillas de Kapso"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const selected = templates.find((t) => t.name === value) || null;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || "").trim(),
      language: String(form.get("language") || "es_MX"),
      category: String(form.get("category") || "MARKETING"),
      bodyText: String(form.get("bodyText") || "").trim(),
    };

    setCreating(true);
    try {
      const created = await httpClient.post<{ id: string; status: string; name: string }>(
        "/campaigns/templates",
        payload
      );
      toast.success(
        created.status === "APPROVED"
          ? `Plantilla ${created.name} creada`
          : `Plantilla ${created.name} enviada a revision de Meta. Podras usarla cuando este aprobada.`
      );
      setCreateOpen(false);
      onChange(created.name);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al crear la plantilla"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="grid gap-1">
      <div className="flex items-start gap-2">
        <Autocomplete
          fullWidth
          size={size}
          options={templates}
          loading={loading}
          value={selected}
          freeSolo
          inputValue={value}
          onInputChange={(_e, next) => onChange(next)}
          onChange={(_e, next) => {
            if (typeof next === "string") onChange(next);
            else if (next) onChange(next.name);
          }}
          getOptionLabel={(option) => (typeof option === "string" ? option : option.name)}
          renderOption={(props, option) => {
            const meta = STATUS_META[option.status] || { label: option.status, className: "pill" };
            return (
              <li {...props} key={option.id}>
                <div className="grid gap-1" style={{ width: "100%", padding: "2px 0" }}>
                  <span className="flex items-center justify-between gap-2">
                    <span style={{ fontWeight: 600 }}>{option.name}</span>
                    <span className={meta.className}>{meta.label}</span>
                  </span>
                  {option.bodyText && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {option.bodyText}
                    </span>
                  )}
                </div>
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Plantilla de WhatsApp"
              required={required}
              placeholder="Elige o escribe el nombre"
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading ? <CircularProgress size={16} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
        <Button
          variant="text"
          size="small"
          onClick={() => load()}
          title="Actualizar lista"
          sx={{ minWidth: 40, mt: 0.5 }}
        >
          <RefreshCw size={16} />
        </Button>
        {can("outreach", "create") && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
            sx={{ whiteSpace: "nowrap", mt: 0.5 }}
          >
            Nueva
          </Button>
        )}
      </div>

      {selected && selected.status !== "APPROVED" && (
        <span className="page-kicker" style={{ margin: 0, color: "var(--glam-navy)" }}>
          Esta plantilla aun no esta aprobada por Meta; el envio fallara hasta que lo este.
        </span>
      )}
      {loadError ? (
        <span className="page-kicker" style={{ margin: 0 }}>
          {loadError.replace(/\.$/, "")}. Puedes escribir el nombre exacto manualmente.
        </span>
      ) : helperText ? (
        <span className="page-kicker" style={{ margin: 0 }}>
          {helperText}
        </span>
      ) : null}

      <Dialog open={createOpen} onClose={() => (creating ? null : setCreateOpen(false))} fullWidth maxWidth="sm">
        <form onSubmit={handleCreate}>
          <DialogTitle>Nueva plantilla de WhatsApp</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <p className="page-kicker" style={{ margin: 0 }}>
              La plantilla se envia a revision de Meta (suele tardar de minutos a horas). Solo las
              plantillas aprobadas pueden usarse para iniciar conversaciones.
            </p>
            <TextField
              name="name"
              label="Nombre interno"
              helperText="Solo minusculas, numeros y guiones bajos. Ej: presentacion_mayoreo"
              fullWidth
              required
              inputProps={{ pattern: "[a-z0-9_]+" }}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField name="category" label="Categoria" select defaultValue="MARKETING" fullWidth>
                <MenuItem value="MARKETING">Marketing (promociones, presentacion)</MenuItem>
                <MenuItem value="UTILITY">Utilidad (seguimiento, avisos)</MenuItem>
              </TextField>
              <TextField name="language" label="Idioma" select defaultValue="es_MX" fullWidth>
                <MenuItem value="es_MX">Espanol (Mexico)</MenuItem>
                <MenuItem value="es">Espanol</MenuItem>
                <MenuItem value="en_US">Ingles (EE. UU.)</MenuItem>
              </TextField>
            </div>
            <TextField
              name="bodyText"
              inputRef={bodyRef}
              label="Mensaje"
              helperText="Usa {{1}} donde quieras el nombre del negocio. Ej: Hola {{1}}, somos Glamouroso…"
              fullWidth
              required
              multiline
              minRows={4}
              inputProps={{ minLength: 10, maxLength: 1024 }}
            />
            <div className="flex items-center gap-2">
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  const input = bodyRef.current;
                  if (!input) return;
                  const start = input.selectionStart ?? input.value.length;
                  const end = input.selectionEnd ?? input.value.length;
                  input.value = `${input.value.slice(0, start)}{{1}}${input.value.slice(end)}`;
                  input.focus();
                  input.setSelectionRange(start + 5, start + 5);
                }}
              >
                + Insertar nombre del negocio
              </Button>
              <span className="page-kicker" style={{ margin: 0 }}>
                Los mensajes personalizados con el nombre reciben más respuestas.
              </span>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={creating}>
              {creating ? "Enviando..." : "Crear y enviar a revision"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}
