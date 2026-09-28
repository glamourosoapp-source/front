"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TicketSettings } from "@glamouroso/shared";
import { ticketHeaderBlock } from "@glamouroso/shared";
import { FACTORY_RETURN_REASON_LABELS } from "@glamouroso/shared/constants";
import type { FactoryReturn } from "@/types";

function money(value: string | number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function quantity(value: string | number): string {
  const amount = Number(value ?? 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
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

function Copy({ ret, settings, label }: { ret: FactoryReturn; settings: TicketSettings; label: string }) {
  const header = ticketHeaderBlock(settings, ret.branch ?? null);
  return (
    <div style={{ position: "relative", overflow: "hidden", fontFamily: "monospace", fontSize: 11, pageBreakAfter: "always" }}>
      <div style={WATERMARK}>DEVOLUCIÓN</div>
      <div style={BANNER}>
        <div style={{ fontSize: 18 }}>DEVOLUCIÓN</div>
        <div>A FÁBRICA</div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, margin: "6px 0" }}>{header.title}</div>
      <div>Folio: {ret.folio}</div>
      <div>Fecha: {new Date(ret.createdAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</div>
      {ret.branch ? (
        <div>
          Sucursal: {ret.branch.code} {ret.branch.name}
        </div>
      ) : null}
      {ret.user?.name ? <div>Entrega: {ret.user.name}</div> : null}
      {ret.restockOrderId ? <div>Pedido: {ret.restockOrderId.slice(0, 8).toUpperCase()}</div> : null}
      <div style={{ fontWeight: 700 }}>{label}</div>
      <hr />
      {ret.items.map((item) => (
        <div key={item.id} style={{ marginBottom: 3 }}>
          <div>{item.productName}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {quantity(item.quantity)} {item.saleUnit === "liter" ? "L" : "pz"} ·{" "}
              {FACTORY_RETURN_REASON_LABELS[item.reason] ?? item.reason}
            </span>
            <span>{item.total === null ? "" : money(item.total)}</span>
          </div>
        </div>
      ))}
      <hr />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>Valor a precio tienda</span>
        <span>{money(ret.total)}</span>
      </div>
      <div>No es venta: no entra a la caja.</div>
      {ret.notes ? <div>Nota: {ret.notes}</div> : null}
      <div style={{ marginTop: 28, borderTop: "1px solid #000", textAlign: "center" }}>Entrega (sucursal)</div>
      <div style={{ marginTop: 28, borderTop: "1px solid #000", textAlign: "center" }}>Recibe (transportista)</div>
      <div style={{ ...BANNER, marginTop: 8 }}>DEVOLUCIÓN A FÁBRICA</div>
    </div>
  );
}

/**
 * Respaldo del ticket de devolución por el diálogo del navegador (sin
 * Conector de impresión). Aquí sí cabe una marca de agua de verdad, en
 * diagonal detrás del texto; la térmica usa franjas en negativo. Dos
 * ejemplares, como en la térmica: sucursal y transportista.
 */
export function FactoryReturnSheet({ ret, settings }: { ret: FactoryReturn | null; settings: TicketSettings }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !ret) return null;

  return createPortal(
    <div className="print-only">
      <style>{`@page { size: ${settings.paperWidthMm}mm auto; margin: 4mm; }`}</style>
      <Copy ret={ret} settings={settings} label="ORIGINAL - SUCURSAL" />
      <Copy ret={ret} settings={settings} label="COPIA - TRANSPORTISTA" />
    </div>,
    document.body
  );
}
