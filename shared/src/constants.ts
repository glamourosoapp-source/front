export const ROLES = {
  ASSISTANT: "assistant",
  ADMIN: "admin",
  ORG_ADMIN: "org_admin",
  SYSTEM_ADMIN: "system_admin",
  /** Usuario sistema del agente IA de WhatsApp; no inicia sesión ni se lista. */
  AGENT: "agent",
} as const;

/** Roles con acceso a configuracion del sistema (Kapso, webhook, IA). */
export const ADMIN_ROLES: string[] = [ROLES.ADMIN, ROLES.ORG_ADMIN, ROLES.SYSTEM_ADMIN];

export const ORDER_STATUS = {
  /** Pedido guardado sin confirmar (pendiente de aprobación del cliente); folio serie BOR-. */
  DRAFT: "draft",
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
  REPLIED: "replied",
  CONVERTED: "converted",
  FAILED: "failed",
  /** Agotó los toques de seguimiento sin responder: fuera del pipeline activo. */
  EXHAUSTED: "exhausted",
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

/** Motivo por el que un teléfono está en la lista de exclusión (no contactar en frío). */
export const SUPPRESSION_REASON = {
  /** El contacto pidió que no le escribamos ("ya no me escribas", "baja"). Permanente. */
  OPT_OUT: "opt_out",
  /** Agregado a mano desde el dashboard. */
  MANUAL: "manual",
  /** Meta/Kapso rechazó el número de forma definitiva. */
  PROVIDER_BLOCK: "provider_block",
} as const;

/** Estado de un envío frío en la cola del guardián de outbound. */
export const OUTBOUND_SEND_STATUS = {
  QUEUED: "queued",
  SENT: "sent",
  FAILED: "failed",
  /** Descartado por lista de exclusión (al encolar o al drenar). */
  SUPPRESSED: "suppressed",
  /** Descartado porque su contexto (p. ej. campaña) se canceló. */
  CANCELLED: "cancelled",
} as const;

/** Flujo que originó un envío frío. */
export const OUTBOUND_CONTEXT = {
  PROSPECT_OUTREACH: "prospect_outreach",
  CAMPAIGN: "campaign",
  REACTIVATION: "reactivation",
} as const;

/** Audiencia de una campaña: prospectos fríos o clientes existentes (reactivación). */
export const CAMPAIGN_AUDIENCE = {
  PROSPECTS: "prospects",
  CUSTOMERS: "customers",
} as const;

export const DEFAULT_PROSPECT_VOICE_SCRIPT =
  "Hola, le llamamos de Glamouroso para presentarle nuestros productos y servicios. Si le interesa recibir mas informacion, puede devolvernos la llamada o escribirnos por WhatsApp. Gracias por su tiempo.";

export const NOTIFICATION_TYPES = {
  CONVERSATION_HANDOFF: "conversation_handoff",
  ORDER_CREATED: "order_created",
  ORDER_STATUS_CHANGED: "order_status_changed",
  CAMPAIGN_COMPLETED: "campaign_completed",
  /** El guardián pausó los envíos fríos (breaker por tasa de fallos o pausa manual). */
  OUTREACH_PAUSED: "outreach_paused",
  /** El quality rating del número de WhatsApp se degradó (amarillo/rojo). */
  WHATSAPP_QUALITY_ALERT: "whatsapp_quality_alert",
} as const;

/** Path del gateway WebSocket del Back (mismo host que la API). */
export const REALTIME_WS_PATH = "/api/ws";

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

/** Precio del bidón (envase retornable de presentaciones 20L). Futuro: mover a organizations.brand_settings. */
export const CONTAINER_UNIT_PRICE = 25;

/** Acciones disponibles por módulo para perfiles de permisos. */
export const PERMISSION_ACTIONS = ["view", "create", "update", "delete"] as const;

/** Alcance de lectura/edición: toda la org, solo su equipo, o solo lo creado por el usuario. */
export const ORDER_SCOPES = {
  ALL: "all",
  OWN: "own",
  TEAM: "team",
} as const;

/** Módulos del Dashboard sobre los que un perfil define permisos. */
export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Overview" },
  { key: "orders", label: "Pedidos" },
  { key: "orderPrint", label: "Pedidos: imprimir notas" },
  { key: "customers", label: "Clientes" },
  { key: "products", label: "Catalogo" },
  { key: "productCosts", label: "Catalogo: precio de costo" },
  { key: "conversations", label: "Conversaciones" },
  { key: "prospects", label: "Prospección: buscar negocios" },
  { key: "outreach", label: "Prospección: contactar y seguimiento" },
  { key: "reactivation", label: "Reactivación: clientes inactivos" },
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
export type SuppressionReason = (typeof SUPPRESSION_REASON)[keyof typeof SUPPRESSION_REASON];
export type OutboundSendStatus = (typeof OUTBOUND_SEND_STATUS)[keyof typeof OUTBOUND_SEND_STATUS];
export type OutboundContext = (typeof OUTBOUND_CONTEXT)[keyof typeof OUTBOUND_CONTEXT];
export type CampaignAudience = (typeof CAMPAIGN_AUDIENCE)[keyof typeof CAMPAIGN_AUDIENCE];
export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
export type NotificationEntityType =
  (typeof NOTIFICATION_ENTITY_TYPES)[keyof typeof NOTIFICATION_ENTITY_TYPES];
export type PricingTier = (typeof PRICING_TIERS)[keyof typeof PRICING_TIERS];
