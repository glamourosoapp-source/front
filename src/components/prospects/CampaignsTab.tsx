"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  CAMPAIGN_AUDIENCE,
  CAMPAIGN_STATUS,
  PROSPECT_STATUS,
  type CampaignAudience,
} from "@glamouroso/shared/constants";
import type { PermissionModule } from "@glamouroso/shared";
import type {
  CampaignMetricsResponse,
  ReactivationSegmentResponse,
} from "@glamouroso/shared/schemas/campaign";
import { ListResponse } from "@/types";
import { toast } from "sonner";

const MAX_RECIPIENTS = 60;
/** Tope de campañas a las que se les piden métricas al listar (evita ráfagas). */
const METRICS_FETCH_LIMIT = 15;

interface Campaign {
  id: string;
  name: string;
  templateName: string;
  messagePreview?: string;
  audience?: string;
  status: string;
  scheduledAt?: string | null;
  sentAt?: string | null;
}

interface RecipientOption {
  id: string;
  name: string;
  phone?: string | null;
  /** Prospectos: ciudad. Clientes inactivos: días sin comprar. */
  city?: string | null;
  daysInactive?: number | null;
  totalOrders?: number;
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
  /** prospects = prospección fría; customers = reactivación de clientes. */
  audience?: CampaignAudience;
  /** Módulo de permisos que gatea los botones (outreach o reactivation). */
  permissionModule?: PermissionModule;
  /** Días sin comprar del segmento de reactivación (solo audience=customers). */
  inactiveDays?: number;
  /** Ids preseleccionados al abrir "Nueva campaña" (viene del tab de inactivos). */
  preselectedRecipientIds?: string[];
  /** Abrir el diálogo de creación al montar (tras "Crear campaña con seleccionados"). */
  autoOpenCreate?: boolean;
  /** Avisa que el auto-open ya se consumió, para que el padre no lo repita al remontar. */
  onAutoOpenHandled?: () => void;
}

/**
 * Campañas de WhatsApp con plantilla aprobada de Meta. Sirve a dos audiencias:
 * prospección fría (audience=prospects) y reactivación de clientes inactivos
 * (audience=customers). El envío siempre sale por el guardián: respeta la lista
 * de exclusión, el cupo diario y el warm-up del número.
 */
export function CampaignsTab({
  onDataChanged,
  audience = CAMPAIGN_AUDIENCE.PROSPECTS,
  permissionModule = "outreach",
  inactiveDays = 15,
  preselectedRecipientIds,
  autoOpenCreate = false,
  onAutoOpenHandled,
}: CampaignsTabProps) {
  const { can } = usePermissions();
  const isReactivation = audience === CAMPAIGN_AUDIENCE.CUSTOMERS;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [metricsById, setMetricsById] = useState<Record<string, CampaignMetricsResponse>>({});
  const [campaignSearch, setCampaignSearch] = useState("");
  const debouncedCampaignSearch = useDebounce(campaignSearch, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateValid, setTemplateValid] = useState(true);
  const [saving, setSaving] = useState(false);

  // Selector de destinatarios dentro del dialog (solo al crear).
  const [options, setOptions] = useState<RecipientOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recipientSearch, setRecipientSearch] = useState("");
  const debouncedRecipientSearch = useDebounce(recipientSearch, 250);

  // Solo la carga más reciente escribe estado: una respuesta vieja (la fase de
  // métricas puede tardar) no debe pisar los resultados de una búsqueda nueva.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const rows = await httpClient.get<ListResponse<Campaign>>("/campaigns", {
        search: debouncedCampaignSearch,
        audience,
        limit: 100,
      });
      if (seq !== loadSeq.current) return;
      setCampaigns(rows.items);

      // Métricas solo de las que ya salieron: son las que tienen resultados.
      const withResults = rows.items
        .filter((c) => c.status === CAMPAIGN_STATUS.SENT || c.status === CAMPAIGN_STATUS.SENDING)
        .slice(0, METRICS_FETCH_LIMIT);
      const entries = await Promise.all(
        withResults.map(async (campaign) => {
          try {
            const metrics = await httpClient.get<CampaignMetricsResponse>(
              `/campaigns/${campaign.id}/metrics`
            );
            return [campaign.id, metrics] as const;
          } catch {
            return null;
          }
        })
      );
      if (seq !== loadSeq.current) return;
      setMetricsById(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, CampaignMetricsResponse]>));
    } catch (error) {
      if (seq !== loadSeq.current) return;
      toast.error(getApiErrorMessage(error, "Error al cargar las campañas"));
    }
  }, [debouncedCampaignSearch, audience]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      if (isReactivation) {
        const response = await httpClient.get<ReactivationSegmentResponse>(
          "/campaigns/reactivation-segment",
          { days: inactiveDays, search: debouncedRecipientSearch, limit: 100 }
        );
        setOptions(
          response.items.map((row) => ({
            id: row.id,
            name: row.name,
            phone: row.phone,
            daysInactive: row.daysInactive,
            totalOrders: row.totalOrders,
          }))
        );
      } else {
        const response = await httpClient.get<ListResponse<RecipientOption>>("/prospects", {
          status: PROSPECT_STATUS.NEW,
          search: debouncedRecipientSearch,
          limit: 100,
        });
        setOptions(response.items);
      }
    } catch {
      toast.error(
        isReactivation ? "Error al cargar clientes inactivos" : "Error al cargar prospectos nuevos"
      );
    } finally {
      setOptionsLoading(false);
    }
  }, [debouncedRecipientSearch, isReactivation, inactiveDays]);

  useEffect(() => {
    if (dialogOpen && !editingCampaign) {
      loadOptions().catch(() => undefined);
    }
  }, [dialogOpen, editingCampaign, loadOptions]);

  const openCreate = useCallback((withIds?: string[]) => {
    setEditingCampaign(null);
    setSelectedIds(new Set((withIds ?? []).slice(0, MAX_RECIPIENTS)));
    setRecipientSearch("");
    setTemplateName("");
    setDialogOpen(true);
  }, []);

  // Llegada desde "Crear campaña con seleccionados" en el tab de inactivos.
  useEffect(() => {
    if (autoOpenCreate && preselectedRecipientIds?.length) {
      openCreate(preselectedRecipientIds);
      // Consumido: el padre limpia la señal para no reabrir al volver al tab.
      onAutoOpenHandled?.();
    }
    // Solo al montar con la señal: no reabrir si el usuario cierra el diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        toast.error(`Máximo ${MAX_RECIPIENTS} destinatarios por campaña`);
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
    if (!templateValid) {
      toast.error("Esa plantilla no existe en Meta: elige una del catálogo o créala con “Nueva”");
      return;
    }
    const payload = {
      name: String(form.get("name")),
      templateName: templateName.trim(),
      messagePreview: String(form.get("messagePreview") || ""),
      scheduledAt,
    };

    setSaving(true);
    try {
      if (editingCampaign) {
        await httpClient.put(`/campaigns/${editingCampaign.id}`, payload);
        toast.success("Campaña actualizada con éxito");
      } else {
        if (selectedIds.size === 0) {
          toast.error("Selecciona al menos un destinatario");
          return;
        }
        await httpClient.post("/campaigns", {
          ...payload,
          audience,
          recipientIds: Array.from(selectedIds),
        });
        toast.success(
          scheduledAt
            ? `Campaña programada con ${selectedIds.size} destinatarios`
            : `Campaña creada con ${selectedIds.size} destinatarios`
        );
      }
      setDialogOpen(false);
      await load();
      onDataChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar la campaña"));
    } finally {
      setSaving(false);
    }
  }

  async function sendCampaign(campaign: Campaign) {
    const toastId = toast.loading(`Enviando campaña ${campaign.name}...`);
    try {
      const result = await httpClient.post<Campaign>(`/campaigns/${campaign.id}/send`);
      toast.success(
        result.status === CAMPAIGN_STATUS.SENDING
          ? "Envío encolado: sale espaciado respetando el cupo diario del número"
          : "Campaña enviada",
        { id: toastId }
      );
      await load();
      onDataChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al enviar la campaña"), { id: toastId });
    }
  }

  async function setCampaignStatus(campaign: Campaign, status: string, label: string) {
    try {
      await httpClient.put(`/campaigns/${campaign.id}`, { status });
      toast.success(`Campaña ${label}`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al actualizar la campaña"));
    }
  }

  async function removeCampaign(campaign: Campaign) {
    try {
      await httpClient.delete(`/campaigns/${campaign.id}`);
      toast.success(`Campaña ${campaign.name} eliminada`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al eliminar la campaña"));
    }
  }

  return (
    <section className="panel p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2>{isReactivation ? "Campañas de reactivación" : "Campañas de WhatsApp"}</h2>
          <p className="page-kicker">
            {isReactivation
              ? "Envíos a clientes que ya te compraron y llevan tiempo sin pedir. Programa la fecha o envía al momento."
              : "Envíos masivos con una plantilla aprobada de Meta. Prográmalas con fecha y hora o envíalas al momento."}
          </p>
        </div>
        {can(permissionModule, "create") ? (
          <Button variant="contained" onClick={() => openCreate()}>
            Nueva campaña
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
        onEdit={can(permissionModule, "update") ? openEdit : undefined}
        onDelete={can(permissionModule, "delete") ? removeCampaign : undefined}
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
            key: "metrics",
            label: "Resultados",
            render: (row) => {
              const m = metricsById[row.id];
              if (!m) return "-";
              return (
                <span className="flex flex-col gap-1" style={{ fontSize: 12 }}>
                  <span>
                    {m.sent}/{m.recipients} enviados
                    {m.failed > 0 ? ` · ${m.failed} fallidos` : ""}
                    {m.pending > 0 ? ` · ${m.pending} en cola` : ""}
                  </span>
                  <span style={{ color: "var(--muted)" }}>
                    {m.replied} respondieron
                    {isReactivation
                      ? ` · ${m.ordersAttributed} pedidos · $${Number(m.revenueAttributed).toFixed(2)}`
                      : ""}
                  </span>
                </span>
              );
            },
          },
          {
            key: "send",
            label: "Envío",
            render: (row) => {
              if (!can(permissionModule, "create")) return "-";
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
          <DialogTitle>{editingCampaign ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <TextField name="name" label="Nombre" defaultValue={editingCampaign?.name || ""} fullWidth required />
            <TemplatePicker
              value={templateName}
              onChange={setTemplateName}
              onValidityChange={setTemplateValid}
              helperText={
                isReactivation
                  ? "Plantilla aprobada por Meta. Usa {{1}} para el nombre del cliente."
                  : "WhatsApp solo permite iniciar conversación con una plantilla aprobada por Meta."
              }
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
              label="Programar envío (opcional)"
              type="datetime-local"
              defaultValue={isoToLocalInput(editingCampaign?.scheduledAt)}
              helperText="Déjala vacía para enviarla manualmente con 'Enviar ahora'."
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
                  placeholder={
                    isReactivation ? "Buscar entre clientes inactivos" : "Buscar entre prospectos nuevos"
                  }
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
                      {isReactivation ? "Cargando clientes inactivos..." : "Cargando prospectos nuevos..."}
                    </p>
                  ) : options.length === 0 ? (
                    <p className="page-kicker" style={{ padding: 12 }}>
                      {isReactivation
                        ? `Ningún cliente lleva ${inactiveDays}+ días sin comprar.`
                        : "No hay prospectos nuevos. Importa negocios en la pestaña Buscar negocios."}
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
                            {isReactivation
                              ? o.daysInactive != null
                                ? ` · ${o.daysInactive} días sin comprar`
                                : ""
                              : o.city
                                ? ` · ${o.city}`
                                : ""}
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
            <Button onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {editingCampaign ? "Guardar" : "Crear campaña"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </section>
  );
}
