"use client";

import { IconButton, Tooltip } from "@mui/material";
import { MessageCircle, Phone } from "lucide-react";
import { telLink, whatsappLink } from "@/utils/contact-links";

interface ContactActionsProps {
  phone: string | null;
  /** Texto prellenado del WhatsApp. */
  message: string;
}

/**
 * WhatsApp y llamada desde el teléfono del vendedor. Botones de 44px: el caso
 * de uso principal es el vendedor en su celular, entre visitas.
 */
export function ContactActions({ phone, message }: ContactActionsProps) {
  const wa = whatsappLink(phone, message);
  const tel = telLink(phone);
  const missing = "Sin teléfono válido";

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Tooltip title={wa ? "Enviar WhatsApp" : missing}>
        <span>
          <IconButton
            component="a"
            href={wa ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            disabled={!wa}
            aria-label="Enviar WhatsApp"
            sx={{ width: 44, height: 44, color: wa ? "#25D366" : undefined }}
          >
            <MessageCircle size={22} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={tel ? "Llamar" : missing}>
        <span>
          <IconButton
            component="a"
            href={tel ?? undefined}
            disabled={!tel}
            aria-label="Llamar"
            sx={{ width: 44, height: 44, color: tel ? "var(--glam-blue)" : undefined }}
          >
            <Phone size={22} />
          </IconButton>
        </span>
      </Tooltip>
    </div>
  );
}
