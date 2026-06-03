export interface CustomerAddressParts {
  street?: string | null;
  colony?: string | null;
  postalCode?: string | null;
  city?: string | null;
  zone?: string | null;
  address?: string | null;
}

export function formatCustomerDeliveryAddress(parts: CustomerAddressParts): string {
  const segments: string[] = [];

  if (parts.street?.trim()) segments.push(parts.street.trim());
  if (parts.colony?.trim()) segments.push(`Col. ${parts.colony.trim()}`);
  if (parts.postalCode?.trim()) segments.push(`CP ${parts.postalCode.trim()}`);
  if (parts.city?.trim()) segments.push(parts.city.trim());
  if (parts.zone?.trim()) segments.push(`Zona ${parts.zone.trim()}`);

  let result = segments.join(", ");
  if (parts.address?.trim()) {
    result = result ? `${result}. Ref: ${parts.address.trim()}` : `Ref: ${parts.address.trim()}`;
  }

  return result;
}
