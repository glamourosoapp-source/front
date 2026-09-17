import type { Branch } from "@/types";
import type { PosSale } from "@/types";

/**
 * Venta de muestra para la vista previa y la impresión de prueba.
 *
 * Trae las dos formas de partida que existen en la caja (litros sueltos con
 * desglose de bidones y un artículo por pieza), un descuento y un cambio, para
 * que la vista previa muestre todos los renglones que puede tener un ticket.
 */
export function sampleSale(options: {
  branch?: Branch | null;
  cashierName?: string | null;
  customerName?: string | null;
}): PosSale {
  const { branch, cashierName, customerName } = options;
  return {
    id: "sample",
    branchId: branch?.id ?? "",
    branch: branch ?? undefined,
    ticketNumber: `${branch?.code ?? "SUC01"}-PRUEBA-0001`,
    cashierUserId: "sample-cashier",
    cashier: { id: "sample-cashier", name: cashierName || "María López" },
    customer: customerName ? ({ name: customerName } as PosSale["customer"]) : null,
    status: "completed",
    subtotal: 303,
    discount: 0,
    total: 303,
    paymentMethod: "cash",
    amountTendered: 350,
    changeAmount: 47,
    itemsCount: 26,
    soldAt: new Date().toISOString(),
    items: [
      {
        id: "s1",
        saleId: "sample",
        productName: "Mas Color (litro)",
        sku: "GRANEL",
        saleUnit: "liter",
        quantity: 25,
        unitPrice: 16,
        priceTier: "retail",
        total: 258,
        pricingBreakdown: { bidones: 1, restLiters: 5, bidonPrice: 178, literPrice: 16 },
      },
      {
        id: "s2",
        saleId: "sample",
        productName: "Escoba de plástico",
        sku: "ESC-PLA-01",
        saleUnit: "piece",
        quantity: 1,
        unitPrice: 45,
        priceTier: "retail",
        total: 45,
      },
    ],
  } as PosSale;
}
