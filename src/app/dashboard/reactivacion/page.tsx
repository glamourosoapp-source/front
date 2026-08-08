"use client";

import { useCallback, useEffect, useState } from "react";
import { Tab, Tabs } from "@mui/material";
import { Megaphone, MessageCircleReply, RotateCcw, Send, Trophy } from "lucide-react";
import { InactiveCustomersTab } from "@/components/reactivation/InactiveCustomersTab";
import { CampaignsTab } from "@/components/prospects/CampaignsTab";
import { NumberHealthCard } from "@/components/prospects/NumberHealthCard";
import { TemplateStatsPanel } from "@/components/prospects/TemplateStatsPanel";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { CAMPAIGN_AUDIENCE, OUTBOUND_CONTEXT } from "@glamouroso/shared/constants";
import type { ReactivationMetricsResponse } from "@glamouroso/shared/schemas/campaign";

type TabKey = "inactivos" | "campanas";

const emptyMetrics: ReactivationMetricsResponse = {
  inactive: 0,
  contacted: 0,
  replied: 0,
  repurchased: 0,
  revenueRecovered: 0,
  days: 15,
};

/**
 * Reactivación: traer de vuelta a clientes que ya compraron y dejaron de
 * pedir. Comparte el número de WhatsApp (y su cupo diario) con Prospección,
 * así que la tarjeta de salud vive también aquí.
 */
export default function ReactivacionPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<TabKey>("inactivos");
  const [days, setDays] = useState(15);
  const [metrics, setMetrics] = useState<ReactivationMetricsResponse>(emptyMetrics);
  const [preselectedIds, setPreselectedIds] = useState<string[]>([]);
  const [autoOpenCreate, setAutoOpenCreate] = useState(false);
  /** Fuerza remount del tab de campañas al llegar con preselección. */
  const [campaignsKey, setCampaignsKey] = useState(0);

  const loadMetrics = useCallback(async (forDays: number) => {
    try {
      setMetrics(
        await httpClient.get<ReactivationMetricsResponse>("/campaigns/reactivation-metrics", {
          days: forDays,
        })
      );
    } catch {
      // el embudo es informativo: si falla se queda en cero
    }
  }, []);

  useEffect(() => {
    loadMetrics(days).catch(() => undefined);
  }, [loadMetrics, days]);

  function handleCreateCampaign(customerIds: string[]) {
    setPreselectedIds(customerIds);
    setAutoOpenCreate(true);
    setCampaignsKey((k) => k + 1);
    setTab("campanas");
  }

  const canReactivation = can("reactivation");

  if (!canReactivation) {
    return (
      <div className="page-stack">
        <section className="panel p-5">
          <h2 style={{ margin: 0 }}>Sin acceso a Reactivación</h2>
          <p className="page-kicker" style={{ margin: 0 }}>
            Pide a tu administrador el permiso de Reactivación para usar este módulo.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Reactivación</h1>
          <p className="page-kicker">
            Vuelve a vender a clientes que ya te compraron y llevan tiempo sin pedir. Audiencia
            tibia: mejor tasa de respuesta que la prospección fría.
          </p>
        </div>
      </div>

      <section className="grid grid-4">
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>1 · Inactivos</span>
            <RotateCcw size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.inactive}</strong>
          <small>Con {days}+ días sin comprar</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>2 · Contactados</span>
            <Send size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.contacted}</strong>
          <small>Mensajes de reactivación enviados</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>3 · Respondieron</span>
            <MessageCircleReply size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.replied}</strong>
          <small>El agente IA los atiende al responder</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>4 · Recompraron</span>
            <Trophy size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.repurchased}</strong>
          <small>${Number(metrics.revenueRecovered).toFixed(2)} recuperados</small>
        </div>
      </section>

      <NumberHealthCard compact />

      <section className="panel" style={{ padding: "0 16px" }}>
        <Tabs
          value={tab}
          onChange={(_e, next: TabKey) => setTab(next)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab
            value="inactivos"
            label="Clientes inactivos"
            icon={<RotateCcw size={16} />}
            iconPosition="start"
            sx={{ minHeight: 56 }}
          />
          <Tab
            value="campanas"
            label="Campañas"
            icon={<Megaphone size={16} />}
            iconPosition="start"
            sx={{ minHeight: 56 }}
          />
        </Tabs>
      </section>

      {tab === "inactivos" && (
        <InactiveCustomersTab
          days={days}
          onDaysChange={setDays}
          onCreateCampaign={handleCreateCampaign}
        />
      )}

      {tab === "campanas" && (
        <>
          <CampaignsTab
            key={campaignsKey}
            audience={CAMPAIGN_AUDIENCE.CUSTOMERS}
            permissionModule="reactivation"
            inactiveDays={days}
            preselectedRecipientIds={preselectedIds}
            autoOpenCreate={autoOpenCreate}
            onDataChanged={() => loadMetrics(days)}
          />
          <TemplateStatsPanel
            context={OUTBOUND_CONTEXT.REACTIVATION}
            conversionLabel="Recompraron"
          />
        </>
      )}
    </div>
  );
}
