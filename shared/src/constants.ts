export const ROLES = {
  ASSISTANT: "assistant",
  ADMIN: "admin",
  ORG_ADMIN: "org_admin",
  SYSTEM_ADMIN: "system_admin",
} as const;

/** Roles con acceso a configuracion del sistema (Kapso, webhook, IA). */
export const ADMIN_ROLES: string[] = [ROLES.ADMIN, ROLES.ORG_ADMIN, ROLES.SYSTEM_ADMIN];

export const ORDER_STATUS = {
  NEW: "new",
  PROCESSING: "processing",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export const PAYMENT_STATUS = {
  UNPAID: "unpaid",
  PAID: "paid",
  PARTIAL: "partial",
  REFUNDED: "refunded",
} as const;

export const CONVERSATION_STATUS = {
  ACTIVE: "active",
  HUMAN: "human",
  CLOSED: "closed",
} as const;

export const CAMPAIGN_STATUS = {
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  SENDING: "sending",
  SENT: "sent",
  PAUSED: "paused",
  CANCELLED: "cancelled",
} as const;

export const PROSPECT_STATUS = {
  NEW: "new",
  CONTACTED_WHATSAPP: "contacted_whatsapp",
  CONTACTED_VOICE: "contacted_voice",
  FAILED: "failed",
} as const;

export const OUTREACH_CHANNEL = {
  WHATSAPP: "whatsapp",
  VOICE: "voice",
  BOTH: "both",
} as const;

export const OUTREACH_ATTEMPT_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
  COMPLETED: "completed",
} as const;

export const DEFAULT_PROSPECT_VOICE_SCRIPT =
  "Hola, le llamamos de Glamouroso para presentarle nuestros productos y servicios. Si le interesa recibir mas informacion, puede devolvernos la llamada o escribirnos por WhatsApp. Gracias por su tiempo.";

export const NOTIFICATION_TYPES = {
  CONVERSATION_HANDOFF: "conversation_handoff",
  ORDER_CREATED: "order_created",
  ORDER_STATUS_CHANGED: "order_status_changed",
  CAMPAIGN_COMPLETED: "campaign_completed",
} as const;

export const NOTIFICATION_ENTITY_TYPES = {
  CONVERSATION: "conversation",
  ORDER: "order",
  CAMPAIGN: "campaign",
} as const;

export const PRICING_TIERS = {
  RETAIL: "retail",
  WHOLESALE: "wholesale",
} as const;

/** Máximo de ubicaciones de entrega guardadas por cliente. */
export const MAX_CUSTOMER_LOCATIONS = 3;

/** Acciones disponibles por módulo para perfiles de permisos. */
export const PERMISSION_ACTIONS = ["view", "create", "update", "delete"] as const;

/** Alcance de lectura/edición de pedidos: todos los de la org o solo los creados por el usuario. */
export const ORDER_SCOPES = {
  ALL: "all",
  OWN: "own",
} as const;

/** Módulos del Dashboard sobre los que un perfil define permisos. */
export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Overview" },
  { key: "orders", label: "Pedidos" },
  { key: "customers", label: "Clientes" },
  { key: "products", label: "Catalogo" },
  { key: "conversations", label: "Conversaciones" },
  { key: "prospects", label: "Prospectos IA" },
  { key: "outreach", label: "Outreach" },
  { key: "agent", label: "Metricas IA" },
  { key: "faqs", label: "FAQs IA" },
  { key: "notifications", label: "Notificaciones" },
  { key: "settings", label: "Configuracion" },
  { key: "users", label: "Usuarios" },
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type OrderScope = (typeof ORDER_SCOPES)[keyof typeof ORDER_SCOPES];
export type PermissionModule = (typeof PERMISSION_MODULES)[number]["key"];

export type Role = (typeof ROLES)[keyof typeof ROLES];
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export type ConversationStatus = (typeof CONVERSATION_STATUS)[keyof typeof CONVERSATION_STATUS];
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];
export type ProspectStatus = (typeof PROSPECT_STATUS)[keyof typeof PROSPECT_STATUS];
export type OutreachChannel = (typeof OUTREACH_CHANNEL)[keyof typeof OUTREACH_CHANNEL];
export type OutreachAttemptStatus =
  (typeof OUTREACH_ATTEMPT_STATUS)[keyof typeof OUTREACH_ATTEMPT_STATUS];
export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
export type NotificationEntityType =
  (typeof NOTIFICATION_ENTITY_TYPES)[keyof typeof NOTIFICATION_ENTITY_TYPES];
export type PricingTier = (typeof PRICING_TIERS)[keyof typeof PRICING_TIERS];
