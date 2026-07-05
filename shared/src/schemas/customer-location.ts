import { z } from "zod";
import { MAX_CUSTOMER_LOCATIONS } from "../constants";
import { isValidGoogleMapsUrl } from "../utils/google-maps-url";

const optionalString = z.union([z.string(), z.literal(""), z.null()]).optional();

const googleMapsUrlField = z
  .union([z.string().url(), z.literal(""), z.null()])
  .optional()
  .refine((value) => !value || value === "" || isValidGoogleMapsUrl(value), {
    message: "URL de Google Maps no válida",
  });

const locationFields = {
  label: optionalString,
  street: optionalString,
  colony: optionalString,
  postalCode: z.union([z.string().max(10), z.literal(""), z.null()]).optional(),
  city: optionalString,
  zone: optionalString,
  reference: optionalString,
  googleMapsUrl: googleMapsUrlField,
  latitude: z.union([z.number().min(-90).max(90), z.null()]).optional(),
  longitude: z.union([z.number().min(-180).max(180), z.null()]).optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(MAX_CUSTOMER_LOCATIONS - 1).optional(),
};

function hasMinimumLocationData(data: {
  street?: string | null;
  colony?: string | null;
  city?: string | null;
  googleMapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  const hasStructured =
    Boolean(data.street?.trim()) && Boolean(data.colony?.trim()) && Boolean(data.city?.trim());
  const hasMaps = isValidGoogleMapsUrl(data.googleMapsUrl);
  const hasCoords =
    data.latitude != null &&
    data.longitude != null &&
    !Number.isNaN(data.latitude) &&
    !Number.isNaN(data.longitude);
  return hasStructured || hasMaps || hasCoords;
}

export const createCustomerLocationSchema = z
  .object(locationFields)
  .superRefine((data, ctx) => {
    if (!hasMinimumLocationData(data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Indica calle, colonia y ciudad, o una URL de Google Maps, o coordenadas de ubicación",
      });
    }
  });

export const updateCustomerLocationSchema = z
  .object({
    label: locationFields.label,
    street: locationFields.street,
    colony: locationFields.colony,
    postalCode: locationFields.postalCode,
    city: locationFields.city,
    zone: locationFields.zone,
    reference: locationFields.reference,
    googleMapsUrl: locationFields.googleMapsUrl,
    latitude: locationFields.latitude,
    longitude: locationFields.longitude,
    isDefault: locationFields.isDefault,
    sortOrder: locationFields.sortOrder,
  })
  .superRefine((data, ctx) => {
    const hasAnyField = Object.values(data).some((v) => v !== undefined);
    if (!hasAnyField) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No hay campos para actualizar" });
    }
  });

export type CreateCustomerLocationInput = z.infer<typeof createCustomerLocationSchema>;
export type UpdateCustomerLocationInput = z.infer<typeof updateCustomerLocationSchema>;
