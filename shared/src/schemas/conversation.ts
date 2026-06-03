import { z } from "zod";

export const toggleAgentSchema = z.object({
  isAgentActive: z.boolean(),
});

export const sendMessageSchema = z.object({
  text: z.string().min(1),
});
