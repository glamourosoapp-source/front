"use client";

import type { CSSProperties } from "react";
import type { TicketEmphasis, TicketSettings } from "@glamouroso/shared";
import { ticketFooterLines, ticketHeaderBlock } from "@glamouroso/shared";
import { ticketColumns } from "@/lib/print/escpos";
import { encodeCode39 } from "@/lib/print/code39";
import type { PosSale, PosSaleItem } from "@/types";

/**
 * El ticket dibujado en HTML.
 *
 * Es el mismo documento para los dos usos: la hoja que imprime el diálogo del
 * navegador cuando la sucursal no tiene agente (`PosTicketSheet`) y la vista
 * previa de la pantalla de configuración. Sigue la misma configuración que
 * `buildTicketEscPos`, así que lo que se ve aquí es lo que sale por la térmica.
 */

/** Tamaño base del cuerpo en px, por ancho de papel. */
const BODY_FONT: Record<number, Record<string, number>> = {
  58: { small: 8.5, normal: 10, large: 12 },
  80: { small: 9.5, normal: 11.5, large: 13.5 },
};

const LINE_HEIGHT = { tight: 1.2, normal: 1.35, loose: 1.6 } as const;

/** Equivalente en pantalla del `GS !` de la térmica. */
const EMPHASIS_SCALE: Record<TicketEmphasis, number> = { normal: 1, large: 1.35, xlarge: 1.7 };

function money(value: string | number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function quantity(value: string | number): string {
  const amount = Number(value ?? 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function breakdownOf(item: PosSaleItem) {
  return item.pricingBreakdown as
    | { bidones?: number; restLiters?: number; bidonPrice?: number; literPrice?: number }
    | null
    | undefined;
}

const rowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8 };

/** Logo del negocio. La térmica lo imprime rasterizado; aquí es una imagen. */
function TicketLogo({ settings }: { settings: TicketSettings }) {
  if (!settings.logoUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={settings.logoUrl}
      alt=""
      style={{ maxWidth: "70%", maxHeight: 90, margin: "4px auto", display: "block" }}
    />
  );
}

/** Código de barras del folio, con las mismas barras que manda la térmica. */
function FolioBarcode({ value, fontSize }: { value: string; fontSize: number }) {
  const { bars, width, value: encoded } = encodeCode39(value);
  if (!encoded || !width) return null;
  const height = 34;
  return (
    <div style={{ marginTop: 6 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
        role="img"
        aria-label={`Código de barras del folio ${encoded}`}
      >
        {bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={height} fill="#000" />
        ))}
      </svg>
      <div style={{ fontSize: fontSize * 0.9, letterSpacing: 1 }}>{encoded}</div>
    </div>
  );
}

export interface TicketDocumentProps {
  sale: PosSale;
  settings: TicketSettings;
  reprint?: boolean;
  /** Nombre a mostrar cuando la venta no tiene cliente. */
  walkInCustomerName?: string;
}

export function TicketDocument({
  sale,
  settings,
  reprint = false,
  walkInCustomerName,
}: TicketDocumentProps) {
  const widthMm = settings.paperWidthMm;
  const fontSize = (BODY_FONT[widthMm] ?? BODY_FONT[80])[settings.fontSize];
  const separator = settings.separatorChar.repeat(ticketColumns(settings));
  const header = ticketHeaderBlock(settings, sale.branch ?? null);
  const footerLines = ticketFooterLines(settings);

  const emphasis = (mode: TicketEmphasis): CSSProperties => ({
    fontWeight: 700,
    fontSize: fontSize * EMPHASIS_SCALE[mode],
    lineHeight: 1.2,
  });

  return (
    <div
      style={{
        width: `${widthMm - 8}mm`,
        fontFamily: '"Courier New", monospace',
        fontSize,
        lineHeight: LINE_HEIGHT[settings.lineSpacing],
        color: "#000",
        background: "#fff",
      }}
    >
      <div style={{ textAlign: "center" }}>
        {settings.logoPosition === "header" ? <TicketLogo settings={settings} /> : null}
        <div style={emphasis(settings.headerSize)}>{header.title}</div>
        {header.lines.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
      </div>

      <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>{separator}</div>
      <div>Ticket: {sale.ticketNumber}</div>
      <div>
        Fecha:{" "}
        {new Date(sale.soldAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
      </div>
      {settings.showCashier && sale.cashier?.name ? <div>Le atiende: {sale.cashier.name}</div> : null}
      {settings.showCustomer ? (
        <div>Cliente: {sale.customer?.name || walkInCustomerName || "Mostrador"}</div>
      ) : null}
      {reprint ? <div style={{ fontWeight: 700 }}>** REIMPRESIÓN **</div> : null}
      <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>{separator}</div>

      {(sale.items ?? []).map((item) => {
        const breakdown = settings.showBreakdown ? breakdownOf(item) : null;
        return (
          <div key={item.id} style={{ marginBottom: 2 }}>
            <div>
              {settings.showItemCodes && item.sku ? `${item.sku} ` : ""}
              {item.productName}
            </div>
            <div style={rowStyle}>
              <span>
                {quantity(item.quantity)}
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
                  ? `${quantity(Number(breakdown.restLiters))} L × ${money(breakdown.literPrice)}`
                  : ""}
              </div>
            ) : null}
          </div>
        );
      })}

      <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>{separator}</div>
      {Number(sale.discount) > 0 ? (
        <>
          <div style={rowStyle}>
            <span>Subtotal</span>
            <span>{money(sale.subtotal)}</span>
          </div>
          <div style={rowStyle}>
            <span>Descuento</span>
            <span>-{money(sale.discount)}</span>
          </div>
        </>
      ) : null}
      <div style={{ ...rowStyle, ...emphasis(settings.totalSize) }}>
        <span>TOTAL</span>
        <span>{money(sale.total)}</span>
      </div>
      {settings.showPaymentDetail ? (
        <>
          <div style={rowStyle}>
            <span>Pagó con</span>
            <span>{money(sale.amountTendered)}</span>
          </div>
          <div style={rowStyle}>
            <span>Cambio</span>
            <span>{money(sale.changeAmount)}</span>
          </div>
        </>
      ) : null}
      <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>{separator}</div>

      <div style={{ textAlign: "center" }}>
        {settings.logoPosition === "footer" ? <TicketLogo settings={settings} /> : null}
        {footerLines.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
        {settings.showFolioBarcode ? (
          <FolioBarcode value={sale.ticketNumber} fontSize={fontSize} />
        ) : null}
      </div>
    </div>
  );
}
