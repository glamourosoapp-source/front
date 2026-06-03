import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  organizationName: z.string().min(2).max(120).default("Glamouroso"),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(6),
});
