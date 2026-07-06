"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { ChevronDown, Megaphone, Sparkles, PhoneCall, AlertTriangle } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { ProspectOutreachPanel } from "@/components/prospects/ProspectOutreachPanel";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";
import { PROSPECT_STATUS } from "@glamouroso/shared/constants";
import type { ProspectMetricsResponse } from "@glamouroso/shared/schemas/campaign";
import { ListResponse } from "@/types";
import { toast } from "sonner";

interface Campaign {
  id: string;
  name: string;
  templateName: string;
  messagePreview?: string;
  status: string;
}

interface ProspectRow {
  id: string;
  status?: string;
}

const emptyMetrics: ProspectMetricsResponse = {
  total: 0,
  byStatus: { new: 0, contacted_whatsapp: 0, contacted_voice: 0, failed: 0 },
  contactedToday: 0,
};

export default function OutreachPage() {
  const { can } = usePermissions();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignSearch, setCampaignSearch] = useState("");
  const debouncedCampaignSearch = useDebounce(campaignSearch, 300);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<ProspectMetricsResponse>(emptyMetrics);

  const loadMetrics = useCallback(async () => {
    try {
      setMetrics(await httpClient.get<ProspectMetricsResponse>("/prospects/metrics"));
    } catch {
      // métricas secundarias
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const campaignRows = await httpClient.get<ListResponse<Campaign>>("/campaigns", {
        search: debouncedCampaignSearch,
        limit: 100,
      });
      setCampaigns(campaignRows.items);
    } catch {
      toast.error("Error al cargar las campanas");
    }
    await loadMetrics();
  }, [debouncedCampaignSearch, loadMetrics]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  function openCampaignCreate() {
    setEditingCampaign(null);
    setCampaignOpen(true);
  }

  function openCampaignEdit(campaign: Campaign) {
    setEditingCampaign(campaign);
    setCampaignOpen(true);
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name")),
      templateName: String(form.get("templateName")),
      messagePreview: String(form.get("messagePreview") || ""),
    };

    const recipientIds =
      selectedProspectIds.length > 0 ? selectedProspectIds.slice(0, 60) : undefined;

    try {
      if (editingCampaign) {
        await httpClient.put(`/campaigns/${editingCampaign.id}`, payload);
        toast.success("Campana actualizada con exito");
      } else {
        const newRows = await httpClient.get<ListResponse<ProspectRow>>("/prospects", {
          status: PROSPECT_STATUS.NEW,
          limit: 100,
        });
        const ids =
          recipientIds && recipientIds.length > 0
            ? recipientIds
            : newRows.items.slice(0, 20).map((p) => p.id);

        await httpClient.post("/campaigns", {
          ...payload,
          recipientIds: ids,
        });
        toast.success(`Campana creada con ${ids.length} prospectos nuevos`);
      }
      setCampaignOpen(false);
      await load();
    } catch {
      toast.error("Error al guardar la campana");
    }
  }

  async function sendCampaign(campaign: Campaign) {
    const toastId = toast.loading(`Enviando campana ${campaign.name}...`);
    try {
      await httpClient.post(`/campaigns/${campaign.id}/send`);
      toast.success("Campana enviada via Kapso", { id: toastId });
      await load();
    } catch {
      toast.error("Error al enviar la campana", { id: toastId });
    }
  }

  async function removeCampaign(campaign: Campaign) {
    try {
      await httpClient.delete(`/campaigns/${campaign.id}`);
      toast.success(`Campana ${campaign.name} eliminada`);
      await load();
    } catch {
      toast.error("Error al eliminar la campana");
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Outreach</h1>
          <p className="page-kicker">
            Paso 2: contacta prospectos por WhatsApp o llamada. Para envios masivos con plantilla, usa campanas Kapso.
          </p>
        </div>
      </div>

      <section className="grid grid-4">
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Nuevos disponibles</span>
            <Sparkles size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.byStatus.new}</strong>
          <small>Sin contactar todavia</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Contactados hoy</span>
            <PhoneCall size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.contactedToday}</strong>
          <small>Envios realizados hoy</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Fallidos</span>
            <AlertTriangle size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.byStatus.failed}</strong>
          <small>Para reintentar</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Campanas</span>
            <Megaphone size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{campaigns.length}</strong>
          <small>Secuencias Kapso</small>
        </div>
      </section>

      <ProspectOutreachPanel onSelectionChange={setSelectedProspectIds} onContacted={loadMetrics} />

      <Accordion
        disableGutters
        elevation={0}
        sx={{
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: "12px !important",
          "&:before": { display: "none" },
          overflow: "hidden",
        }}
      >
        <AccordionSummary expandIcon={<ChevronDown size={18} />}>
          <div className="flex items-center gap-2">
            <Megaphone size={18} style={{ color: "var(--glam-blue)" }} />
            <div>
              <h2 style={{ margin: 0 }}>Envios masivos con plantilla (Kapso)</h2>
              <p className="page-kicker" style={{ margin: 0 }}>
                {campaigns.length} campanas · {metrics.byStatus.new} prospectos nuevos disponibles
              </p>
            </div>
          </div>
        </AccordionSummary>
        <AccordionDetails>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto]" style={{ flex: 1 }}>
              <input
                className="input"
                placeholder="Buscar nombre o template"
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
              />
            </div>
            {can("outreach", "create") ? (
              <Button variant="outlined" onClick={openCampaignCreate}>
                Nueva campana
              </Button>
            ) : null}
          </div>
          <DataTable
            rows={campaigns}
            getKey={(r) => r.id}
            getDeleteLabel={(row) => row.name}
            onEdit={can("outreach", "update") ? openCampaignEdit : undefined}
            onDelete={can("outreach", "delete") ? removeCampaign : undefined}
            columns={[
              { key: "name", label: "Nombre" },
              { key: "templateName", label: "Template" },
              { key: "status", label: "Estado", render: (row) => <span className="pill">{row.status}</span> },
              {
                key: "send",
                label: "Envio",
                render: (row) =>
                  row.status === "draft" || row.status === "scheduled" ? (
                    <Button size="small" variant="outlined" onClick={() => sendCampaign(row)}>
                      Enviar
                    </Button>
                  ) : (
                    "-"
                  ),
              },
            ]}
          />
        </AccordionDetails>
      </Accordion>

      <Dialog open={campaignOpen} onClose={() => setCampaignOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={saveCampaign}>
          <DialogTitle>{editingCampaign ? "Editar campana" : "Nueva campana Kapso"}</DialogTitle>
          <DialogContent className="form-grid" dividers>
            {!editingCampaign && (
              <p className="page-kicker">
                Destinatarios:{" "}
                {selectedProspectIds.length > 0
                  ? `${selectedProspectIds.length} seleccionados en el panel`
                  : `primeros ${Math.min(metrics.byStatus.new, 20)} prospectos nuevos`}
              </p>
            )}
            <TextField name="name" label="Nombre" defaultValue={editingCampaign?.name || ""} fullWidth required />
            <TextField
              name="templateName"
              label="Template Meta aprobado"
              defaultValue={editingCampaign?.templateName || ""}
              helperText="Nombre exacto de la plantilla aprobada en Meta (Kapso)"
              fullWidth
              required
            />
            <TextField
              name="messagePreview"
              label="Preview interno"
              defaultValue={editingCampaign?.messagePreview || ""}
              fullWidth
              multiline
              minRows={3}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCampaignOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="contained">
              Guardar
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}
