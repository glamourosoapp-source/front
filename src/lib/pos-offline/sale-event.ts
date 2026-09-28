"use client";

import {
  POS_PAYMENT_METHODS,
  POS_SALE_UNITS,
  POS_SALE_STATUS,
  type PosPaymentMethod,
} from "@glamouroso/shared/constants";
import type { PosSyncEvent, PosSaleEventPayload } from "@glamouroso/shared/pos-sync";
import { POS_SYNC_EVENT_TYPES } from "@glamouroso/shared/pos-sync";
import type { PosSale, PosSession } from "@/types";
import type { PricedLine } from "@/lib/pos/ticket";
import type { LocalSale } from "./store";

/**
 * Convierte lo que hay en pantalla en el ticket que se imprime y en el evento
 * que se sube.
 *
 * Los dos salen de los MISMOS números: el papel que se lleva el cliente y lo
 * que acabará en la base tienen que decir lo mismo, aunque entre una cosa y la
 * otra pasen tres días sin internet.
 */

export interface BuildSaleInput {
  ticketNumber: string;
  soldAt: Date;
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PosPaymentMethod;
  /** Lo que entregó el cliente; con tarjeta o transferencia se ignora (es el total). */
  amountTendered: number;
  itemsCount: number;
  notes: string | null;
  customerId: string | null;
  /** Cliente capturado en la caja sin red, todavía sin id del servidor. */
  localCustomer: { localId: string; name: string; phone: string; email?: string | null } | null;
  customerName: string | null;
  session: PosSession | null;
  catalogVersion: string | null;
  recordedOffline: boolean;
  clockOffsetMs: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Lo pagado y el cambio según el método: solo el efectivo puede sobrar. Con
 * tarjeta o transferencia el ticket dice el total exacto y cambio cero, igual
 * que lo normaliza el servidor.
 */
export function settlePayment(input: Pick<BuildSaleInput, "paymentMethod" | "amountTendered" | "total">): {
  amountTendered: number;
  changeAmount: number;
} {
  if (input.paymentMethod !== POS_PAYMENT_METHODS.CASH) {
    return { amountTendered: round2(input.total), changeAmount: 0 };
  }
  const amountTendered = round2(input.amountTendered);
  return { amountTendered, changeAmount: round2(amountTendered - input.total) };
}

/**
 * El ticket tal como se imprime y se guarda en la PC.
 *
 * Tiene la forma de un `PosSale` del servidor a propósito: la hoja térmica, el
 * generador de ESC/POS y el diálogo de reimpresión son los mismos con red y sin
 * ella. Un ticket offline no es un ticket de segunda.
 */
export function buildLocalSale(input: BuildSaleInput, eventId: string): LocalSale {
  const { amountTendered, changeAmount: change } = settlePayment(input);
  const sale: PosSale = {
    id: eventId,
    branchId: input.session?.branch.id ?? "",
    branch: input.session?.branch ?? null,
    ticketNumber: input.ticketNumber,
    cashierUserId: input.session?.cashier.id ?? "",
    cashier: input.session?.cashier ?? null,
    customerId: input.customerId,
    customer: input.customerName
      ? ({ id: input.customerId ?? "", name: input.customerName } as PosSale["customer"])
      : null,
    status: POS_SALE_STATUS.COMPLETED,
    subtotal: input.subtotal,
    discount: input.discount,
    total: input.total,
    paymentMethod: input.paymentMethod,
    amountTendered,
    changeAmount: change,
    itemsCount: input.itemsCount,
    notes: input.notes,
    soldAt: input.soldAt.toISOString(),
    recordedOffline: input.recordedOffline,
    items: input.lines.map((line) => ({
      id: line.key,
      saleId: eventId,
      productId: line.kind === "piece" ? line.productId : null,
      lineId: line.lineId,
      productName: line.name,
      sku: line.code || null,
      saleUnit: line.kind === "liter" ? POS_SALE_UNITS.LITER : POS_SALE_UNITS.PIECE,
      quantity: line.quantity,
      litersDeducted: line.litersDeducted,
      unitPrice: line.unitPrice,
      priceTier: line.appliedTier,
      pricingBreakdown: line.breakdown
        ? {
            bidones: line.breakdown.bidones,
            restLiters: line.breakdown.restLiters,
            bidonPrice: line.breakdown.bidonPrice,
            literPrice: line.breakdown.literPrice,
          }
        : null,
      total: line.total,
    })) as PosSale["items"],
  };

  return {
    localId: eventId,
    eventId,
    ticketNumber: input.ticketNumber,
    soldAt: sale.soldAt,
    total: input.total,
    paymentMethod: input.paymentMethod,
    amountTendered,
    changeAmount: change,
    itemsCount: input.itemsCount,
    customerName: input.customerName,
    cashierName: input.session?.cashier.name ?? null,
    status: "completed",
    recordedOffline: input.recordedOffline,
    serverId: null,
    syncStatus: "pending",
    sale,
  };
}

/** El evento que sube: lleva los precios con los que se cobró, no los de hoy. */
export function buildSaleEvent(input: BuildSaleInput, eventId: string): PosSyncEvent {
  const settled = settlePayment(input);
  const payload: PosSaleEventPayload = {
    ticketNumber: input.ticketNumber,
    soldAt: input.soldAt.toISOString(),
    customerId: input.customerId,
    customer: input.localCustomer
      ? {
          localId: input.localCustomer.localId,
          name: input.localCustomer.name,
          phone: input.localCustomer.phone,
          email: input.localCustomer.email ?? null,
        }
      : null,
    items: input.lines.map((line) => ({
      saleUnit: line.kind === "liter" ? POS_SALE_UNITS.LITER : POS_SALE_UNITS.PIECE,
      productId: line.kind === "piece" ? line.productId : null,
      lineId: line.kind === "liter" ? line.lineId : null,
      quantity: line.quantity,
      priceTier: line.appliedTier,
      unitPrice: line.unitPrice,
      total: line.total,
      pricingBreakdown: line.breakdown
        ? {
            bidones: line.breakdown.bidones,
            restLiters: line.breakdown.restLiters,
            bidonPrice: line.breakdown.bidonPrice,
            literPrice: line.breakdown.literPrice,
          }
        : null,
      notes: null,
    })),
    subtotal: input.subtotal,
    discount: input.discount,
    total: input.total,
    paymentMethod: input.paymentMethod,
    amountTendered: settled.amountTendered,
    changeAmount: settled.changeAmount,
    notes: input.notes,
    catalogVersion: input.catalogVersion,
    recordedOffline: input.recordedOffline,
  };

  return {
    id: eventId,
    type: POS_SYNC_EVENT_TYPES.SALE_CREATED,
    occurredAt: input.soldAt.toISOString(),
    payload,
  };
}

/** Anulación de un ticket que ya subió: el servidor lo tiene, hay que avisarle. */
export function buildVoidEvent(saleId: string, reason: string, at: Date): PosSyncEvent {
  return {
    id: crypto.randomUUID(),
    type: POS_SYNC_EVENT_TYPES.SALE_VOIDED,
    occurredAt: at.toISOString(),
    payload: { saleId, reason, voidedAt: at.toISOString() },
  };
}

/** Alta de cliente sin red: sube por su cuenta y también viaja dentro de la venta. */
export function buildCustomerEvent(
  localId: string,
  data: { name: string; phone: string; email?: string | null; birthday?: string | null },
  at: Date
): PosSyncEvent {
  return {
    id: crypto.randomUUID(),
    type: POS_SYNC_EVENT_TYPES.CUSTOMER_CREATED,
    occurredAt: at.toISOString(),
    payload: {
      localId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      birthday: data.birthday ?? null,
    },
  };
}
