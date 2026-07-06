import { z } from "zod";
import { ORDER_SCOPES, PERMISSION_MODULES } from "../constants";

const moduleKeys = PERMISSION_MODULES.map((module) => module.key) as [string, ...string[]];

const modulePermissionsSchema = z
  .object({
    view: z.boolean().optional(),
    create: z.boolean().optional(),
    update: z.boolean().optional(),
    delete: z.boolean().optional(),
    scope: z.enum([ORDER_SCOPES.ALL, ORDER_SCOPES.OWN]).optional(),
  })
  .strict();

export const permissionsSchema = z.record(z.enum(moduleKeys), modulePermissionsSchema);

export const createProfileSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.union([z.string().max(255), z.literal(""), z.null()]).optional(),
  permissions: permissionsSchema.default({}),
});

export const updateProfileSchema = z.object({
  name: createProfileSchema.shape.name.optional(),
  description: createProfileSchema.shape.description,
  permissions: permissionsSchema.optional(),
});
