import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(2).max(80),
});

export const updateTeamSchema = createTeamSchema.partial();
