"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { DataTable } from "@/components/ui/DataTable";
import { TemplatePicker } from "@/components/prospects/TemplatePicker";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMxPhone } from "@/utils/format-phone";
import { CAMPAIGN_STATUS, PROSPECT_STATUS } from "@glamouroso/shared/constants";
import { ListResponse } from "@/types";
import { toast } from "sonner";

const MAX_RECIPIENTS = 60;

interface Campaign {
  id: string;
  name: string;
  templateName: string;
  messagePreview?: string;
  status: string;
  scheduledAt?: string | null;
  sentAt?: string | null;
}

interface ProspectOption {
  id: string;
  name: string;
  phone?: string | null;
  city?: string | null;
}

const CAMPAIGN_STATUS_META: Record<string, { label: string; className: string }> = {
  [CAMPAIGN_STATUS.DRAFT]: { label: "Borrador", className: "pill" },
  [CAMPAIGN_STATUS.SCHEDULED]: { label: "Programada", className: "pill warning" },
  [CAMPAIGN_STATUS.SENDING]: { label: "Enviando", className: "pill warning" },
  [CAMPAIGN_STATUS.SENT]: { label: "Enviada", className: "pill-success" },
  [CAMPAIGN_STATUS.PAUSED]: { label: "Pausada", className: "pill-muted" },
  [CAMPAIGN_STATUS.CANCELLED]: { label: "Cancelada", className: "pill-danger" },
};

/** Convierte el valor de un <input type="datetime-local"> a ISO. */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoToLocalInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface CampaignsTabProps {
  onDataChanged?: () => void;
}

export function CampaignsTab({ onDataChanged }: CampaignsTabProps) {
  const { can } = usePermissions();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignSearch, setCampaignSearch] = useState("");
  const debouncedCampaignSearch = useDebounce(campaignSearch, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [templateName, setTemplateName] = useState("");

  // Selector de destinatarios dentro del dialog (solo al crear).
  const [options, setOptions] = useState<ProspectOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recipientSearch, setRecipientSearch] = useState("");
  const debouncedRecipientSearch = useDebounce(recipientSearch, 250);

  const load = useCallback(async () => {
    try {
      const rows = await httpClient.get<ListResponse<Campaign>>("/campaigns", {
        search: debouncedCampaignSearch,
        limit: 100,
      });
      setCampaigns(rows.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar las campanas"));
    }
  }, [debouncedCampaignSearch]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const response = await httpClient.get<ListResponse<ProspectOption>>("/prospects", {
        status: PROSPECT_STATUS.NEW,
        search: debouncedRecipientSearch,
        limit: 100,
      });
      setOptions(response.items);
    } catch {
      toast.error("Error al cargar prospectos nuevos");
    } finally {
      setOptionsLoading(false);
    }
  }, [debouncedRecipientSearch]);

  useEffect(() => {
    if (dialogOpen && !editingCampaign) {
      loadOptions().catch(() => undefined);
    }
  }, [dialogOpen, editingCampaign, loadOptions]);

  function openCreate() {
    setEditingCampaign(null);
    setSelectedIds(new Set());
    setRecipientSearch("");
    setTemplateName("");
    setDialogOpen(true);
  }

  function openEdit(campaign: Campaign) {
    setEditingCampaign(campaign);
    setTemplateName(campaign.templateName);
    setDialogOpen(true);
  }

  const allVisibleSelected = useMemo(
    () => options.length > 0 && options.every((o) => selectedIds.has(o.id)),
    [options, selectedIds]
  );

  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        options.forEach((o) => next.delete(o.id));
      } else {
        for (const o of options) {
          if (next.size >= MAX_RECIPIENTS) break;
          next.add(o.id);
        }
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_RECIPIENTS) {
        next.add(id);
      } else {
        toast.error(`Maximo ${MAX_RECIPIENTS} destinatarios por campana`);
      }
      return next;
    });
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const scheduledAt = localInputToIso(String(form.get("scheduledAt") || ""));
    if (!templateName.trim()) {
      toast.error("Elige o escribe una plantilla de WhatsApp");
      return;
    }
    const payload = {
      name: String(form.get("name")),
      templateName: templateName.trim(),
      messagePreview: String(form.get("messagePreview") || ""),
      scheduledAt,
    };

    try {
      if (editingCampaign) {
        await httpClient.put(`/campaigns/${editingCampaign.id}`, payload);
        toast.success("Campana actualizada con exito");
      } else {
        if (selectedIds.size === 0) {
          toast.error("Selecciona al menos un destinatario");
          return;
        }
        await httpClient.post("/campaigns", {
          ...payload,
          recipientIds: Array.from(selectedIds),
        });
        toast.success(
          scheduledAt
            ? `Campana programada con ${selectedIds.size} destinatarios`
            : `Campana creada con ${selectedIds.size} destinatarios`
        );
      }
      setDialogOpen(false);
      await load();
      onDataChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar la campana"));
    }
  }

  async function sendCampaign(campaign: Campaign) {
    const toastId = toast.loading(`Enviando campana ${campaign.name}...`);
    try {
      const result = await httpClient.post<Campaign>(`/campaigns/${campaign.id}/send`);
      toast.success(
        result.status === CAMPAIGN_STATUS.SENDING
          ? "Envio iniciado; sigue en segundo plano"
          : "Campana enviada",
        { id: toastId }
      );
      await load();
      onDataChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al enviar la campana"), { id: toastId });
    }
  }

  async function setCampaignStatus(campaign: Campaign, status: string, label: string) {
    try {
      await httpClient.put(`/campaigns/${campaign.id}`, { status });
      toast.success(`Campana ${label}`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al actualizar la campana"));
    }
  }

  async function removeCampaign(campaign: Campaign) {
    try {
      await httpClient.delete(`/campaigns/${campaign.id}`);
      toast.success(`Campana ${campaign.name} eliminada`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al eliminar la campana"));
    }
  }

  return (
    <section className="panel p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2>Campanas de WhatsApp</h2>
          <p className="page-kicker">
            Envios masivos con una plantilla aprobada de Meta. Programalas con fecha y hora o
            envialas al momento.
          </p>
        </div>
        {can("outreach", "create") ? (
          <Button variant="contained" onClick={openCreate}>
            Nueva campana
          </Button>
        ) : null}
      </div>

      <div className="mb-4">
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="Buscar por nombre o plantilla"
          value={campaignSearch}
          onChange={(e) => setCampaignSearch(e.target.value)}
        />
      </div>

      <DataTable
        rows={campaigns}
        getKey={(r) => r.id}
        getDeleteLabel={(row) => row.name}
        onEdit={can("outreach", "update") ? openEdit : undefined}
        onDelete={can("outreach", "delete") ? removeCampaign : undefined}
        columns={[
          { key: "name", label: "Nombre" },
          { key: "templateName", label: "Plantilla" },
          {
            key: "status",
            label: "Estado",
            render: (row) => {
              const meta = CAMPAIGN_STATUS_META[row.status] || { label: row.status, className: "pill" };
              return (
                <span className="flex flex-col gap-1">
                  <span className={meta.className}>{meta.label}</span>
                  {row.status === CAMPAIGN_STATUS.SCHEDULED && row.scheduledAt && (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {new Date(row.scheduledAt).toLocaleString("es-MX", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </span>
              );
            },
          },
          {
            key: "send",
            label: "Envio",
            render: (row) => {
              if (!can("outreach", "create")) return "-";
              const actions: ReactNode[] = [];
              if (
                row.status === CAMPAIGN_STATUS.DRAFT ||
                row.status === CAMPAIGN_STATUS.SCHEDULED ||
                row.status === CAMPAIGN_STATUS.PAUSED
              ) {
                actions.push(
                  <Button key="send" size="small" variant="outlined" onClick={() => sendCampaign(row)}>
                    {row.status === CAMPAIGN_STATUS.PAUSED ? "Reanudar" : "Enviar ahora"}
                  </Button>
                );
              }
              if (row.status === CAMPAIGN_STATUS.SCHEDULED || row.status === CAMPAIGN_STATUS.SENDING) {
                actions.push(
                  <Button
                    key="pause"
                    size="small"
                    variant="text"
                    onClick={() => setCampaignStatus(row, CAMPAIGN_STATUS.PAUSED, "pausada")}
                  >
                    Pausar
                  </Button>
                );
              }
              if (
                row.status === CAMPAIGN_STATUS.SCHEDULED ||
                row.status === CAMPAIGN_STATUS.PAUSED ||
                row.status === CAMPAIGN_STATUS.SENDING
              ) {
                actions.push(
                  <Button
                    key="cancel"
                    size="small"
                    color="error"
                    variant="text"
                    onClick={() => setCampaignStatus(row, CAMPAIGN_STATUS.CANCELLED, "cancelada")}
                  >
                    Cancelar
                  </Button>
                );
              }
              return actions.length > 0 ? (
                <span className="flex flex-wrap items-center gap-1">{actions}</span>
              ) : (
                "-"
              );
            },
          },
        ]}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={saveCampaign}>
          <DialogTitle>{editingCampaign ? "Editar campana" : "Nueva campana"}</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <TextField name="name" label="Nombre" defaultValue={editingCampaign?.name || ""} fullWidth required />
            <TemplatePicker
              value={templateName}
              onChange={setTemplateName}
              helperText="WhatsApp solo permite iniciar conversacion con una plantilla aprobada por Meta."
              size="medium"
              required
            />
            <TextField
              name="messagePreview"
              label="Nota interna (opcional)"
              defaultValue={editingCampaign?.messagePreview || ""}
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              name="scheduledAt"
              label="Programar envio (opcional)"
              type="datetime-local"
              defaultValue={isoToLocalInput(editingCampaign?.scheduledAt)}
              helperText="Dejala vacia para enviarla manualmente con 'Enviar ahora'."
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            {!editingCampaign && (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="form-section-title" style={{ margin: 0 }}>
                    Destinatarios
                  </span>
                  <span className="pill">{selectedIds.size} seleccionados</span>
                </div>
                <input
                  className="input"
                  placeholder="Buscar entre prospectos nuevos"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                />
                <div
                  style={{
                    maxHeight: 220,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                >
                  {optionsLoading ? (
                    <p className="page-kicker" style={{ padding: 12 }}>
                      Cargando prospectos nuevos...
                    </p>
                  ) : options.length === 0 ? (
                    <p className="page-kicker" style={{ padding: 12 }}>
                      No hay prospectos nuevos. Importa negocios en la pestana Buscar negocios.
                    </p>
                  ) : (
                    <>
                      <label
                        className="flex items-center gap-2"
                        style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                      >
                        <Checkbox
                          size="small"
                          checked={allVisibleSelected}
                          indeterminate={options.some((o) => selectedIds.has(o.id)) && !allVisibleSelected}
                          onChange={toggleAll}
                        />
                        <span style={{ fontWeight: 600 }}>
                          Todos los visibles ({Math.min(options.length, MAX_RECIPIENTS)})
                        </span>
                      </label>
                      {options.map((o) => (
                        <label
                          key={o.id}
                          className="flex items-center gap-2"
                          style={{ padding: "4px 10px", cursor: "pointer" }}
                        >
                          <Checkbox size="small" checked={selectedIds.has(o.id)} onChange={() => toggleOne(o.id)} />
                          <span style={{ flex: 1 }}>{o.name}</span>
                          <span style={{ color: "var(--muted)", fontSize: 13 }}>
                            {formatMxPhone(o.phone)}
                            {o.city ? ` · ${o.city}` : ""}
                          </span>
                        </label>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="contained">
              {editingCampaign ? "Guardar" : "Crear campana"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </section>
  );
}
