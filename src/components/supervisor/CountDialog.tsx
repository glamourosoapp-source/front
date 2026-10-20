"use client";

import type { ReactNode } from "react";
import { Dialog } from "@mui/material";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";

export type CountDialogTone = "primary" | "success" | "danger";

/**
 * Diálogo de la sección Conteos (iniciar, cerrar, cancelar): ícono con el tono
 * de la acción, título, subtítulo con la sucursal y botones grandes. En el
 * celular sale desde abajo como hoja, al alcance del pulgar.
 */
export function CountDialog({
  open,
  onClose,
  busy = false,
  tone = "primary",
  icon: Icon,
  title,
  subtitle,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  /** Mientras se guarda no se cierra ni con la X ni tocando afuera. */
  busy?: boolean;
  tone?: CountDialogTone;
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => (busy ? null : onClose())}
      fullWidth
      maxWidth="xs"
      className="supd-root"
      PaperProps={{ className: `supd-paper is-${tone}` }}
      aria-labelledby="supd-title"
    >
      <header className="supd-head">
        <span className="supd-icon" aria-hidden>
          <Icon size={22} />
        </span>
        <div className="supd-title">
          <h2 id="supd-title">{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button type="button" className="supd-close" onClick={onClose} disabled={busy} aria-label="Cerrar">
          <X size={18} />
        </button>
      </header>
      <div className="supd-body">{children}</div>
      <footer className="supd-actions">{actions}</footer>
    </Dialog>
  );
}
