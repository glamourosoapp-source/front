"use client";

import { useState } from "react";
import { DoorClosed, DoorOpen, Store } from "lucide-react";
import type { StoreDayStatus } from "@glamouroso/shared";

function time(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const text = new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Pantalla que tapa la caja mientras la tienda no esté abierta: a primera hora
 * ("Abrir tienda") y después de "Cerré la tienda" ("Reabrir"). Mientras se ve,
 * la caja no recibe clics ni atajos de teclado.
 */
export function PosStoreDayGate({
  status,
  date,
  closedAt,
  branchName,
  cashierName,
  onOpen,
}: {
  status: StoreDayStatus;
  date: string;
  closedAt: string | null;
  branchName: string;
  cashierName: string;
  onOpen: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  if (status === "open") return null;
  const closed = status === "closed";

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onOpen();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pos-store-gate" role="dialog" aria-modal="true" aria-labelledby="pos-store-gate-title">
      <div className="pos-store-gate-card">
        <span className={`pos-store-gate-icon ${closed ? "closed" : ""}`}>
          {closed ? <DoorClosed size={34} /> : <Store size={34} />}
        </span>
        <p className="pos-store-gate-kicker">
          {branchName} · {longDate(date)}
        </p>
        <h1 id="pos-store-gate-title">{closed ? "La tienda está cerrada" : "Abre la tienda para empezar"}</h1>
        <p className="pos-store-gate-text">
          {closed
            ? `Cerrada desde las ${time(closedAt)}: la caja vuelve a cobrar mañana, al abrir.`
            : "Registra la apertura de hoy. La hora se toma de esta computadora al presionar el botón."}
        </p>
        <button className="pos-store-gate-button" onClick={() => void open()} disabled={busy} autoFocus>
          <DoorOpen size={20} />
          {closed ? "Reabrir la tienda" : "Abrir tienda"}
        </button>
        <p className="pos-store-gate-foot">
          {closed
            ? "Reabrir queda registrado con la hora en el panel."
            : `Le atiende: ${cashierName}`}
        </p>
      </div>
    </div>
  );
}

/** Confirmación de "Cerré la tienda": deja la caja bloqueada hasta reabrir o mañana. */
export function PosCloseStoreConfirm({
  open,
  pendingTickets,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  pendingTickets: number;
  onCancel: () => void;
  onConfirm: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pos-store-gate" role="dialog" aria-modal="true" aria-labelledby="pos-close-store-title">
      <div className="pos-store-gate-card">
        <span className="pos-store-gate-icon closed">
          <DoorClosed size={34} />
        </span>
        <h1 id="pos-close-store-title">¿Cerrar la tienda?</h1>
        <p className="pos-store-gate-text">
          Se registra la hora de cierre y la caja deja de cobrar hasta mañana. Si fue un error, puedes reabrir.
        </p>
        {pendingTickets > 0 ? (
          <p className="pos-store-gate-warn">
            Tienes {pendingTickets} {pendingTickets === 1 ? "ticket pendiente" : "tickets pendientes"} sin cobrar: se
            quedan guardados.
          </p>
        ) : null}
        <div className="pos-store-gate-actions">
          <button className="pos-action" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className="pos-store-gate-button danger" onClick={() => void confirm()} disabled={busy} autoFocus>
            <DoorClosed size={18} />
            Cerrar la tienda
          </button>
        </div>
      </div>
    </div>
  );
}
