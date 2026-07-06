import { z } from "zod";
import { idSchema, paginationSchema } from "./common";
import { OUTREACH_CHANNEL, PROSPECT_STATUS } from "../constants";

const prospectStatusValues = [
  PROSPECT_STATUS.NEW,
  PROSPECT_STATUS.CONTACTED_WHATSAPP,
  PROSPECT_STATUS.CONTACTED_VOICE,
  PROSPECT_STATUS.FAILED,
] as const;

const outreachChannelRefine = (
  data: { channel: string; templateName?: string },
  ctx: z.RefinementCtx
) => {
  if (data.channel === OUTREACH_CHANNEL.WHATSAPP || data.channel === OUTREACH_CHANNEL.BOTH) {
    if (!data.templateName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "templateName es requerido para canal whatsapp o both",
        path: ["templateName"],
      });
    }
  }
};

export const prospectSchema = z.object({
  name: z.string().min(2).max(160),
  phone: z.union([z.string(), z.literal(""), z.null()]).optional(),
  address: z.union([z.string(), z.literal(""), z.null()]).optional(),
  city: z.union([z.string(), z.literal(""), z.null()]).optional(),
  businessType: z.union([z.string(), z.literal(""), z.null()]).optional(),
  source: z.string().default("manual"),
  externalPlaceId: z.union([z.string(), z.literal(""), z.null()]).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const createCampaignSchema = z.object({
  name: z.string().min(2).max(140),
  templateName: z.string().min(2).max(120),
  messagePreview: z.union([z.string(), z.literal(""), z.null()]).optional(),
  recipientIds: z.array(z.string().uuid()).default([]),
});

export const updateCampaignSchema = createCampaignSchema.partial();

export const prospectSearchSchema = z.object({
  businessType: z.string().min(2),
  city: z.string().min(2),
});

export const parsedProspectQuerySchema = z.object({
  businessType: z.string().min(2),
  city: z.string().min(2),
  zone: z.string().optional(),
  state: z.string().optional(),
  country: z.literal("MX").default("MX"),
});

export const prospectAiImportSchema = z.object({
  query: z.string().min(5).max(500),
  maxResults: z.number().int().min(1).max(60).default(60),
});

export const prospectBulkDeleteSchema = z.object({
  onlyNotContacted: z.boolean().default(true),
});

export const prospectBulkDeleteResponseSchema = z.object({
  deleted: z.number().int(),
});

export const prospectOutreachSchema = z
  .object({
    prospectIds: z.array(idSchema).min(1).max(60),
    channel: z.enum([
      OUTREACH_CHANNEL.WHATSAPP,
      OUTREACH_CHANNEL.VOICE,
      OUTREACH_CHANNEL.BOTH,
    ]),
    templateName: z.string().min(2).max(120).optional(),
    voiceScript: z.string().max(2000).optional(),
  })
  .superRefine(outreachChannelRefine);

export const prospectAiSearchSchema = z
  .object({
    query: z.string().min(5).max(500),
    channel: z.enum([
      OUTREACH_CHANNEL.WHATSAPP,
      OUTREACH_CHANNEL.VOICE,
      OUTREACH_CHANNEL.BOTH,
    ]),
    templateName: z.string().min(2).max(120).optional(),
    voiceScript: z.string().max(2000).optional(),
    maxResults: z.number().int().min(1).max(60).default(60),
  })
  .superRefine(outreachChannelRefine);

export const queryProspectSchema = paginationSchema.extend({
  status: z.enum(prospectStatusValues).optional(),
});

export const outreachResultSchema = z.object({
  sent: z.number().int(),
  failed: z.number().int(),
  details: z.array(
    z.object({
      prospectId: z.string().uuid(),
      status: z.string(),
      externalId: z.string().nullable().optional(),
      error: z.string().nullable().optional(),
    })
  ),
});

export const prospectImportResponseSchema = z.object({
  parsed: parsedProspectQuerySchema,
  imported: z.array(z.record(z.unknown())),
  skipped: z.object({
    noPhone: z.number().int(),
    duplicate: z.number().int(),
  }),
});

export const prospectAiSearchResponseSchema = prospectImportResponseSchema.extend({
  outreach: z.object({
    whatsapp: outreachResultSchema.optional(),
    voice: outreachResultSchema.optional(),
  }),
});

export const prospectOutreachResponseSchema = z.object({
  outreach: z.object({
    whatsapp: outreachResultSchema.optional(),
    voice: outreachResultSchema.optional(),
  }),
  skipped: z.object({
    alreadyContacted: z.number().int(),
    noPhone: z.number().int(),
  }),
  contacted: z.number().int(),
});

export const queryCampaignSchema = paginationSchema;

export const prospectMetricsResponseSchema = z.object({
  total: z.number().int(),
  byStatus: z.object({
    new: z.number().int(),
    contacted_whatsapp: z.number().int(),
    contacted_voice: z.number().int(),
    failed: z.number().int(),
  }),
  contactedToday: z.number().int(),
});

export const prospectOutreachAttemptSchema = z.object({
  id: z.string().uuid(),
  prospectId: z.string().uuid(),
  prospectName: z.string(),
  prospectPhone: z.string().nullable(),
  channel: z.string(),
  status: z.string(),
  error: z.string().nullable(),
  createdAt: z.string(),
});

export const prospectOutreachAttemptsResponseSchema = z.object({
  items: z.array(prospectOutreachAttemptSchema),
});

export type ProspectMetricsResponse = z.infer<typeof prospectMetricsResponseSchema>;
export type ProspectOutreachAttempt = z.infer<typeof prospectOutreachAttemptSchema>;
export type ProspectOutreachAttemptsResponse = z.infer<
  typeof prospectOutreachAttemptsResponseSchema
>;

export type ParsedProspectQuery = z.infer<typeof parsedProspectQuerySchema>;
export type ProspectAiImportInput = z.infer<typeof prospectAiImportSchema>;
export type ProspectBulkDeleteInput = z.infer<typeof prospectBulkDeleteSchema>;
export type ProspectBulkDeleteResponse = z.infer<typeof prospectBulkDeleteResponseSchema>;
export type ProspectOutreachInput = z.infer<typeof prospectOutreachSchema>;
export type ProspectAiSearchInput = z.infer<typeof prospectAiSearchSchema>;
export type ProspectImportResponse = z.infer<typeof prospectImportResponseSchema>;
export type ProspectAiSearchResponse = z.infer<typeof prospectAiSearchResponseSchema>;
export type ProspectOutreachResponse = z.infer<typeof prospectOutreachResponseSchema>;
export type OutreachResult = z.infer<typeof outreachResultSchema>;
