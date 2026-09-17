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
  /**
   * Eliminado: la fila y el folio se conservan, pero el pedido se comporta como
   * si no existiera (fuera de listados, acumulados del cliente, dashboard y
   * atribución de campañas). Se llega solo por DELETE /orders/:id y se revierte
   * con POST /orders/:id/restore. No confundir con CANCELLED, que es un evento
   * de negocio y sí cuenta en el historial del cliente.
   */
  DELETED: "deleted",
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

/**
 * Catálogos del SAT para los datos de facturación del **cliente** (receptor
 * de un CFDI 4.0). `persons` dice a qué tipo de contribuyente aplica cada
 * clave: el RFC lo delata (12 caracteres = persona moral, 13 = física) y el
 * SAT rechaza el timbrado cuando no coinciden.
 */
export const SAT_TAX_REGIMES = [
  { code: "601", label: "General de Ley Personas Morales", persons: ["moral"] },
  { code: "603", label: "Personas Morales con Fines no Lucrativos", persons: ["moral"] },
  { code: "605", label: "Sueldos y Salarios e Ingresos Asimilados a Salarios", persons: ["fisica"] },
  { code: "606", label: "Arrendamiento", persons: ["fisica"] },
  { code: "607", label: "Régimen de Enajenación o Adquisición de Bienes", persons: ["fisica"] },
  { code: "608", label: "Demás ingresos", persons: ["fisica"] },
  {
    code: "610",
    label: "Residentes en el Extranjero sin Establecimiento Permanente en México",
    persons: ["fisica", "moral"],
  },
  { code: "611", label: "Ingresos por Dividendos (socios y accionistas)", persons: ["fisica"] },
  {
    code: "612",
    label: "Personas Físicas con Actividades Empresariales y Profesionales",
    persons: ["fisica"],
  },
  { code: "614", label: "Ingresos por intereses", persons: ["fisica"] },
  { code: "615", label: "Régimen de los ingresos por obtención de premios", persons: ["fisica"] },
  { code: "616", label: "Sin obligaciones fiscales", persons: ["fisica"] },
  {
    code: "620",
    label: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
    persons: ["moral"],
  },
  { code: "621", label: "Incorporación Fiscal", persons: ["fisica"] },
  {
    code: "622",
    label: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
    persons: ["moral"],
  },
  { code: "623", label: "Opcional para Grupos de Sociedades", persons: ["moral"] },
  { code: "624", label: "Coordinados", persons: ["moral"] },
  {
    code: "625",
    label: "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
    persons: ["fisica"],
  },
  { code: "626", label: "Régimen Simplificado de Confianza", persons: ["fisica", "moral"] },
] as const;

/**
 * Usos de CFDI que puede pedir un receptor en una factura de venta. Fuera
 * quedan CP01 (complemento de pago) y CN01 (nómina), que no son de este flujo.
 */
export const SAT_CFDI_USES = [
  { code: "G01", label: "Adquisición de mercancías", persons: ["fisica", "moral"] },
  { code: "G02", label: "Devoluciones, descuentos o bonificaciones", persons: ["fisica", "moral"] },
  { code: "G03", label: "Gastos en general", persons: ["fisica", "moral"] },
  { code: "I01", label: "Construcciones", persons: ["fisica", "moral"] },
  { code: "I02", label: "Mobiliario y equipo de oficina por inversiones", persons: ["fisica", "moral"] },
  { code: "I03", label: "Equipo de transporte", persons: ["fisica", "moral"] },
  { code: "I04", label: "Equipo de cómputo y accesorios", persons: ["fisica", "moral"] },
  {
    code: "I05",
    label: "Dados, troqueles, moldes, matrices y herramental",
    persons: ["fisica", "moral"],
  },
  { code: "I06", label: "Comunicaciones telefónicas", persons: ["fisica", "moral"] },
  { code: "I07", label: "Comunicaciones satelitales", persons: ["fisica", "moral"] },
  { code: "I08", label: "Otra maquinaria y equipo", persons: ["fisica", "moral"] },
  { code: "D01", label: "Honorarios médicos, dentales y gastos hospitalarios", persons: ["fisica"] },
  { code: "D02", label: "Gastos médicos por incapacidad o discapacidad", persons: ["fisica"] },
  { code: "D03", label: "Gastos funerales", persons: ["fisica"] },
  { code: "D04", label: "Donativos", persons: ["fisica"] },
  {
    code: "D05",
    label: "Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)",
    persons: ["fisica"],
  },
  { code: "D06", label: "Aportaciones voluntarias al SAR", persons: ["fisica"] },
  { code: "D07", label: "Primas por seguros de gastos médicos", persons: ["fisica"] },
  { code: "D08", label: "Gastos de transportación escolar obligatoria", persons: ["fisica"] },
  {
    code: "D09",
    label: "Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones",
    persons: ["fisica"],
  },
  { code: "D10", label: "Pagos por servicios educativos (colegiaturas)", persons: ["fisica"] },
  { code: "S01", label: "Sin efectos fiscales", persons: ["fisica", "moral"] },
] as const;

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
  { key: "orderDrafts", label: "Pedidos: borradores" },
  { key: "orderPrint", label: "Pedidos: imprimir notas" },
  { key: "customers", label: "Clientes" },
  { key: "customerFollowup", label: "Seguimiento: clientes por recomprar" },
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

/**
 * Seguimiento de clientes (página del vendedor): un cliente pertenece al
 * vendedor humano de su último pedido efectivo mientras lleve entre MIN_DAYS y
 * MAX_DAYS sin comprar. Pasado MAX_DAYS deja de ser suyo y pasa a Reactivación
 * (agente IA). Los cubos son excluyentes: 15 = 15-29 días, 30 = 30-59, 60 = 60-MAX.
 */
export const CUSTOMER_FOLLOWUP = {
  MIN_DAYS: 15,
  MAX_DAYS: 65,
  BUCKETS: [15, 30, 60],
} as const;
export type CustomerFollowupBucket = (typeof CUSTOMER_FOLLOWUP.BUCKETS)[number];

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
/** Tipo de contribuyente según el RFC: 13 caracteres = física, 12 = moral. */
export type PersonType = "fisica" | "moral";
export type SatTaxRegimeCode = (typeof SAT_TAX_REGIMES)[number]["code"];
export type SatCfdiUseCode = (typeof SAT_CFDI_USES)[number]["code"];
