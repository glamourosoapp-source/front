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

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

/**
 * Rampa de calentamiento: barra de progreso con la semana actual, el cupo de
 * hoy y cuándo sube. Sin esto el usuario no entiende por qué solo salen 20
 * mensajes al día ni cuándo podrá mandar más.
 */
function WarmupIndicator({ warmup }: { warmup: OutreachHealthResponse["warmup"] }) {
  if (!warmup.enabled) return null;

  const pct = warmup.maxCap > 0 ? Math.min(100, Math.round((warmup.effectiveCap / warmup.maxCap) * 100)) : 100;
  const notStarted = !warmup.startedAt;

  return (
    <div className="grid gap-1" style={{ minWidth: 260 }}>
      <div className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: "var(--glam-navy)" }}>
          {warmup.atFullCapacity
            ? "Número a máxima capacidad"
            : `Calentamiento · semana ${warmup.week} de ${warmup.totalWeeks}`}
        </span>
        <span style={{ color: "var(--muted)" }}>
          {warmup.effectiveCap} de {warmup.maxCap}/día
        </span>
      </div>
      <div
        aria-label={`Calentamiento del número: ${pct}% de la capacidad`}
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            background: warmup.atFullCapacity ? "var(--glam-blue)" : "#f5a524",
            transition: "width .3s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: "var(--muted)" }}>
        {warmup.atFullCapacity
          ? "Ya puedes enviar al ritmo completo sin arriesgar el número."
          : notStarted
            ? `Arranca en ${warmup.effectiveCap}/día con tu primer envío y sube cada semana.`
            : `Sube a ${warmup.nextCap}/día el ${formatDay(warmup.nextIncreaseAt)} · protege el número ante Meta.`}
      </span>
    </div>
  );
}

/**
 * Tarjeta "Salud del número": estado del guardián de envíos fríos (cupo del
 * día con warm-up, cola pendiente, lista de exclusión y pausa/breaker).
 */
export function NumberHealthCard({ compact = false }: { compact?: boolean }) {
  const { can } = usePermissions();
  const [health, setHealth] = useState<OutreachHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setHealth(await httpClient.get<OutreachHealthResponse>("/outreach/health"));
      setLastLoadedAt(new Date().toISOString());
      setError(null);
    } catch (err) {
      // Nunca fallar en silencio: esta tarjeta es la que dice si los envíos
      // fríos están protegidos. Un esqueleto eterno haría pensar que todo va
      // bien cuando en realidad no sabemos nada del número.
      setError(getApiErrorMessage(err, "No se pudo leer la salud del número"));
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

  if (!health && error) {
    return (
      <div
        className="panel p-4 flex flex-wrap items-center justify-between gap-3"
        style={{ borderColor: "#f5a524" }}
      >
        <div className="flex items-center gap-3">
          <ShieldAlert size={22} style={{ color: "#b45309" }} />
          <div>
            <strong style={{ display: "block" }}>No pude leer la salud del número</strong>
            <span className="page-kicker" style={{ margin: 0 }}>
              {error} · Si el backend no tiene aplicadas las migraciones del guardián de envíos,
              esta tarjeta y los envíos con cupo no funcionan todavía.
            </span>
          </div>
        </div>
        <Button size="small" variant="outlined" onClick={() => load()}>
          Reintentar
        </Button>
      </div>
    );
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
          {error && (
            // El refresh de 60s está fallando: lo de arriba es una foto vieja,
            // no el estado actual del número. Decirlo, no fingir normalidad.
            <span className="page-kicker" style={{ margin: 0, display: "block", color: "#b45309" }}>
              Sin actualizar desde {formatTime(lastLoadedAt)}: {error}
            </span>
          )}
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
        <WarmupIndicator warmup={health.warmup} />
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
