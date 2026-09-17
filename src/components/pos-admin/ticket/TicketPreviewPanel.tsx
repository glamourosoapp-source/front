"use client";

import { useState } from "react";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import type { TicketSettings } from "@glamouroso/shared";
import { TicketDocument } from "@/components/pos/TicketDocument";
import { ticketPreviewText } from "@/lib/print/escpos";
import type { PosSale } from "@/types";

/**
 * Vista previa del ticket, en las dos formas en que puede salir:
 *
 * - **Papel**: el mismo `TicketDocument` que imprime el diálogo del navegador.
 * - **Térmica**: el texto plano que recibe la impresora, con las columnas reales
 *   del rollo. Sirve para ver si un nombre largo se corta.
 */
export function TicketPreviewPanel({
  sale,
  settings,
  walkInCustomerName,
}: {
  sale: PosSale;
  settings: TicketSettings;
  walkInCustomerName?: string;
}) {
  const [mode, setMode] = useState<"paper" | "raw">("paper");

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Vista previa</h2>
          <p className="page-kicker" style={{ margin: 0 }}>
            Rollo de {settings.paperWidthMm} mm · se actualiza mientras editas.
          </p>
        </div>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={mode}
          onChange={(_event, next) => next && setMode(next)}
        >
          <ToggleButton value="paper">Papel</ToggleButton>
          <ToggleButton value="raw">Térmica</ToggleButton>
        </ToggleButtonGroup>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "center",
          background: "var(--glam-bg, #f4f5f7)",
          borderRadius: 8,
          padding: 16,
          overflowX: "auto",
        }}
      >
        <div className="ticket-preview-paper">
          {mode === "paper" ? (
            <TicketDocument
              sale={sale}
              settings={settings}
              walkInCustomerName={walkInCustomerName}
            />
          ) : (
            <pre
              style={{
                fontFamily: '"Courier New", monospace',
                fontSize: settings.paperWidthMm === 58 ? 10 : 11,
                lineHeight: 1.35,
                color: "#000",
                margin: 0,
                whiteSpace: "pre",
              }}
            >
              {ticketPreviewText(sale, settings)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
