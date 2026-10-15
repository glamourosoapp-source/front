import { describe, expect, it } from "bun:test";
import { CONTAINER_UNIT_PRICE, PRICING_TIERS } from "@glamouroso/shared/constants";
import type { PosCatalog } from "@/types";
import { deliveryContainers, type PosLine } from "./ticket";

const catalog = {
  version: "v",
  products: [
    { id: "cloro20", name: "CLORO 20 LITROS", unit: "litro", price: 200, stock: null, returnableContainer: true },
    { id: "cloro4", name: "CLORO 4 LITROS", unit: "litro", price: 55, stock: null, returnableContainer: false },
    { id: "escoba", name: "ESCOBA", unit: "pieza", price: 45, stock: null },
  ],
  lines: [],
} as unknown as PosCatalog;

function piece(productId: string, quantity: number): PosLine {
  return {
    key: productId,
    kind: "piece",
    productId,
    lineId: null,
    code: productId,
    name: productId,
    unit: "pieza",
    quantity,
    priceTier: PRICING_TIERS.RETAIL,
  };
}

describe("deliveryContainers", () => {
  it("cobra 1 bidón por pieza de un producto que lo lleva, como el CRM", () => {
    const result = deliveryContainers([piece("cloro20", 3), piece("cloro4", 2), piece("escoba", 1)], catalog);
    expect(result).toEqual({ count: 3, fee: 3 * CONTAINER_UNIT_PRICE });
  });

  it("sin productos de 20 L, o sin catálogo, no cobra bidones", () => {
    expect(deliveryContainers([piece("escoba", 4)], catalog)).toEqual({ count: 0, fee: 0 });
    expect(deliveryContainers([piece("cloro20", 1)], null)).toEqual({ count: 0, fee: 0 });
  });
});
