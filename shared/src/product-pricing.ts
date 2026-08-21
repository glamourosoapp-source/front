import { PRICING_TIERS, type PricingTier } from "./constants";

export interface ProductPriceSource {
  price: number | string;
  wholesalePrice?: number | string | null;
}

export interface ResolvedProductPrice {
  unitPrice: number;
  /**
   * Lista realmente aplicada. Pedir mayoreo sobre un producto sin precio de
   * mayoreo cargado cae a menudeo: es el precio que se cobra, así que la
   * partida tampoco debe quedar marcada como mayoreo.
   */
  appliedTier: PricingTier;
}

/** true si el producto tiene precio de mayoreo cargado (>0). */
export function hasWholesalePrice(product: ProductPriceSource): boolean {
  return Number(product.wholesalePrice ?? 0) > 0;
}

/**
 * Precio unitario y lista aplicada para un producto en una lista dada. Es la
 * única fuente del precio: la usan el alta del panel, el Back al resolver
 * partidas y el prellenado de borradores.
 */
export function resolveProductPricing(
  product: ProductPriceSource,
  tier: PricingTier = PRICING_TIERS.RETAIL
): ResolvedProductPrice {
  const retail = Number(product.price || 0);
  const wholesale = Number(product.wholesalePrice ?? 0);
  if (tier === PRICING_TIERS.WHOLESALE && wholesale > 0) {
    return { unitPrice: wholesale, appliedTier: PRICING_TIERS.WHOLESALE };
  }
  return { unitPrice: retail, appliedTier: PRICING_TIERS.RETAIL };
}

export function resolveProductUnitPrice(
  product: ProductPriceSource,
  tier: PricingTier = PRICING_TIERS.RETAIL
): number {
  return resolveProductPricing(product, tier).unitPrice;
}
