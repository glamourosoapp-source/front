import { z } from "zod";
import { OPPORTUNITY_MAP } from "../constants";

/**
 * Mapa de oportunidad (`/api/opportunity-map`): dónde hay demanda a domicilio
 * sin sucursal cerca. Spec: docs/product-specs/mapa-oportunidad.md.
 */
export const opportunityMapQuerySchema = z.object({
  /** Ventana de pedidos a domicilio que cuentan como demanda. */
  days: z.coerce
    .number()
    .int()
    .refine((value) => (OPPORTUNITY_MAP.DAY_OPTIONS as readonly number[]).includes(value), "Periodo no válido")
    .default(OPPORTUNITY_MAP.DEFAULT_DAYS),
  /** Radio de influencia de una tienda: "demanda sin tienda a menos de N km". */
  radiusKm: z.coerce
    .number()
    .refine((value) => (OPPORTUNITY_MAP.RADIUS_OPTIONS as readonly number[]).includes(value), "Radio no válido")
    .default(OPPORTUNITY_MAP.DEFAULT_RADIUS_KM),
});

/** Ubicar en el mapa los domicilios y sucursales que aún no tienen coordenadas (Google Geocoding). */
export const opportunityGeocodeSchema = z.object({
  limit: z.coerce.number().int().min(1).max(OPPORTUNITY_MAP.GEOCODE_MAX_BATCH).default(OPPORTUNITY_MAP.GEOCODE_MAX_BATCH),
});

/** Contar negocios objetivo (Google Places) alrededor de las mejores zonas del mapa. */
export const opportunityBusinessScanSchema = opportunityMapQuerySchema.extend({
  top: z.coerce.number().int().min(1).max(OPPORTUNITY_MAP.MAX_ZONES).default(OPPORTUNITY_MAP.DEFAULT_SCAN_ZONES),
});

export type OpportunityMapQuery = z.infer<typeof opportunityMapQuerySchema>;
export type OpportunityGeocodeInput = z.infer<typeof opportunityGeocodeSchema>;
export type OpportunityBusinessScanInput = z.infer<typeof opportunityBusinessScanSchema>;

export type OpportunityBusinessCategory = (typeof OPPORTUNITY_MAP.BUSINESS_CATEGORIES)[number]["key"];

/** Demanda a domicilio de un área: clientes distintos, pedidos e importe del periodo. */
export interface OpportunityDemand {
  customers: number;
  orders: number;
  revenue: number;
}

export interface OpportunityBranch {
  id: string;
  code: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  /** Venta promedio por semana en caja (últimas 4 semanas); null si aún no vende. */
  weeklySales: number | null;
  /** Demanda a domicilio dentro del radio de la tienda. */
  catchment: OpportunityDemand;
}

/** Celda del mapa de calor (~1 km): solo celdas con al menos un domicilio. */
export interface OpportunityCell {
  lat: number;
  lng: number;
  /** Medio lado de la celda en grados, para pintar el cuadro. */
  halfLat: number;
  halfLng: number;
  customers: number;
  orders: number;
  revenue: number;
}

export interface OpportunityZone {
  id: string;
  rank: number;
  lat: number;
  lng: number;
  /** Colonia más frecuente de los domicilios del centro de la zona. */
  label: string;
  city: string;
  score: number;
  demand: OpportunityDemand;
  nearestBranch: { code: string; name: string; distanceKm: number } | null;
  /** Negocios objetivo a la redonda; null si aún no se han contado. */
  businesses: {
    counts: Record<OpportunityBusinessCategory, number>;
    /** Alguna categoría llegó al tope de la búsqueda (hay "60 o más"). */
    capped: boolean;
    scannedAt: string;
  } | null;
  /** Venta semanal estimada para una tienda aquí; null sin tiendas comparables. */
  estimatedWeeklySales: number | null;
  similarBranches: Array<{ code: string; name: string; weeklySales: number; catchmentRevenue: number }>;
}

export interface OpportunityCoverage {
  /** Domicilios con pedidos en el periodo. */
  locations: number;
  located: number;
  /** Aún no se han buscado en Google. */
  pending: number;
  /** Google no encontró la dirección. */
  notFound: number;
  branches: number;
  branchesLocated: number;
  /** Sucursales que no aparecen en el mapa y por qué. */
  branchesMissing: Array<{ code: string; name: string; reason: "sin_direccion" | "pendiente" | "no_encontrada" }>;
}

export interface OpportunityMapResponse {
  generatedAt: string;
  days: number;
  radiusKm: number;
  coverage: OpportunityCoverage;
  totals: OpportunityDemand;
  branches: OpportunityBranch[];
  cells: OpportunityCell[];
  zones: OpportunityZone[];
  /** Pesos de venta semanal en caja por peso semanal de demanda a domicilio alrededor. */
  model: { salesPerDemand: number | null; branchesWithData: number };
}

export interface OpportunityGeocodeResponse {
  located: number;
  notFound: number;
  /** Direcciones que siguen sin buscar (se procesan por tandas). */
  remaining: number;
  /**
   * Motivo por el que Google cortó la tanda (clave sin facturación, cupo…).
   * No se llama `error`: el formateador de respuestas deja sin envolver todo
   * payload con esa llave.
   */
  stoppedReason: string | null;
}

export interface OpportunityBusinessScanResponse {
  zones: number;
  /** Búsquedas nuevas a Google Places (lo demás salió de la caché de 30 días). */
  searches: number;
  cached: number;
  /** Motivo por el que Google cortó el conteo (ver OpportunityGeocodeResponse). */
  stoppedReason: string | null;
}
