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

/** Celdas del bloque de domicilio de la nota impresa y del export del pedido. */
export interface OrderNoteAddress {
  street: string;
  colony: string;
  city: string;
  postalCode: string;
}

export interface OrderNoteAddressSource {
  /** Domicilio guardado que se eligió al capturar el pedido, si lo hubo. */
  deliveryLocation?: CustomerLocationAddressParts | null;
  customer?: CustomerAddressParts | null;
}

/**
 * Domicilio que va en el bloque "Calle y número / Colonia / Municipio / CP" de
 * la nota. Si el pedido eligió un domicilio guardado, son las partes de ESE
 * domicilio: el cliente puede tener varios y la nota tiene que corresponder al
 * que se entrega, aunque el principal cacheado en el cliente sea otro. Un
 * domicilio elegido solo por pin (sin calle) deja las celdas vacías a propósito;
 * la fila "Dirección de entrega" ya trae el link. Sin domicilio elegido, cae al
 * del cliente (con el `address` plano legado como calle, igual que siempre).
 */
export function orderNoteAddress(order: OrderNoteAddressSource): OrderNoteAddress {
  const location = order.deliveryLocation;
  if (location) {
    return {
      street: location.street?.trim() || "",
      colony: location.colony?.trim() || "",
      city: location.city?.trim() || "",
      postalCode: location.postalCode?.trim() || "",
    };
  }
  const customer = order.customer;
  return {
    street: customer?.street?.trim() || customer?.address?.trim() || "",
    colony: customer?.colony?.trim() || "",
    city: customer?.city?.trim() || "",
    postalCode: customer?.postalCode?.trim() || "",
  };
}
