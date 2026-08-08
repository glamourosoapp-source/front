"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Skeleton, Tooltip } from "@mui/material";
import { PauseCircle, PlayCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import type { OutreachHealthResponse } from "@glamouroso/shared/schemas/campaign";
import { toast } from "sonner";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Tarjeta "Salud del número": estado del guardián de envíos fríos (cupo del
 * día con warm-up, cola pendiente, lista de exclusión y pausa/breaker).
 */
export function NumberHealthCard({ compact = false }: { compact?: boolean }) {
  const { can } = usePermissions();
  const [health, setHealth] = useState<OutreachHealthResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setHealth(await httpClient.get<OutreachHealthResponse>("/outreach/health"));
    } catch {
      // tarjeta informativa: sin datos se muestra el skeleton
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
    const timer = setInterval(() => load().catch(() => undefined), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  async function togglePause() {
    if (!health) return;
    setBusy(true);
    try {
      const next = await httpClient.post<OutreachHealthResponse>(
        health.paused ? "/outreach/resume" : "/outreach/pause"
      );
      setHealth(next);
      toast.success(health.paused ? "Envíos reanudados" : "Envíos pausados");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cambiar el estado de envíos"));
    } finally {
      setBusy(false);
    }
  }

  if (!health) {
    return (
      <div className="panel p-4">
        <Skeleton variant="text" width={220} />
        <Skeleton variant="text" width={320} />
      </div>
    );
  }

  const canManage = can("outreach", "update");
  const warmingUp = health.warmup.enabled && health.warmup.effectiveCap < health.warmup.maxCap;

  return (
    <div
      className="panel p-4 flex flex-wrap items-center justify-between gap-3"
      style={health.paused ? { borderColor: "var(--glam-danger, #d32f2f)" } : undefined}
    >
      <div className="flex items-center gap-3">
        {health.paused ? (
          <ShieldAlert size={22} style={{ color: "#d32f2f" }} />
        ) : (
          <ShieldCheck size={22} style={{ color: "var(--glam-blue)" }} />
        )}
        <div>
          <strong style={{ display: "block" }}>
            {health.paused ? "Envíos fríos pausados" : "Salud del número: envíos activos"}
          </strong>
          <span className="page-kicker" style={{ margin: 0 }}>
            {health.paused
              ? health.pausedReason || "Pausa manual"
              : `Cupo de hoy: ${health.usedToday}/${health.dailyCap} · ${health.queuedTotal} en cola` +
                (health.queuedTotal > 0 ? ` · próximo: ${formatTime(health.nextScheduledAt)}` : "")}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {health.qualityRating && (
          <Tooltip
            title={`Quality rating de Meta${
              health.qualityCheckedAt
                ? ` · verificado ${formatTime(health.qualityCheckedAt)}`
                : ""
            }`}
          >
            <span
              className={
                health.qualityRating === "GREEN"
                  ? "pill-success"
                  : health.qualityRating === "YELLOW"
                    ? "pill warning"
                    : health.qualityRating === "RED"
                      ? "pill-danger"
                      : "pill-muted"
              }
            >
              Meta:{" "}
              {health.qualityRating === "GREEN"
                ? "verde"
                : health.qualityRating === "YELLOW"
                  ? "amarillo"
                  : health.qualityRating === "RED"
                    ? "ROJO"
                    : "sin datos"}
            </span>
          </Tooltip>
        )}
        {warmingUp && !health.paused && (
          <Tooltip title="El cupo diario crece cada semana para proteger el quality rating de Meta">
            <span className="pill warning">Calentamiento: {health.warmup.effectiveCap}/día</span>
          </Tooltip>
        )}
        {!compact && (
          <span className="pill-muted">{health.suppressedCount} en no contactar</span>
        )}
        {canManage && (
          <Button
            size="small"
            variant={health.paused ? "contained" : "outlined"}
            color={health.paused ? "primary" : "warning"}
            onClick={togglePause}
            disabled={busy}
            startIcon={health.paused ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
          >
            {health.paused ? "Reanudar envíos" : "Pausar envíos"}
          </Button>
        )}
      </div>
    </div>
  );
}
