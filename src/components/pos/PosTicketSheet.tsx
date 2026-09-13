"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TicketSettings } from "@glamouroso/shared";
import type { PosSale } from "@/types";

/**
 * Ticket imprimible por el diálogo del navegador (respaldo cuando la PC no
 * tiene el agente local instalado).
 *
 * Se monta por portal como hijo directo de `<body>`: el `@media print` global
 * saca del flujo todo lo que no sea `.print-only`, y si esto se anidara dentro
 * de la caja el alto de la pantalla generaría una página en blanco.
 */
export function PosTicketSheet({
  sale,
  settings,
  reprint = false,
}: {
  sale: PosSale | null;
  settings: TicketSettings;
  reprint?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !sale) return null;

  const widthMm = settings.paperWidthMm;
  const money = (value: string | number | null | undefined) => `$${Number(value ?? 0).toFixed(2)}`;
  const qty = (value: string | number) => {
    const amount = Number(value ?? 0);
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  };

  const sheet = (
    <div className="print-only">
      <style>{`@page { size: ${widthMm}mm auto; margin: 4mm; }`}</style>
      <div
        style={{
          width: `${widthMm - 8}mm`,
          fontFamily: '"Courier New", monospace',
          fontSize: widthMm === 58 ? 10 : 11.5,
          lineHeight: 1.35,
          color: "#000",
        }}
      >
        <div style={{ textAlign: "center", fontWeight: 700 }}>
          {sale.branch?.name || "Glamouroso"}
        </div>
        {settings.headerLines.map((line, index) => (
          <div key={index} style={{ textAlign: "center" }}>
            {line}
          </div>
        ))}
        <div>{"-".repeat(widthMm === 58 ? 32 : 42)}</div>
        <div>Ticket: {sale.ticketNumber}</div>
        <div>
          Fecha:{" "}
          {new Date(sale.soldAt).toLocaleString("es-MX", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </div>
        {sale.cashier?.name ? <div>Le atiende: {sale.cashier.name}</div> : null}
        <div>Cliente: {sale.customer?.name || "Mostrador"}</div>
        {reprint ? <div style={{ fontWeight: 700 }}>** REIMPRESIÓN **</div> : null}
        <div>{"-".repeat(widthMm === 58 ? 32 : 42)}</div>

        {(sale.items ?? []).map((item) => {
          const breakdown = item.pricingBreakdown as
            | { bidones?: number; restLiters?: number; bidonPrice?: number; literPrice?: number }
            | null;
          return (
            <div key={item.id} style={{ marginBottom: 2 }}>
              <div>{item.productName}</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {qty(item.quantity)}
                  {item.saleUnit === "liter" ? " L" : ""} × {money(item.unitPrice)}
                </span>
                <span>{money(item.total)}</span>
              </div>
              {breakdown ? (
                <div style={{ fontStyle: "italic" }}>
                  {Number(breakdown.bidones) > 0
                    ? `${breakdown.bidones} bidón × ${money(breakdown.bidonPrice)}`
                    : ""}
                  {Number(breakdown.bidones) > 0 && Number(breakdown.restLiters) > 0 ? " + " : ""}
                  {Number(breakdown.restLiters) > 0
                    ? `${qty(Number(breakdown.restLiters))} L × ${money(breakdown.literPrice)}`
                    : ""}
                </div>
              ) : null}
            </div>
          );
        })}

        <div>{"-".repeat(widthMm === 58 ? 32 : 42)}</div>
        {Number(sale.discount) > 0 ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Subtotal</span>
              <span>{money(sale.subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Descuento</span>
              <span>-{money(sale.discount)}</span>
            </div>
          </>
        ) : null}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 700,
            fontSize: widthMm === 58 ? 14 : 16,
          }}
        >
          <span>TOTAL</span>
          <span>{money(sale.total)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Pagó con</span>
          <span>{money(sale.amountTendered)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Cambio</span>
          <span>{money(sale.changeAmount)}</span>
        </div>
        <div>{"-".repeat(widthMm === 58 ? 32 : 42)}</div>
        {settings.footerMessage ? (
          <div style={{ textAlign: "center" }}>{settings.footerMessage}</div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
