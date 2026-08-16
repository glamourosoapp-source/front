import { z } from "zod";
import { idSchema, paginationSchema } from "./common";
import {
  CAMPAIGN_AUDIENCE,
  OUTREACH_CHANNEL,
  PROSPECT_STATUS,
  SUPPRESSION_REASON,
} from "../constants";
import { isValidMexicanPhone } from "../utils/phone";

/** Teléfono opcional, pero si viene debe ser un número MX válido. */
const optionalMxPhoneSchema = z
  .union([z.string(), z.literal(""), z.null()])
  .optional()
  .superRefine((value, ctx) => {
    if (typeof value === "string" && value.trim() && !isValidMexicanPhone(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Teléfono inválido: usa 10 dígitos (ej. 3312345678)",
      });
    }
  });

const prospectStatusValues = [
  PROSPECT_STATUS.NEW,
  PROSPECT_STATUS.CONTACTED_WHATSAPP,
  PROSPECT_STATUS.CONTACTED_VOICE,
  PROSPECT_STATUS.REPLIED,
  PROSPECT_STATUS.CONVERTED,
  PROSPECT_STATUS.FAILED,
  PROSPECT_STATUS.EXHAUSTED,
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
  phone: optionalMxPhoneSchema,
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
  /** prospects = prospección fría; customers = reactivación de clientes. */
  audience: z.enum([CAMPAIGN_AUDIENCE.PROSPECTS, CAMPAIGN_AUDIENCE.CUSTOMERS]).default(CAMPAIGN_AUDIENCE.PROSPECTS),
  recipientIds: z.array(z.string().uuid()).default([]),
  scheduledAt: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
});

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z.enum(["draft", "scheduled", "paused", "cancelled"]).optional(),
});

export const reactivationSegmentQuerySchema = z.object({
  /** Días sin comprar para considerar inactivo a un cliente. */
  days: z.coerce.number().int().min(1).max(365).default(15),
  minOrders: z.coerce.number().int().min(1).max(100).default(1),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const reactivationCustomerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  lastOrderAt: z.string().nullable(),
  totalOrders: z.number().int(),
  daysInactive: z.number().int().nullable(),
});

export const reactivationSegmentResponseSchema = z.object({
  items: z.array(reactivationCustomerSchema),
  total: z.number().int(),
});

/** Rendimiento de una plantilla: cuánto se envió y cuánto respondió. */
export const templateStatsRowSchema = z.object({
  templateName: z.string(),
  sent: z.number().int(),
  failed: z.number().int(),
  queued: z.number().int(),
  replied: z.number().int(),
  /** Respuestas / enviados (0-1). */
  replyRate: z.number(),
  converted: z.number().int(),
  lastSentAt: z.string().nullable(),
});

export const templateStatsResponseSchema = z.object({
  items: z.array(templateStatsRowSchema),
  /** Ventana analizada en días. */
  days: z.number().int(),
});

export type TemplateStatsRow = z.infer<typeof templateStatsRowSchema>;
export type TemplateStatsResponse = z.infer<typeof templateStatsResponseSchema>;

/** Embudo del módulo Reactivación: inactivos → contactados → respondieron → recompraron. */
export const reactivationMetricsResponseSchema = z.object({
  inactive: z.number().int(),
  contacted: z.number().int(),
  replied: z.number().int(),
  repurchased: z.number().int(),
  revenueRecovered: z.number(),
  days: z.number().int(),
});

export type ReactivationMetricsResponse = z.infer<typeof reactivationMetricsResponseSchema>;

/** Métricas de una campaña: entrega, respuestas y pedidos atribuidos. */
export const campaignMetricsResponseSchema = z.object({
  recipients: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
  pending: z.number().int(),
  replied: z.number().int(),
  ordersAttributed: z.number().int(),
  revenueAttributed: z.number(),
});

export type ReactivationSegmentQuery = z.infer<typeof reactivationSegmentQuerySchema>;
export type ReactivationCustomer = z.infer<typeof reactivationCustomerSchema>;
export type ReactivationSegmentResponse = z.infer<typeof reactivationSegmentResponseSchema>;
export type CampaignMetricsResponse = z.infer<typeof campaignMetricsResponseSchema>;

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
    /** true = segundo toque: permite recontactar a los ya contactados sin respuesta. */
    followup: z.boolean().default(false),
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
  /** Ids separados por coma: "mostrar solo la última búsqueda". */
  ids: z.string().optional(),
  /** Segmentos calculados; followup_due = contactados sin respuesta con toque vencido. */
  segment: z.enum(["followup_due"]).optional(),
});

/** Alta masiva desde CSV parseado en el Front. */
export const prospectBulkCreateSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().min(2).max(160),
        phone: z.union([z.string(), z.literal(""), z.null()]).optional(),
        city: z.union([z.string(), z.literal(""), z.null()]).optional(),
        address: z.union([z.string(), z.literal(""), z.null()]).optional(),
        businessType: z.union([z.string(), z.literal(""), z.null()]).optional(),
      })
    )
    .min(1)
    .max(500),
});

export const prospectBulkCreateResponseSchema = z.object({
  imported: z.number().int(),
  skipped: z.object({
    noPhone: z.number().int(),
    duplicate: z.number().int(),
    suppressed: z.number().int(),
  }),
});

export type ProspectBulkCreateInput = z.infer<typeof prospectBulkCreateSchema>;
export type ProspectBulkCreateResponse = z.infer<typeof prospectBulkCreateResponseSchema>;

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
    /** Excluidos por la lista de "no contactar". */
    suppressed: z.number().int().default(0),
  }),
});

/** Resumen de lo que quedó en la cola del guardián tras encolar un batch. */
export const outboundQueueSummarySchema = z.object({
  queued: z.number().int(),
  scheduledToday: z.number().int(),
  scheduledLater: z.number().int(),
  /** Próximo horario de despacho del batch (ISO), si hay algo encolado. */
  nextScheduledAt: z.string().nullable(),
});

/**
 * Respuesta del outreach a prospectos. WhatsApp ya no envía en línea: encola
 * en el guardián (pacing + supresión); la voz sigue siendo síncrona.
 */
export const prospectOutreachResponseSchema = z.object({
  whatsapp: outboundQueueSummarySchema.optional(),
  voice: outreachResultSchema.optional(),
  skipped: z.object({
    alreadyContacted: z.number().int(),
    noPhone: z.number().int(),
    suppressed: z.number().int(),
    alreadyQueued: z.number().int(),
  }),
});

export const prospectAiSearchResponseSchema = prospectImportResponseSchema.extend({
  outreach: prospectOutreachResponseSchema.partial(),
});

export const queryCampaignSchema = paginationSchema.extend({
  audience: z.enum([CAMPAIGN_AUDIENCE.PROSPECTS, CAMPAIGN_AUDIENCE.CUSTOMERS]).optional(),
});

export const whatsappTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string(),
  status: z.string(),
  category: z.string(),
  bodyText: z.string().nullable(),
});

export const createWhatsappTemplateSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9_]+$/, "Usa solo minusculas, numeros y guiones bajos (ej: promo_mayoreo)"),
  language: z.string().min(2).max(15).default("es_MX"),
  category: z.enum(["MARKETING", "UTILITY"]).default("MARKETING"),
  bodyText: z.string().min(10).max(1024),
});

export type WhatsAppTemplateDto = z.infer<typeof whatsappTemplateSchema>;
export type CreateWhatsAppTemplateInput = z.infer<typeof createWhatsappTemplateSchema>;

export const prospectMetricsResponseSchema = z.object({
  total: z.number().int(),
  byStatus: z.object({
    new: z.number().int(),
    contacted_whatsapp: z.number().int(),
    contacted_voice: z.number().int(),
    replied: z.number().int(),
    converted: z.number().int(),
    failed: z.number().int(),
    exhausted: z.number().int(),
  }),
  contactedToday: z.number().int(),
  /** Acumulado: prospectos contactados alguna vez (no baja cuando responden). */
  everContacted: z.number().int(),
  /** Contactados sin respuesta con seguimiento vencido (motor del tab Seguimiento). */
  followupDue: z.number().int(),
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

const suppressionReasonValues = [
  SUPPRESSION_REASON.OPT_OUT,
  SUPPRESSION_REASON.MANUAL,
  SUPPRESSION_REASON.PROVIDER_BLOCK,
] as const;

export const createSuppressionSchema = z.object({
  phone: z.string().min(8).max(24),
  reason: z.enum(suppressionReasonValues).default(SUPPRESSION_REASON.MANUAL),
  notes: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
});

export const suppressionRowSchema = z.object({
  id: z.string().uuid(),
  phone: z.string(),
  reason: z.string(),
  source: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const suppressionsResponseSchema = z.object({
  items: z.array(suppressionRowSchema),
  total: z.number().int(),
});

/** Estado del guardián de outbound para la tarjeta "Salud del número". */
export const outreachHealthResponseSchema = z.object({
  paused: z.boolean(),
  pausedReason: z.string().nullable(),
  /** Cupo diario efectivo hoy (con warm-up aplicado). */
  dailyCap: z.number().int(),
  usedToday: z.number().int(),
  queuedTotal: z.number().int(),
  nextScheduledAt: z.string().nullable(),
  /** Rampa de calentamiento: en qué semana va y cuándo sube el cupo. */
  warmup: z.object({
    enabled: z.boolean(),
    effectiveCap: z.number().int(),
    maxCap: z.number().int(),
    week: z.number().int(),
    totalWeeks: z.number().int(),
    atFullCapacity: z.boolean(),
    startedAt: z.string().nullable(),
    nextIncreaseAt: z.string().nullable(),
    nextCap: z.number().int(),
  }),
  suppressedCount: z.number().int(),
  /** Último quality rating de Meta (GREEN/YELLOW/RED) o null sin snapshot. */
  qualityRating: z.string().nullable(),
  qualityCheckedAt: z.string().nullable(),
});

export const updateOutreachSettingsSchema = z.object({
  dailyCap: z.number().int().min(1).max(1000).optional(),
  perMinuteCap: z.number().int().min(1).max(30).optional(),
  paused: z.boolean().optional(),
  warmup: z
    .object({
      enabled: z.boolean().optional(),
      startCap: z.number().int().min(1).max(1000).optional(),
      weeklyIncrease: z.number().int().min(0).max(500).optional(),
      maxCap: z.number().int().min(1).max(1000).optional(),
    })
    .optional(),
  quietHours: z
    .object({
      start: z.number().int().min(0).max(23).optional(),
      end: z.number().int().min(0).max(23).optional(),
    })
    .optional(),
  followup: z
    .object({
      waitDays: z.number().int().min(1).max(30).optional(),
      maxTouches: z.number().int().min(1).max(5).optional(),
    })
    .optional(),
});

export type CreateSuppressionInput = z.infer<typeof createSuppressionSchema>;
export type SuppressionRow = z.infer<typeof suppressionRowSchema>;
export type SuppressionsResponse = z.infer<typeof suppressionsResponseSchema>;
export type OutreachHealthResponse = z.infer<typeof outreachHealthResponseSchema>;
export type UpdateOutreachSettingsInput = z.infer<typeof updateOutreachSettingsSchema>;
export type OutboundQueueSummary = z.infer<typeof outboundQueueSummarySchema>;

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
