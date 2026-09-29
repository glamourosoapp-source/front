"use client";

import Link from "next/link";
import { Tooltip } from "@mui/material";
import { AlertTriangle, CheckCircle2, ChevronRight, OctagonAlert } from "lucide-react";
import { BRANCH_HEALTH_LABELS, type BranchHealth, type BranchHealthSignal } from "@glamouroso/shared";
import { HEALTH_BG, HEALTH_COLORS } from "./pos-labels";

const ICONS = {
  good: CheckCircle2,
  warning: AlertTriangle,
  critical: OctagonAlert,
};

/**
 * Chip de salud de la sucursal. En la tabla va compacto con las señales en el
 * tooltip; en el detalle se pintan aparte con `BranchHealthSignals`.
 */
export function BranchHealthChip({ health, size = "small" }: { health: BranchHealth; size?: "small" | "large" }) {
  const Icon = ICONS[health.level];
  const chip = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: size === "large" ? "6px 12px" : "3px 9px",
        borderRadius: 999,
        background: HEALTH_BG[health.level],
        color: HEALTH_COLORS[health.level],
        fontWeight: 700,
        fontSize: size === "large" ? 14 : 12,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={size === "large" ? 16 : 13} />
      {BRANCH_HEALTH_LABELS[health.level]}
      {health.signals.length > 1 ? ` · ${health.signals.length}` : ""}
    </span>
  );
  if (!health.signals.length) return chip;
  return (
    <Tooltip
      title={
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {health.signals.map((signal) => (
            <li key={signal.code}>{signal.message}</li>
          ))}
        </ul>
      }
    >
      {chip}
    </Tooltip>
  );
}

/**
 * Las señales en el detalle. Con `hrefFor`, cada señal que tiene dónde
 * resolverse es un link a esa pestaña ("2 productos bajo mínimo" → Inventario
 * filtrado): el resumen avisaba del problema pero no llevaba a ningún lado.
 */
export function BranchHealthSignals({
  health,
  hrefFor,
}: {
  health: BranchHealth;
  hrefFor?: (code: BranchHealthSignal["code"]) => string | null;
}) {
  if (!health.signals.length) {
    return (
      <p className="page-kicker" style={{ margin: 0 }}>
        Sin señales de alerta: vende, tiene inventario y su surtido va al día.
      </p>
    );
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 8 }}>
      {health.signals.map((signal) => {
        const Icon = ICONS[signal.level];
        const href = hrefFor?.(signal.code) ?? null;
        const style = {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 10,
          background: HEALTH_BG[signal.level],
          color: HEALTH_COLORS[signal.level],
          fontWeight: 600,
        } as const;
        return (
          <li key={signal.code}>
            {href ? (
              <Link href={href} className="health-signal-link" style={style}>
                <Icon size={16} style={{ flex: "0 0 auto" }} />
                <span style={{ flex: 1 }}>{signal.message}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 13 }}>
                  Revisar <ChevronRight size={15} />
                </span>
              </Link>
            ) : (
              <div style={style}>
                <Icon size={16} style={{ flex: "0 0 auto" }} />
                {signal.message}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
