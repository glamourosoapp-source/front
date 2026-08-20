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

export interface CustomerLocationAddressParts extends CustomerAddressParts {
  /** Referencia de la ubicación (equivale a `address` de la dirección plana). */
  reference?: string | null;
  /** Dirección ya formateada por la API, si viene. */
  formattedAddress?: string | null;
  googleMapsUrl?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

/**
 * Link para abrir la ubicación en Google Maps: el guardado del cliente o, si
 * solo mandó su pin, uno armado con las coordenadas. Cadena vacía si no hay.
 */
export function customerLocationMapsUrl(location: CustomerLocationAddressParts): string {
  const maps = location.googleMapsUrl?.trim();
  if (maps) return maps;
  if (location.latitude != null && location.longitude != null) {
    return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
  }
  return "";
}

/**
 * Texto de entrega de una ubicación guardada del cliente. Usa la dirección
 * estructurada y, cuando la ubicación se capturó solo como pin o link de Maps
 * (sin calle/colonia), cae al link para que quien entrega pueda abrirlo.
 */
export function formatCustomerLocationAddress(location: CustomerLocationAddressParts): string {
  const formatted = (
    location.formattedAddress?.trim() ||
    formatCustomerDeliveryAddress({
      street: location.street,
      colony: location.colony,
      postalCode: location.postalCode,
      city: location.city,
      zone: location.zone,
      address: location.address ?? location.reference,
    })
  ).trim();
  if (formatted) return formatted;
  return customerLocationMapsUrl(location);
}
