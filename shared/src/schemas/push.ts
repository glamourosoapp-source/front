import { z } from "zod";

/** Apps móviles que reciben notificaciones push. */
export const PUSH_DEVICE_APPS = ["fabrica"] as const;

/** La app registra el token de Expo del teléfono para recibir avisos. */
export const registerPushDeviceSchema = z.object({
  token: z
    .string()
    .max(255)
    .regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, "Token de Expo inválido"),
  app: z.enum(PUSH_DEVICE_APPS),
  platform: z.enum(["ios", "android"]).nullable().optional(),
});

/** Al salir de la app: ese teléfono deja de recibir avisos. */
export const unregisterPushDeviceSchema = z.object({
  token: z.string().max(255),
});
