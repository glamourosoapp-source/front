import { z } from "zod";

export const createCustomerTagSchema = z.object({
  name: z.string().min(2).max(60),
  color: z.string().default("#06a6e0"),
});
