"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tab, Tabs } from "@mui/material";
import { Search, Send, Megaphone, Sparkles, PhoneCall, MessageCircleReply, Trophy } from "lucide-react";
import { ProspectSearchTab } from "@/components/prospects/ProspectSearchTab";
import { ProspectOutreachPanel } from "@/components/prospects/ProspectOutreachPanel";
import { CampaignsTab } from "@/components/prospects/CampaignsTab";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import type { ProspectMetricsResponse } from "@glamouroso/shared/schemas/campaign";

type TabKey = "buscar" | "contactar" | "campanas";

const emptyMetrics: ProspectMetricsResponse = {
  total: 0,
  byStatus: { new: 0, contacted_whatsapp: 0, contacted_voice: 0, replied: 0, converted: 0, failed: 0 },
  contactedToday: 0,
};

function initialTab(visible: TabKey[]): TabKey {
  if (typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    if (fromUrl && visible.includes(fromUrl)) return fromUrl;
  }
  return visible[0] ?? "buscar";
}

export default function ProspeccionPage() {
  const { can } = usePermissions();
  const [metrics, setMetrics] = useState<ProspectMetricsResponse>(emptyMetrics);

  const visibleTabs = useMemo(() => {
    const tabs: TabKey[] = [];
    if (can("prospects")) tabs.push("buscar");
    if (can("outreach")) tabs.push("contactar", "campanas");
    return tabs;
  }, [can]);

  const [tab, setTab] = useState<TabKey>(() => initialTab(visibleTabs));

  const loadMetrics = useCallback(async () => {
    try {
      setMetrics(await httpClient.get<ProspectMetricsResponse>("/prospects/metrics"));
    } catch {
      // el embudo es informativo: si falla se queda en cero
    }
  }, []);

  useEffect(() => {
    loadMetrics().catch(() => undefined);
  }, [loadMetrics]);

  function changeTab(next: TabKey) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
    // Al volver a un tab con datos, refresca el embudo.
    loadMetrics().catch(() => undefined);
  }

  const contactedTotal = metrics.byStatus.contacted_whatsapp + metrics.byStatus.contacted_voice;
  const responsesTotal = metrics.byStatus.replied + metrics.byStatus.converted;

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Prospeccion</h1>
          <p className="page-kicker">
            Encuentra negocios con IA, contactalos por WhatsApp o llamada, y conviertelos en
            clientes.
          </p>
        </div>
      </div>

      <section className="grid grid-4">
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>1 · Por contactar</span>
            <Sparkles size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.byStatus.new}</strong>
          <small>De {metrics.total} negocios en tu base</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>2 · Contactados</span>
            <PhoneCall size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{contactedTotal}</strong>
          <small>
            {metrics.contactedToday} hoy · {metrics.byStatus.failed} fallidos
          </small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>3 · Respondieron</span>
            <MessageCircleReply size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{responsesTotal}</strong>
          <small>El agente IA los atiende al responder</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>4 · Ya son clientes</span>
            <Trophy size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.byStatus.converted}</strong>
          <small>Hicieron su primer pedido</small>
        </div>
      </section>

      <section className="panel" style={{ padding: "0 16px" }}>
        <Tabs
          value={tab}
          onChange={(_e, next: TabKey) => changeTab(next)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {visibleTabs.includes("buscar") && (
            <Tab
              value="buscar"
              label="Buscar negocios"
              icon={<Search size={16} />}
              iconPosition="start"
              sx={{ minHeight: 56 }}
            />
          )}
          {visibleTabs.includes("contactar") && (
            <Tab
              value="contactar"
              label="Envio directo"
              icon={<Send size={16} />}
              iconPosition="start"
              sx={{ minHeight: 56 }}
            />
          )}
          {visibleTabs.includes("campanas") && (
            <Tab
              value="campanas"
              label="Campanas"
              icon={<Megaphone size={16} />}
              iconPosition="start"
              sx={{ minHeight: 56 }}
            />
          )}
        </Tabs>
      </section>

      {tab === "buscar" && visibleTabs.includes("buscar") && (
        <ProspectSearchTab
          newCount={metrics.byStatus.new}
          notContactedCount={metrics.byStatus.new + metrics.byStatus.failed}
          onDataChanged={loadMetrics}
          onGoToContact={visibleTabs.includes("contactar") ? () => changeTab("contactar") : undefined}
        />
      )}

      {tab === "contactar" && visibleTabs.includes("contactar") && (
        <ProspectOutreachPanel onContacted={loadMetrics} />
      )}

      {tab === "campanas" && visibleTabs.includes("campanas") && (
        <CampaignsTab onDataChanged={loadMetrics} />
      )}
    </div>
  );
}
