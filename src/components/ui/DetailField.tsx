"use client";

import type { ReactNode } from "react";
import { Typography } from "@mui/material";

/** Par etiqueta/valor usado en las vistas de detalle (pedido, cliente, prospecto). */
export function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Typography sx={{ color: "var(--glam-navy)", fontWeight: 600, mt: 0.5 }}>{value}</Typography>
    </div>
  );
}
