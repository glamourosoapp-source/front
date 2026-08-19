import { z } from "zod";
import { ROLES } from "../constants";

const assignableRoles = [ROLES.ASSISTANT, ROLES.ADMIN, ROLES.ORG_ADMIN] as const;

const userPayload = {
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.union([z.string().min(7).max(24), z.literal(""), z.null()]).optional(),
  password: z.string().min(6).max(72),
  profileId: z.union([z.string().uuid(), z.null()]).optional(),
  teamId: z.union([z.string().uuid(), z.null()]).optional(),
  role: z.enum(assignableRoles).optional(),
};

export const createUserSchema = z.object(userPayload);

export const updateUserSchema = z.object({
  name: userPayload.name.optional(),
  email: userPayload.email.optional(),
  phone: userPayload.phone,
  password: z.union([userPayload.password, z.literal(""), z.null()]).optional(),
  profileId: userPayload.profileId,
  teamId: userPayload.teamId,
  isActive: z.boolean().optional(),
  role: userPayload.role,
});
