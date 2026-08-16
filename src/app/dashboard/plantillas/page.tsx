"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { RefreshCw } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import type { WhatsAppTemplateDto } from "@glamouroso/shared/schemas/campaign";
import {
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_LANGUAGE_OPTIONS,
  templateStatusMeta,
} from "@/constants/whatsapp-templates";
import { toast } from "sonner";

const STATUS_FILTERS = [
  { value: "", label: "Todos los estados" },
  { value: "APPROVED", label: "Aprobadas" },
  { value: "PENDING", label: "En revision" },
  { value: "REJECTED", label: "Rechazadas" },
];

/**
 * Catalogo de plantillas de WhatsApp (Meta) via Kapso: listar, crear, editar y
 * eliminar sin salir del CRM. El catalogo no vive en nuestra BD — cada accion
 * pega contra Meta a traves del proxy de Kapso, y el estado de aprobacion es el
 * que Meta reporta en ese momento.
 */
export default function WhatsAppTemplatesPage() {
  const { can } = usePermissions();
  // El Back gatea con checkAnyPermission(["outreach", "reactivation"]).
  const canCreate = can("outreach", "create") || can("reactivation", "create");
  const canUpdate = can("outreach", "update") || can("reactivation", "update");
  const canDelete = can("outreach", "delete") || can("reactivation", "delete");

  const [templates, setTemplates] = useState<WhatsAppTemplateDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WhatsAppTemplateDto | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await httpClient.get<{ items: WhatsAppTemplateDto[] }>("/campaigns/templates");
      setTemplates(response.items);
    } catch (error) {
      setTemplates([]);
      setLoadError(getApiErrorMessage(error, "No se pudieron cargar las plantillas de Kapso"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const counts = useMemo(
    () => ({
      approved: templates.filter((t) => t.status === "APPROVED").length,
      pending: templates.filter((t) => t.status === "PENDING").length,
      rejected: templates.filter((t) => t.status === "REJECTED").length,
    }),
    [templates]
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (status && t.status !== status) return false;
      if (!term) return true;
      return t.name.toLowerCase().includes(term) || (t.bodyText || "").toLowerCase().includes(term);
    });
  }, [templates, search, status]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(template: WhatsAppTemplateDto) {
    if (template.status === "PENDING") {
      toast.info("Meta esta revisando esta plantilla: podras editarla cuando termine la revision.");
      return;
    }
    setEditing(template);
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bodyText = String(form.get("bodyText") || "").trim();
    const category = String(form.get("category") || "MARKETING");

    setSaving(true);
    try {
      if (editing) {
        await httpClient.put(`/campaigns/templates/${editing.id}`, { category, bodyText });
        toast.success(`Plantilla ${editing.name} editada y enviada a revision de Meta`);
      } else {
        const created = await httpClient.post<{ name: string; status: string }>(
          "/campaigns/templates",
          {
            name: String(form.get("name") || "").trim(),
            language: String(form.get("language") || "es_MX"),
            category,
            bodyText,
          }
        );
        toast.success(
          created.status === "APPROVED"
            ? `Plantilla ${created.name} creada`
            : `Plantilla ${created.name} enviada a revision de Meta`
        );
      }
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar la plantilla"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(template: WhatsAppTemplateDto) {
    try {
      await httpClient.delete(
        `/campaigns/templates/${template.id}?name=${encodeURIComponent(template.name)}`
      );
      toast.success(`Plantilla ${template.name} eliminada`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al eliminar la plantilla"));
    }
  }

  function insertVariable() {
    const input = bodyRef.current;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = `${input.value.slice(0, start)}{{1}}${input.value.slice(end)}`;
    input.focus();
    input.setSelectionRange(start + 5, start + 5);
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Plantillas de WhatsApp</h1>
          <p className="page-kicker">
            Catalogo de Meta conectado por Kapso. Solo las plantillas aprobadas pueden iniciar
            conversaciones en prospeccion, campanas y reactivacion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => load()}>
            Actualizar
          </Button>
          {canCreate ? (
            <Button variant="contained" onClick={openCreate}>
              Nueva plantilla
            </Button>
          ) : null}
        </div>
      </div>

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Catalogo en Meta</h2>
            <p className="page-kicker">
              El estado lo define Meta: una plantilla recien creada o editada vuelve a revision.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="pill-success">{counts.approved} aprobadas</span>
            <span className="pill warning">{counts.pending} en revision</span>
            {counts.rejected > 0 ? <span className="pill-danger">{counts.rejected} rechazadas</span> : null}
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_200px]">
          <input
            className="input"
            placeholder="Buscar por nombre o texto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <TextField
            select
            size="small"
            label="Estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_FILTERS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </div>

        {loadError ? (
          <p className="page-kicker" style={{ color: "var(--glam-danger, #b3261e)" }}>
            {loadError}
          </p>
        ) : loading ? (
          <p className="page-kicker">Cargando plantillas...</p>
        ) : rows.length === 0 ? (
          <p className="page-kicker">
            {templates.length === 0
              ? "Todavia no hay plantillas en este WhatsApp Business. Crea la primera con “Nueva plantilla”."
              : "Ninguna plantilla coincide con el filtro."}
          </p>
        ) : (
          <DataTable
            rows={rows}
            getKey={(row: WhatsAppTemplateDto) => row.id}
            getDeleteLabel={(row: WhatsAppTemplateDto) =>
              `la plantilla "${row.name}" (Meta bloquea ese nombre 30 dias despues de borrarla)`
            }
            onEdit={canUpdate ? openEdit : undefined}
            onDelete={canDelete ? remove : undefined}
            columns={[
              { key: "name", label: "Nombre" },
              {
                key: "status",
                label: "Estado",
                render: (row: WhatsAppTemplateDto) => {
                  const meta = templateStatusMeta(row.status);
                  return (
                    <span className="grid gap-1">
                      <span className={meta.className}>{meta.label}</span>
                      {row.rejectedReason ? (
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>{row.rejectedReason}</span>
                      ) : null}
                    </span>
                  );
                },
              },
              {
                key: "category",
                label: "Categoria",
                render: (row: WhatsAppTemplateDto) => (
                  <span className="pill">{TEMPLATE_CATEGORY_LABELS[row.category] || row.category}</span>
                ),
              },
              { key: "language", label: "Idioma" },
              {
                key: "bodyText",
                label: "Mensaje",
                render: (row: WhatsAppTemplateDto) => (
                  <span
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      maxWidth: 420,
                    }}
                  >
                    {row.bodyText || "—"}
                  </span>
                ),
              },
            ]}
          />
        )}
      </section>

      <Dialog open={open} onClose={() => (saving ? null : setOpen(false))} fullWidth maxWidth="sm">
        <form onSubmit={save}>
          <DialogTitle>{editing ? `Editar ${editing.name}` : "Nueva plantilla de WhatsApp"}</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <p className="page-kicker" style={{ margin: 0 }}>
              {editing
                ? "Meta no permite cambiar el nombre ni el idioma. Al guardar, la plantilla vuelve a revision y no podra usarse hasta que la aprueben."
                : "La plantilla se envia a revision de Meta (de minutos a horas). Solo las aprobadas pueden iniciar conversaciones."}
            </p>
            <TextField
              name="name"
              label="Nombre interno"
              defaultValue={editing?.name || ""}
              helperText="Solo minusculas, numeros y guiones bajos. Ej: presentacion_mayoreo"
              fullWidth
              required
              disabled={Boolean(editing)}
              inputProps={{ pattern: "[a-z0-9_]+" }}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                name="category"
                label="Categoria"
                select
                defaultValue={editing?.category === "UTILITY" ? "UTILITY" : "MARKETING"}
                fullWidth
              >
                <MenuItem value="MARKETING">Marketing (promociones, presentacion)</MenuItem>
                <MenuItem value="UTILITY">Utilidad (seguimiento, avisos)</MenuItem>
              </TextField>
              <TextField
                name="language"
                label="Idioma"
                select
                defaultValue={editing?.language || "es_MX"}
                fullWidth
                disabled={Boolean(editing)}
              >
                {TEMPLATE_LANGUAGE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </div>
            <TextField
              name="bodyText"
              inputRef={bodyRef}
              label="Mensaje"
              defaultValue={editing?.bodyText || ""}
              helperText="Usa {{1}} donde quieras el nombre del negocio. Ej: Hola {{1}}, somos Glamouroso…"
              fullWidth
              required
              multiline
              minRows={4}
              inputProps={{ minLength: 10, maxLength: 1024 }}
            />
            <div className="flex items-center gap-2">
              <Button size="small" variant="text" onClick={insertVariable}>
                + Insertar nombre del negocio
              </Button>
              <span className="page-kicker" style={{ margin: 0 }}>
                Los mensajes personalizados con el nombre reciben mas respuestas.
              </span>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? "Guardando..." : editing ? "Guardar y enviar a revision" : "Crear y enviar a revision"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}
