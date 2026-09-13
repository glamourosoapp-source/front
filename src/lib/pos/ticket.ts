import { POS_SALE_UNITS, PRICING_TIERS } from "@glamouroso/shared/constants";
import type { PricingTier } from "@glamouroso/shared/constants";
import { priceBulkLiters, pricePieces } from "@glamouroso/shared/pos-pricing";
import type { PosCatalog, PosCatalogLine, PosCatalogProduct } from "@/types";

/**
 * Una partida del ticket en la caja.
 *
 * Dos formas, como en el servidor: `piece` es un envase del catálogo y `liter`
 * son litros sueltos servidos de una línea. Los precios que calcula este módulo
 * son **vista previa**: el importe que se cobra lo resuelve el Back.
 */
export interface PosLine {
  key: string;
  kind: "piece" | "liter";
  productId: string | null;
  lineId: string | null;
  /** Lo que se muestra en la columna Código: sku, código de barras o id del POS. */
  code: string;
  name: string;
  unit: string;
  quantity: number;
  priceTier: PricingTier;
}

export interface PricedLine extends PosLine {
  unitPrice: number;
  total: number;
  appliedTier: PricingTier;
  /**
   * Existencia de la sucursal: litros si la partida toca una línea, piezas si
   * no. `null` cuando el servidor no la manda —el cajero no ve inventario— o
   * cuando el producto ya no está en el catálogo cargado.
   */
  stock: number | null;
  stockUnit: "litro" | "pieza";
  /** Litros que descontará esta partida (envases de una línea también descuentan). */
  litersDeducted: number | null;
  breakdown: { bidones: number; restLiters: number; bidonPrice: number; literPrice: number } | null;
  /** Aviso para el cajero: pidió mayoreo y no hay precio de mayoreo cargado. */
  wholesaleFellBack: boolean;
}

export interface TicketTotals {
  subtotal: number;
  itemsCount: number;
  lines: PricedLine[];
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function productCode(product: PosCatalogProduct): string {
  return product.barcode || product.sku || product.posId || "";
}

/** Litros que representa una unidad del producto (para descontar de su línea). */
export function litersPerUnitOf(product: PosCatalogProduct): number | null {
  const liters = Number(product.litersPerUnit ?? 0);
  return Number.isFinite(liters) && liters > 0 ? liters : null;
}

export function lineFromProduct(product: PosCatalogProduct, tier: PricingTier, quantity = 1): PosLine {
  return {
    key: crypto.randomUUID(),
    kind: "piece",
    productId: product.id,
    lineId: product.lineId ?? null,
    code: productCode(product),
    name: product.name,
    unit: product.unit,
    quantity,
    priceTier: tier,
  };
}

export function lineFromBulk(line: PosCatalogLine, tier: PricingTier, liters: number): PosLine {
  return {
    key: crypto.randomUUID(),
    kind: "liter",
    productId: null,
    lineId: line.id,
    code: "GRANEL",
    name: `${line.name} (litro)`,
    unit: "litro",
    quantity: liters,
    priceTier: tier,
  };
}

/**
 * Precio e impacto en inventario de cada partida, con los mismos helpers que
 * usa el servidor (`priceBulkLiters` / `pricePieces` de shared), para que la
 * pantalla y el ticket coincidan con lo que se cobra.
 */
export function priceTicket(lines: PosLine[], catalog: PosCatalog | null): TicketTotals {
  const productById = new Map((catalog?.products ?? []).map((p) => [p.id, p]));
  const lineById = new Map((catalog?.lines ?? []).map((l) => [l.id, l]));

  const priced: PricedLine[] = lines.map((line) => {
    if (line.kind === "liter") {
      const catalogLine = lineById.get(line.lineId!);
      const bidon = { price: catalogLine?.bidonPrice ?? 0, wholesalePrice: catalogLine?.bidonWholesalePrice ?? null };
      const liter = { price: catalogLine?.literPrice ?? 0, wholesalePrice: catalogLine?.literWholesalePrice ?? null };
      const result = priceBulkLiters(
        line.quantity,
        bidon,
        liter,
        line.priceTier,
        Number(catalogLine?.litersPerBidon ?? 20)
      );
      return {
        ...line,
        unitPrice: result.literPrice,
        total: result.total,
        appliedTier: result.appliedTier,
        stock: catalogLine?.stockLiters == null ? null : Number(catalogLine.stockLiters),
        stockUnit: "litro",
        litersDeducted: round2(line.quantity),
        breakdown: {
          bidones: result.bidones,
          restLiters: result.restLiters,
          bidonPrice: result.bidonPrice,
          literPrice: result.literPrice,
        },
        wholesaleFellBack:
          line.priceTier === PRICING_TIERS.WHOLESALE && result.appliedTier === PRICING_TIERS.RETAIL,
      };
    }

    const product = productById.get(line.productId!);
    const result = pricePieces(
      line.quantity,
      { price: product?.price ?? 0, wholesalePrice: product?.wholesalePrice ?? null },
      line.priceTier
    );
    const liters = product ? litersPerUnitOf(product) : null;
    return {
      ...line,
      unitPrice: result.unitPrice,
      total: result.total,
      appliedTier: result.appliedTier,
      stock: product?.stock == null ? null : Number(product.stock),
      stockUnit: product?.lineId ? "litro" : "pieza",
      litersDeducted: product?.lineId && liters ? round2(line.quantity * liters) : null,
      breakdown: null,
      wholesaleFellBack:
        line.priceTier === PRICING_TIERS.WHOLESALE && result.appliedTier === PRICING_TIERS.RETAIL,
    };
  });

  return {
    subtotal: round2(priced.reduce((sum, line) => sum + line.total, 0)),
    itemsCount: round2(priced.reduce((sum, line) => sum + line.quantity, 0)),
    lines: priced,
  };
}

/** Cuerpo de `POST /pos/sales`: solo lo que el servidor acepta (nunca precios). */
export function salePayload(lines: PosLine[]) {
  return lines.map((line) => ({
    saleUnit: line.kind === "liter" ? POS_SALE_UNITS.LITER : POS_SALE_UNITS.PIECE,
    productId: line.kind === "piece" ? line.productId : null,
    lineId: line.kind === "liter" ? line.lineId : null,
    quantity: line.quantity,
    priceTier: line.priceTier,
  }));
}
