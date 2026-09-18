"use client";

import { Tooltip } from "@mui/material";
import { CloudCheck, CloudOff, CloudUpload } from "lucide-react";
import type { BranchStats } from "@/types";

/**
 * Estado de la caja de una sucursal en la tabla.
 *
 * Lo que responde de un vistazo es "¿puedo cerrar el día?": una sucursal con
 * ventas sin subir todavía no tiene su día completo en el sistema, y el corte
 * se va a negar a congelarse.
 */
export function BranchSyncCell({ stats }: { stats: BranchStats }) {
  const pending = stats.health.signals.find((signal) => signal.code === "sync_pending");
  const silent = stats.health.signals.find((signal) => signal.code === "sync_offline");
  const rejected = stats.health.signals.find((signal) => signal.code === "sync_rejected");

  if (!pending && !silent && !rejected) {
    return (
      <Tooltip title="La caja está al día: todo lo cobrado ya está en el sistema">
        <span style={{ display: "inline-flex", color: "#15803d" }}>
          <CloudCheck size={16} />
        </span>
      </Tooltip>
    );
  }

  const signal = pending ?? silent ?? rejected!;
  const critical = signal.level === "critical";
  return (
    <Tooltip title={[pending, silent, rejected].filter(Boolean).map((s) => s!.message).join(" · ")}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: critical ? "#c62828" : "#b45309",
          fontWeight: 700,
          fontSize: 12,
          whiteSpace: "nowrap",
        }}
      >
        {silent ? <CloudOff size={15} /> : <CloudUpload size={15} />}
        {signal.message}
      </span>
    </Tooltip>
  );
}
