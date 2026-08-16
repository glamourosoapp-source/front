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

/**
 * Reglas de la contraseña que elige el propio usuario (cambio obligatorio o
 * voluntario). Son más estrictas que las de `loginSchema` / `createUserSchema`
 * a propósito: el admin puede dar una contraseña temporal simple, pero la que
 * el usuario se queda tiene que ser segura.
 */
export const PASSWORD_MIN_LENGTH = 8;
/** Límite de argon2id sobre el password en bytes. */
export const PASSWORD_MAX_LENGTH = 72;

export const passwordRules = [
  {
    id: "length",
    label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (value: string) => value.length >= PASSWORD_MIN_LENGTH,
  },
  { id: "lowercase", label: "Una letra minúscula", test: (value: string) => /[a-z]/.test(value) },
  { id: "uppercase", label: "Una letra mayúscula", test: (value: string) => /[A-Z]/.test(value) },
  { id: "number", label: "Un número", test: (value: string) => /\d/.test(value) },
] as const;

export interface PasswordRuleResult {
  id: string;
  label: string;
  ok: boolean;
}

/** Estado regla por regla, para pintar el checklist en vivo en el front. */
export function evaluatePasswordRules(value: string): PasswordRuleResult[] {
  return passwordRules.map((rule) => ({ id: rule.id, label: rule.label, ok: rule.test(value) }));
}

export function isStrongPassword(value: string): boolean {
  return passwordRules.every((rule) => rule.test(value));
}

export const strongPasswordSchema = z
  .string()
  .max(PASSWORD_MAX_LENGTH)
  .superRefine((value, ctx) => {
    for (const rule of passwordRules) {
      if (!rule.test(value)) ctx.addIssue({ code: "custom", message: rule.label });
    }
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: strongPasswordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"],
    message: "La nueva contraseña debe ser distinta de la actual",
  });
