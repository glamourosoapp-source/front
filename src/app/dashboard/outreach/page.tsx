"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { DataTable } from "@/components/ui/DataTable";
import { ProspectOutreachPanel } from "@/components/prospects/ProspectOutreachPanel";
import { httpClient } from "@/services/http-client";
import { PROSPECT_STATUS } from "@glamouroso/shared/constants";
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

export default function OutreachPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [newProspectCount, setNewProspectCount] = useState(0);

  const load = async () => {
    const [campaignRows, prospectRows] = await Promise.all([
      httpClient.get<ListResponse<Campaign>>("/campaigns", { search: campaignSearch, limit: 100 }),
      httpClient.get<ListResponse<ProspectRow>>("/prospects", {
        status: PROSPECT_STATUS.NEW,
        limit: 100,
      }),
    ]);
    setCampaigns(campaignRows.items);
    setNewProspectCount(prospectRows.items.length);
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

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
      selectedProspectIds.length > 0
        ? selectedProspectIds.slice(0, 60)
        : undefined;

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
            Paso 2: contacta prospectos por WhatsApp o llamada. Campanas Kapso para envios masivos con plantilla.
          </p>
        </div>
        <Button variant="outlined" onClick={openCampaignCreate}>
          Nueva campana Kapso
        </Button>
      </div>

      <ProspectOutreachPanel onSelectionChange={setSelectedProspectIds} />

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Campanas Kapso</h2>
            <p className="page-kicker">
              Secuencias con plantilla Meta. {newProspectCount} prospectos nuevos disponibles.
            </p>
          </div>
          <span className="pill warning">{campaigns.length} campanas</span>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto]">
          <input
            className="input"
            placeholder="Buscar nombre o template"
            value={campaignSearch}
            onChange={(e) => setCampaignSearch(e.target.value)}
          />
          <Button variant="outlined" onClick={load}>
            Filtrar
          </Button>
        </div>
        <DataTable
          rows={campaigns}
          getKey={(r) => r.id}
          getDeleteLabel={(row) => row.name}
          onEdit={openCampaignEdit}
          onDelete={removeCampaign}
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
      </section>

      <Dialog open={campaignOpen} onClose={() => setCampaignOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={saveCampaign}>
          <DialogTitle>{editingCampaign ? "Editar campana" : "Nueva campana Kapso"}</DialogTitle>
          <DialogContent className="form-grid" dividers>
            {!editingCampaign && (
              <p className="page-kicker">
                Destinatarios:{" "}
                {selectedProspectIds.length > 0
                  ? `${selectedProspectIds.length} seleccionados arriba`
                  : `primeros ${Math.min(newProspectCount, 20)} prospectos nuevos`}
              </p>
            )}
            <TextField name="name" label="Nombre" defaultValue={editingCampaign?.name || ""} fullWidth required />
            <TextField
              name="templateName"
              label="Template Meta aprobado"
              defaultValue={editingCampaign?.templateName || ""}
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
