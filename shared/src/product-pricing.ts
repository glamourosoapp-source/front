import { PRICING_TIERS, type PricingTier } from "./constants";

export interface ProductPriceSource {
  price: number | string;
  wholesalePrice?: number | string | null;
}

export function resolveProductUnitPrice(
  product: ProductPriceSource,
  tier: PricingTier = PRICING_TIERS.RETAIL
): number {
  const retail = Number(product.price || 0);
  const wholesale = Number(product.wholesalePrice ?? 0);
  if (tier === PRICING_TIERS.WHOLESALE && wholesale > 0) return wholesale;
  return retail;
}
