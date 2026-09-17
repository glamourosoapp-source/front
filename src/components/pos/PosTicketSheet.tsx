"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TicketSettings } from "@glamouroso/shared";
import type { PosSale } from "@/types";
import { TicketDocument } from "./TicketDocument";

/**
 * Ticket imprimible por el diálogo del navegador (respaldo cuando la PC no
 * tiene el agente local instalado).
 *
 * Se monta por portal como hijo directo de `<body>`: el `@media print` global
 * saca del flujo todo lo que no sea `.print-only`, y si esto se anidara dentro
 * de la caja el alto de la pantalla generaría una página en blanco.
 *
 * El contenido es el mismo `TicketDocument` que pinta la vista previa del panel.
 */
export function PosTicketSheet({
  sale,
  settings,
  reprint = false,
  walkInCustomerName,
}: {
  sale: PosSale | null;
  settings: TicketSettings;
  reprint?: boolean;
  walkInCustomerName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !sale) return null;

  const sheet = (
    <div className="print-only">
      <style>{`@page { size: ${settings.paperWidthMm}mm auto; margin: 4mm; }`}</style>
      <TicketDocument
        sale={sale}
        settings={settings}
        reprint={reprint}
        walkInCustomerName={walkInCustomerName}
      />
    </div>
  );

  return createPortal(sheet, document.body);
}
