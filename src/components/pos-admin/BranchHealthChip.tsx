"use client";

import { Tooltip } from "@mui/material";
import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import { BRANCH_HEALTH_LABELS, type BranchHealth } from "@glamouroso/shared";
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

export function BranchHealthSignals({ health }: { health: BranchHealth }) {
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
        return (
          <li
            key={signal.code}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 10,
              background: HEALTH_BG[signal.level],
              color: HEALTH_COLORS[signal.level],
              fontWeight: 600,
            }}
          >
            <Icon size={16} style={{ flex: "0 0 auto" }} />
            {signal.message}
          </li>
        );
      })}
    </ul>
  );
}
