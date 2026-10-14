"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TicketSettings } from "@glamouroso/shared";
import { ticketHeaderBlock } from "@glamouroso/shared";
import { POS_RETURN_REASON_LABELS, posPaymentMethodLabel } from "@glamouroso/shared/constants";
import type { CustomerReturnTicket } from "@/lib/pos/customer-return";

function money(value: string | number | null | undefined): string {
  return `$${Number(value ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function quantity(value: string | number): string {
  const amount = Number(value ?? 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

const WATERMARK: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  fontSize: 34,
  fontWeight: 900,
  letterSpacing: 4,
  color: "rgba(0, 0, 0, 0.12)",
  transform: "rotate(-35deg)",
  whiteSpace: "nowrap",
};

const BANNER: React.CSSProperties = {
  background: "#000",
  color: "#fff",
  textAlign: "center",
  fontWeight: 900,
  padding: "4px 0",
  letterSpacing: 2,
  WebkitPrintColorAdjust: "exact",
  printColorAdjust: "exact",
};

function Copy({
  ret,
  settings,
  copy,
  walkInName,
}: {
  ret: CustomerReturnTicket;
  settings: TicketSettings;
  copy: "client" | "branch";
  walkInName: string;
}) {
  const header = ticketHeaderBlock(settings, ret.branch);
  return (
    <div style={{ position: "relative", overflow: "hidden", fontFamily: "monospace", fontSize: 11, pageBreakAfter: "always" }}>
      <div style={WATERMARK}>DEVOLUCIÓN</div>
      <div style={BANNER}>
        <div style={{ fontSize: 18 }}>DEVOLUCIÓN</div>
        <div>DE CLIENTE</div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, margin: "6px 0" }}>{header.title}</div>
      <div>Folio: {ret.returnNumber}</div>
      <div>Fecha: {dateTime(ret.returnedAt)}</div>
      <div>Ticket: {ret.saleTicketNumber}</div>
      <div>Compra: {dateTime(ret.saleSoldAt)}</div>
      {ret.branch ? (
        <div>
          Sucursal: {ret.branch.code} {ret.branch.name}
        </div>
      ) : null}
      {ret.cashierName ? <div>Atendió: {ret.cashierName}</div> : null}
      <div>Cliente: {ret.customerName || walkInName}</div>
      <div style={{ fontWeight: 700 }}>{copy === "client" ? "ORIGINAL - CLIENTE" : "COPIA - SUCURSAL"}</div>
      <hr />
      {ret.items.map((item, index) => (
        <div key={`${item.name}-${index}`} style={{ marginBottom: 3 }}>
          <div>{item.name}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {quantity(item.quantity)} {item.saleUnit === "liter" ? "L" : "pz"} ·{" "}
              {POS_RETURN_REASON_LABELS[item.reason] ?? item.reason}
            </span>
            <span>{money(item.total)}</span>
          </div>
          {copy === "branch" ? <div>{item.restock ? "Regresa al anaquel" : "Merma"}</div> : null}
        </div>
      ))}
      <hr />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
        <span>Devuelto</span>
        <span>{money(ret.total)}</span>
      </div>
      <div>Se regresa en: {posPaymentMethodLabel(ret.paymentMethod)}</div>
      {ret.notes ? <div>Nota: {ret.notes}</div> : null}
      {copy === "branch" ? (
        <div style={{ marginTop: 28, borderTop: "1px solid #000", textAlign: "center" }}>
          Recibí {money(ret.total)} · Nombre y firma del cliente
        </div>
      ) : (
        <div style={{ marginTop: 8, textAlign: "center" }}>Conserve este comprobante</div>
      )}
      <div style={{ ...BANNER, marginTop: 8 }}>DEVOLUCIÓN DE CLIENTE</div>
    </div>
  );
}

/**
 * Respaldo del ticket de devolución de cliente por el diálogo del navegador
 * (sin Conector de impresión). Dos ejemplares: el del cliente y el que firma de
 * recibido y se queda en la sucursal.
 */
export function CustomerReturnSheet({
  ret,
  settings,
  walkInName,
}: {
  ret: CustomerReturnTicket | null;
  settings: TicketSettings;
  walkInName: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !ret) return null;

  return createPortal(
    <div className="print-only">
      <style>{`@page { size: ${settings.paperWidthMm}mm auto; margin: 4mm; }`}</style>
      <Copy ret={ret} settings={settings} copy="client" walkInName={walkInName} />
      <Copy ret={ret} settings={settings} copy="branch" walkInName={walkInName} />
    </div>,
    document.body
  );
}
