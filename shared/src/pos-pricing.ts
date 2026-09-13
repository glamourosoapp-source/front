import { BIDON_LITERS, PRICING_TIERS, type PricingTier } from "./constants";
import { resolveProductPricing, type ProductPriceSource } from "./product-pricing";

/** Desglose del cobro de litros sueltos servidos de una línea de líquido. */
export interface BulkLitersPrice {
  /** Importe total de la partida. */
  total: number;
  /** Bidones completos cobrados a precio de bidón. */
  bidones: number;
  /** Litros que sobran del último bidón, cobrados a precio de litro. */
  restLiters: number;
  /** Precio unitario del bidón aplicado (lista resuelta). */
  bidonPrice: number;
  /** Precio por litro aplicado (lista resuelta). */
  literPrice: number;
  /** Lista realmente aplicada: `wholesale` solo si AMBOS componentes la aplicaron. */
  appliedTier: PricingTier;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Cobro de litros sueltos de una línea de líquido.
 *
 * Regla del negocio: los litros se cobran al precio del SKU de 1 L, pero cada
 * 20 L completos se cobran al precio del SKU de bidón, que es más barato que
 * 20 litros sueltos. Ejemplos con Ajax Hespel ($16 el litro, $178 el bidón):
 * 7 L = $112, 20 L = $178, 25 L = $178 + 5 × $16 = $258.
 *
 * La presentación intermedia (4 L, 5 L, 10 L) NO interviene: el cliente que
 * quiere una garrafa cerrada compra ese producto como pieza.
 */
export function priceBulkLiters(
  liters: number,
  bidonProduct: ProductPriceSource,
  literProduct: ProductPriceSource,
  tier: PricingTier = PRICING_TIERS.RETAIL,
  litersPerBidon: number = BIDON_LITERS
): BulkLitersPrice {
  const bidon = resolveProductPricing(bidonProduct, tier);
  const liter = resolveProductPricing(literProduct, tier);
  const perBidon = litersPerBidon > 0 ? litersPerBidon : BIDON_LITERS;

  const safeLiters = Number.isFinite(liters) && liters > 0 ? liters : 0;
  const bidones = Math.floor(round2(safeLiters) / perBidon);
  const restLiters = round2(safeLiters - bidones * perBidon);
  const total = round2(bidones * bidon.unitPrice + restLiters * liter.unitPrice);

  return {
    total,
    bidones,
    restLiters,
    bidonPrice: bidon.unitPrice,
    literPrice: liter.unitPrice,
    appliedTier:
      bidon.appliedTier === PRICING_TIERS.WHOLESALE && liter.appliedTier === PRICING_TIERS.WHOLESALE
        ? PRICING_TIERS.WHOLESALE
        : PRICING_TIERS.RETAIL,
  };
}

/** Precio de una partida por pieza (envase cerrado del catálogo). */
export function pricePieces(
  quantity: number,
  product: ProductPriceSource,
  tier: PricingTier = PRICING_TIERS.RETAIL
): { total: number; unitPrice: number; appliedTier: PricingTier } {
  const { unitPrice, appliedTier } = resolveProductPricing(product, tier);
  return { total: round2(quantity * unitPrice), unitPrice, appliedTier };
}
