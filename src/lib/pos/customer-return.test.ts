import { describe, expect, it } from "bun:test";
import { POS_RETURN_REASONS } from "@glamouroso/shared/constants";
import {
  buildCustomerReturn,
  returnBlocker,
  returnableRows,
  returnedLines,
  type LocalReturnRecord,
} from "./customer-return";
import type { PosSale } from "@/types";

const sale = {
  id: "sale-1",
  branchId: "branch-1",
  ticketNumber: "SUC01-20261014-0007",
  cashierUserId: "u",
  status: "completed",
  kind: "counter",
  subtotal: 200,
  discount: 20,
  total: 180,
  paymentMethod: "cash",
  amountTendered: 200,
  changeAmount: 20,
  itemsCount: 5,
  soldAt: "2026-10-14T18:00:00.000Z",
  items: [
    {
      id: "i1",
      saleId: "sale-1",
      productId: "escoba",
      lineId: null,
      productName: "ESCOBA",
      saleUnit: "piece",
      quantity: 2,
      unitPrice: 50,
      priceTier: "retail",
      total: 100,
    },
    {
      id: "i2",
      saleId: "sale-1",
      productId: null,
      lineId: "pinol",
      productName: "Pinol (litro)",
      saleUnit: "liter",
      quantity: 3,
      unitPrice: 33.33,
      priceTier: "retail",
      total: 100,
    },
  ],
} as unknown as PosSale;

describe("devolución de cliente en la caja", () => {
  it("arma los renglones con lo que queda, sin contar dos veces lo que el servidor ya conoce", () => {
    const local: LocalReturnRecord[] = [
      {
        eventId: "ev-1",
        returnNumber: "DCL-SUC01-20261014-0001",
        returnedAt: "2026-10-14T19:00:00.000Z",
        total: 45,
        lines: [
          { saleUnit: "piece", productId: "escoba", lineId: null, saleUnitPrice: 50, quantity: 1, refund: 45 },
        ],
      },
    ];
    const withServer = {
      ...sale,
      returns: [
        {
          id: "r1",
          clientEventId: "ev-1",
          returnNumber: "DCL-SUC01-20261014-0001",
          total: 45,
          returnedAt: "2026-10-14T19:00:00.000Z",
          paymentMethod: "cash",
          items: [{ id: "ri", saleItemId: "i1", quantity: 1, total: 45 }],
        },
      ],
    } as unknown as PosSale;

    const rows = returnableRows(withServer, returnedLines(withServer, local));
    const escoba = rows.find((row) => row.productId === "escoba")!;
    expect(escoba.returnedQuantity).toBe(1);
    expect(escoba.remaining).toBe(1);
  });

  it("regresa lo pagado con el descuento y fuerza merma en litros", () => {
    const rows = returnableRows(sale, []);
    const escoba = rows.find((row) => row.productId === "escoba")!;
    const pinol = rows.find((row) => row.lineId === "pinol")!;
    const { event, total, record } = buildCustomerReturn(
      {
        sale,
        rows,
        selections: {
          [escoba.key]: { quantity: 1, reason: POS_RETURN_REASONS.WRONG_PRODUCT, restock: true },
          [pinol.key]: { quantity: 3, reason: POS_RETURN_REASONS.DEFECTIVE, restock: true },
        },
        returnNumber: "DCL-SUC01-20261014-0002",
        returnedAt: new Date("2026-10-15T15:00:00.000Z"),
        notes: null,
        recordedOffline: true,
        serverSaleId: null,
      },
      "ev-2",
    );
    // 100 × 0.9 / 2 = 45; los 3 L completos = 100 × 0.9 = 90.
    expect(total).toBe(135);
    const items = (event.payload as { items: Array<{ restock: boolean; refund: number }> }).items;
    expect(items.map((item) => item.refund)).toEqual([45, 90]);
    expect(items.map((item) => item.restock)).toEqual([true, false]);
    expect(record.lines).toHaveLength(2);
  });

  it("bloquea anulados, a domicilio y fuera de plazo (salvo administrador)", () => {
    const options = { isAdmin: false, branchId: "branch-1", today: "20261014" };
    expect(returnBlocker({ ...sale, status: "voided" } as PosSale, options)).toMatch(/anulado/);
    expect(returnBlocker({ ...sale, kind: "home_delivery" } as PosSale, options)).toMatch(/domicilio/);
    expect(returnBlocker(sale, { ...options, branchId: "otra" })).toMatch(/otra sucursal/);
    expect(returnBlocker(sale, { ...options, today: "20261022" })).toMatch(/más de 7 días/);
    expect(returnBlocker(sale, { ...options, today: "20261022", isAdmin: true })).toBeNull();
    expect(returnBlocker(sale, options)).toBeNull();
  });
});
