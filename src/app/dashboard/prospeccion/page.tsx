"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Tab, Tabs } from "@mui/material";
import {
  Search,
  Send,
  Sparkles,
  PhoneCall,
  MessageCircleReply,
  Trophy,
  RotateCcw,
} from "lucide-react";
import { ProspectSearchTab } from "@/components/prospects/ProspectSearchTab";
import { ProspectOutreachPanel } from "@/components/prospects/ProspectOutreachPanel";
import { FollowupTab } from "@/components/prospects/FollowupTab";
import { NumberHealthCard } from "@/components/prospects/NumberHealthCard";
import { TemplateStatsPanel } from "@/components/prospects/TemplateStatsPanel";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { OUTBOUND_CONTEXT } from "@glamouroso/shared/constants";
import type { ProspectMetricsResponse } from "@glamouroso/shared/schemas/campaign";

type TabKey = "buscar" | "contactar" | "seguimiento";

const emptyMetrics: ProspectMetricsResponse = {
  total: 0,
  byStatus: {
    new: 0,
    contacted_whatsapp: 0,
    contacted_voice: 0,
    replied: 0,
    converted: 0,
    failed: 0,
    exhausted: 0,
  },
  contactedToday: 0,
  everContacted: 0,
  followupDue: 0,
};

function initialTab(visible: TabKey[]): TabKey {
  if (typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    if (fromUrl && visible.includes(fromUrl)) return fromUrl;
  }
  return visible[0] ?? "buscar";
}

/** Las campañas se mudaron al módulo Reactivación; avisar a quien traiga la URL vieja. */
function cameFromCampaignsUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("tab") === "campanas";
}

export default function ProspeccionPage() {
  const { can } = usePermissions();
  const [metrics, setMetrics] = useState<ProspectMetricsResponse>(emptyMetrics);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [showCampaignsMoved] = useState(() => cameFromCampaignsUrl());

  const visibleTabs = useMemo(() => {
    const tabs: TabKey[] = [];
    if (can("prospects")) tabs.push("buscar");
    if (can("outreach")) tabs.push("contactar", "seguimiento");
    return tabs;
  }, [can]);

  const [tab, setTab] = useState<TabKey>(() => initialTab(visibleTabs));

  const loadMetrics = useCallback(async () => {
    try {
      setMetrics(await httpClient.get<ProspectMetricsResponse>("/prospects/metrics"));
      setMetricsError(null);
    } catch (error) {
      // Ceros silenciosos mienten: "0 por contactar" se lee igual que "no pude
      // leer nada", y son cosas muy distintas para quien decide a quién contactar.
      setMetricsError(getApiErrorMessage(error, "No se pudo cargar el embudo"));
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

  const responsesTotal = metrics.byStatus.replied + metrics.byStatus.converted;

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Prospección</h1>
          <p className="page-kicker">
            Encuentra negocios con IA, contáctalos por WhatsApp o llamada, dales seguimiento y
            conviértelos en clientes.
          </p>
        </div>
      </div>

      {showCampaignsMoved && (
        <div className="panel p-4 flex flex-wrap items-center justify-between gap-2">
          <span className="page-kicker" style={{ margin: 0 }}>
            Las campañas ahora viven en <strong>Reactivación</strong> (clientes que llevan tiempo
            sin comprar).
          </span>
          <Link href="/dashboard/reactivacion" style={{ color: "var(--glam-blue)", fontWeight: 600 }}>
            Ir a Reactivación →
          </Link>
        </div>
      )}

      {metricsError && (
        <div
          className="panel p-4 flex flex-wrap items-center justify-between gap-2"
          style={{ borderColor: "#f5a524" }}
        >
          <span className="page-kicker" style={{ margin: 0 }}>
            <strong>Los números de abajo no son reales:</strong> {metricsError}
          </span>
          <Button size="small" variant="outlined" onClick={() => loadMetrics()}>
            Reintentar
          </Button>
        </div>
      )}

      <section className="grid grid-4" style={metricsError ? { opacity: 0.5 } : undefined}>
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
          <strong>{metrics.everContacted}</strong>
          <small>
            {metrics.contactedToday} hoy · {metrics.followupDue} esperan seguimiento
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

      {visibleTabs.includes("contactar") && <NumberHealthCard compact />}

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
              label="Envío directo"
              icon={<Send size={16} />}
              iconPosition="start"
              sx={{ minHeight: 56 }}
            />
          )}
          {visibleTabs.includes("seguimiento") && (
            <Tab
              value="seguimiento"
              label={
                <Badge
                  color="warning"
                  badgeContent={metrics.followupDue || null}
                  sx={{ "& .MuiBadge-badge": { right: -12 } }}
                >
                  Seguimiento
                </Badge>
              }
              icon={<RotateCcw size={16} />}
              iconPosition="start"
              sx={{ minHeight: 56, pr: metrics.followupDue ? 3 : undefined }}
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

      {tab === "seguimiento" && visibleTabs.includes("seguimiento") && (
        <FollowupTab onContacted={loadMetrics} />
      )}

      {tab !== "buscar" && visibleTabs.includes("contactar") && (
        <TemplateStatsPanel context={OUTBOUND_CONTEXT.PROSPECT_OUTREACH} />
      )}
    </div>
  );
}
