import { z } from "zod";

export const toggleAgentSchema = z.object({
  isAgentActive: z.boolean(),
});

export const attachmentSchema = z.object({
  dataBase64: z.string().min(1),
  mimeType: z.string().min(1),
  fileName: z.string().optional(),
});

export const sendMessageSchema = z
  .object({
    text: z.string().optional(),
    attachment: attachmentSchema.optional(),
  })
  .refine((data) => (data.text && data.text.trim().length > 0) || data.attachment, {
    message: "Escribe un mensaje o adjunta un archivo",
    path: ["text"],
  });
