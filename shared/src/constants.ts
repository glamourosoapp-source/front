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
  /** El scheduler generó el pedido de surtido del día de corte de una sucursal. */
  RESTOCK_ORDER_CREATED: "restock_order_created",
  /** Un pedido de surtido se envió a fábrica desde el panel. */
  RESTOCK_ORDER_SUBMITTED: "restock_order_submitted",
} as const;

/** Path del gateway WebSocket del Back (mismo host que la API). */
export const REALTIME_WS_PATH = "/api/ws";

export const NOTIFICATION_ENTITY_TYPES = {
  CONVERSATION: "conversation",
  ORDER: "order",
  CAMPAIGN: "campaign",
  RESTOCK_ORDER: "restock_order",
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

/**
 * Renglón con que la venta a domicilio de la caja cobra los bidones: 1 por
 * unidad que lo lleva (misma regla que el CRM), a `CONTAINER_UNIT_PRICE`. Lo
 * agrega el servidor; en el pedido del CRM viaja como cargo de bidones.
 */
export const POS_RETURNABLE_CONTAINER_ITEM_NAME = "Bidón retornable";

/** Tipo de punto: sucursal propia con POS, o franquicia que solo levanta pedidos a fábrica. */
export const BRANCH_TYPES = {
  BRANCH: "branch",
  FRANCHISE: "franchise",
} as const;

/** Litros que trae un bidón de surtido. Fábrica siempre despacha líquidos en bidones. */
export const BIDON_LITERS = 20;

export const POS_SALE_STATUS = {
  COMPLETED: "completed",
  VOIDED: "voided",
} as const;

/**
 * Tipo de ticket:
 * - `counter`: venta de mostrador; descuenta inventario de la sucursal.
 * - `home_delivery`: venta a domicilio. Se cobra en la caja, pero la surte la
 *   fábrica: NO toca el kardex y nace con un pedido del CRM ligado
 *   (`orders.pos_sale_id`). Anular uno cancela el otro.
 */
export const POS_SALE_KINDS = {
  COUNTER: "counter",
  HOME_DELIVERY: "home_delivery",
} as const;

export const POS_SALE_KIND_LABELS: Record<string, string> = {
  [POS_SALE_KINDS.COUNTER]: "Mostrador",
  [POS_SALE_KINDS.HOME_DELIVERY]: "Venta a domicilio",
};

/** `source` de un pedido del CRM que nació de una venta a domicilio de la caja. */
export const ORDER_SOURCE_POS = "pos";

/**
 * Forma de pago de la caja → la del pedido del CRM (los valores en español
 * que usa el formulario de Pedidos).
 */
export const POS_TO_ORDER_PAYMENT_METHOD: Record<string, string> = {
  cash: "efectivo",
  card: "tarjeta",
  transfer: "transferencia",
};

/**
 * Métodos de cobro en caja. Tarjeta y transferencia son declarativos: el
 * cajero dice cómo pagó el cliente y el ticket lo registra; no hay terminal ni
 * conciliación bancaria conectadas. Con tarjeta o transferencia se cobra el
 * total exacto (sin "pagó con" ni cambio).
 */
export const POS_PAYMENT_METHODS = {
  CASH: "cash",
  CARD: "card",
  TRANSFER: "transfer",
} as const;

export const POS_PAYMENT_METHOD_VALUES = [
  POS_PAYMENT_METHODS.CASH,
  POS_PAYMENT_METHODS.CARD,
  POS_PAYMENT_METHODS.TRANSFER,
] as const;

/** Etiqueta que ve el cajero, el administrador y el cliente en el ticket. */
export const POS_PAYMENT_METHOD_LABELS: Record<string, string> = {
  [POS_PAYMENT_METHODS.CASH]: "Efectivo",
  [POS_PAYMENT_METHODS.CARD]: "Tarjeta",
  [POS_PAYMENT_METHODS.TRANSFER]: "Transferencia",
};

export function posPaymentMethodLabel(value: string | null | undefined): string {
  return POS_PAYMENT_METHOD_LABELS[value ?? ""] ?? POS_PAYMENT_METHOD_LABELS[POS_PAYMENT_METHODS.CASH]!;
}

/**
 * Cómo se cobra una partida del ticket:
 * - `piece`: una unidad del catálogo (botella 1 L, garrafa 5 L, bidón sellado).
 *   Si el producto pertenece a una línea de líquido, descuenta sus litros.
 * - `liter`: litros sueltos servidos de una línea (decimales).
 */
export const POS_SALE_UNITS = {
  PIECE: "piece",
  LITER: "liter",
} as const;

/** Tipos de movimiento del kardex de inventario por sucursal. */
export const INVENTORY_MOVEMENT_TYPES = {
  SALE: "sale",
  SALE_VOID: "sale_void",
  RESTOCK_IN: "restock_in",
  ADJUSTMENT: "adjustment",
  INITIAL: "initial",
  /** Producto roto o echado a perder que la sucursal le regresa a fábrica. */
  FACTORY_RETURN: "factory_return",
  /** Lo que un cliente regresó en buen estado y vuelve al anaquel. */
  CUSTOMER_RETURN: "customer_return",
  /** Diferencia de un conteo cíclico (o su reversa), ligada al renglón del conteo. */
  COUNT_ADJUSTMENT: "count_adjustment",
} as const;

/**
 * Conteos cíclicos (inventarios aleatorios) de una sucursal: el supervisor
 * cuenta a ciegas una lista sorpresa y, al cerrar, la diferencia se ajusta por
 * kardex. Plan: docs/exec-plans/active/pos-inventarios-ciclicos.md.
 */
export const INVENTORY_COUNT_STATUS = {
  IN_PROGRESS: "in_progress",
  CLOSED: "closed",
  CANCELLED: "cancelled",
} as const;

export const INVENTORY_COUNT_ITEM_STATUS = {
  /** Sin cerrar el conteo (contado o no). */
  PENDING: "pending",
  /** El cierre aplicó la diferencia al inventario (puede ser 0). */
  ADJUSTED: "adjusted",
  /** El administrador revirtió el ajuste con un movimiento contrario. */
  REVERTED: "reverted",
} as const;

/** Por qué entró un renglón a la lista. */
export const INVENTORY_COUNT_SELECTION = {
  /** Le toca por su clase ABC (o nunca se ha contado). */
  DUE: "due",
  /** Diferencias previas o existencia negativa. */
  RISK: "risk",
  /** Puro azar, para que la lista no se pueda adivinar. */
  RANDOM: "random",
} as const;

export const INVENTORY_COUNT_DEFAULTS = {
  /** Renglones por conteo (decisión D2 del 2026-10-17). */
  ITEMS: 30,
  /** Reparto de la lista: vencidos, riesgo y azar (el resto). */
  DUE_SHARE: 0.6,
  RISK_SHARE: 0.2,
  /** Un renglón contado hace menos de esto no se repite (salvo riesgo). */
  RECENT_DAYS: 7,
  /** Ventana de venta para la clase ABC (decisión D6). */
  ABC_WINDOW_DAYS: 90,
  /** Corte acumulado de la venta: A hasta 80 %, B hasta 95 %, C el resto. */
  ABC_A_CUTOFF: 0.8,
  ABC_B_CUTOFF: 0.95,
  /** Cada cuántos días le toca contarse a cada clase. */
  FREQUENCY_DAYS: { A: 30, B: 60, C: 90 },
  /** Tolerancia de reconteo (decisión D4): ±1 L o ±1 pieza, o ±2 %, lo que sea mayor. */
  TOLERANCE_UNITS: 1,
  TOLERANCE_RATIO: 0.02,
} as const;

/**
 * Motivo de cada partida de una devolución a fábrica. Se imprime en el ticket y
 * se ve en rojo en el pedido de surtido.
 */
export const FACTORY_RETURN_REASONS = {
  BROKEN: "broken",
  SPOILED: "spoiled",
  EXPIRED: "expired",
  OTHER: "other",
} as const;

export const FACTORY_RETURN_REASON_LABELS: Record<FactoryReturnReason, string> = {
  broken: "Roto",
  spoiled: "Echado a perder",
  expired: "Caducado",
  other: "Otro",
};

/**
 * Motivo de cada partida de una devolución de cliente. Se imprime en el ticket
 * y en los reportes deja ver qué producto regresa la gente y por qué.
 */
export const POS_RETURN_REASONS = {
  DEFECTIVE: "defective",
  DAMAGED_CONTAINER: "damaged_container",
  WRONG_PRODUCT: "wrong_product",
  DISLIKED: "disliked",
  OTHER: "other",
} as const;

export const POS_RETURN_REASON_VALUES = [
  POS_RETURN_REASONS.DEFECTIVE,
  POS_RETURN_REASONS.DAMAGED_CONTAINER,
  POS_RETURN_REASONS.WRONG_PRODUCT,
  POS_RETURN_REASONS.DISLIKED,
  POS_RETURN_REASONS.OTHER,
] as const;

export const POS_RETURN_REASON_LABELS: Record<PosReturnReason, string> = {
  defective: "Defectuoso",
  damaged_container: "Envase dañado",
  wrong_product: "Se equivocó de producto",
  disliked: "No le gustó",
  other: "Otro",
};

/** Origen de un pedido de surtido a fábrica. */
export const RESTOCK_ORIGIN = {
  /** Lo generó el scheduler el día de corte de la sucursal. */
  SHORTAGE_AUTO: "shortage_auto",
  /** Lo armó el administrador desde el panel de faltantes. */
  SHORTAGE_MANUAL: "shortage_manual",
  /** Lo levantó una franquicia desde su portal. */
  FRANCHISE: "franchise",
  /**
   * Entrada de surtido capturada en la sucursal con el formato de fábrica, sin
   * pedido previo (con el módulo de fábrica apagado, así entra el producto).
   */
  MANUAL_ENTRY: "manual_entry",
} as const;

export const RESTOCK_ORDER_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  PREPARING: "preparing",
  SENT: "sent",
  RECEIVED: "received",
  CANCELLED: "cancelled",
} as const;

/** Unidad en la que fábrica despacha una partida de surtido. */
export const RESTOCK_ITEM_UNITS = {
  PIECE: "pieza",
  BIDON: "bidon",
  /** Caja, bolsa o paquete de N piezas (`unitsPerPackage` de la partida). */
  PACKAGE: "paquete",
} as const;

/** Anchos de papel soportados por las impresoras térmicas de sucursal. */
export const TICKET_PAPER_WIDTHS = [58, 80] as const;

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
  { key: "pos", label: "POS: caja (cobrar)" },
  { key: "posBranches", label: "POS: sucursales" },
  { key: "posInventory", label: "POS: inventario por sucursal" },
  { key: "posReports", label: "POS: cortes y reportes" },
  { key: "posRestock", label: "POS: faltantes y surtido" },
  { key: "posReturns", label: "POS: devoluciones a fábrica" },
  { key: "posCustomerReturns", label: "POS: devoluciones de cliente" },
  { key: "posSupervisor", label: "POS: app de supervisor de caja" },
  { key: "posCounts", label: "POS: conteos de inventario" },
  { key: "factory", label: "Fábrica: pedidos por enviar" },
  { key: "franchise", label: "Franquicia: pedidos a fábrica" },
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
export type BranchType = (typeof BRANCH_TYPES)[keyof typeof BRANCH_TYPES];
export type PosSaleStatus = (typeof POS_SALE_STATUS)[keyof typeof POS_SALE_STATUS];
export type PosSaleKind = (typeof POS_SALE_KINDS)[keyof typeof POS_SALE_KINDS];
export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[keyof typeof POS_PAYMENT_METHODS];
export type PosSaleUnit = (typeof POS_SALE_UNITS)[keyof typeof POS_SALE_UNITS];
export type InventoryMovementType =
  (typeof INVENTORY_MOVEMENT_TYPES)[keyof typeof INVENTORY_MOVEMENT_TYPES];
export type RestockOrigin = (typeof RESTOCK_ORIGIN)[keyof typeof RESTOCK_ORIGIN];
export type InventoryCountStatus = (typeof INVENTORY_COUNT_STATUS)[keyof typeof INVENTORY_COUNT_STATUS];
export type InventoryCountItemStatus =
  (typeof INVENTORY_COUNT_ITEM_STATUS)[keyof typeof INVENTORY_COUNT_ITEM_STATUS];
export type InventoryCountSelection =
  (typeof INVENTORY_COUNT_SELECTION)[keyof typeof INVENTORY_COUNT_SELECTION];
export type AbcClass = "A" | "B" | "C";
export type RestockOrderStatus =
  (typeof RESTOCK_ORDER_STATUS)[keyof typeof RESTOCK_ORDER_STATUS];
export type RestockItemUnit = (typeof RESTOCK_ITEM_UNITS)[keyof typeof RESTOCK_ITEM_UNITS];
export type TicketPaperWidth = (typeof TICKET_PAPER_WIDTHS)[number];
export type FactoryReturnReason = (typeof FACTORY_RETURN_REASONS)[keyof typeof FACTORY_RETURN_REASONS];
export type PosReturnReason = (typeof POS_RETURN_REASONS)[keyof typeof POS_RETURN_REASONS];

/** Material del envase en que se vende una línea de líquido. */
export const CONTAINER_MATERIALS = {
  PET: "pet",
  /** Líneas agresivas (quita sarro, desengrasantes, cloro, sosa, hipoclorito). */
  POLYETHYLENE: "polietileno",
} as const;
export type ContainerMaterial = (typeof CONTAINER_MATERIALS)[keyof typeof CONTAINER_MATERIALS];

/** Tipo de contribuyente según el RFC: 13 caracteres = física, 12 = moral. */
export type PersonType = "fisica" | "moral";
export type SatTaxRegimeCode = (typeof SAT_TAX_REGIMES)[number]["code"];
export type SatCfdiUseCode = (typeof SAT_CFDI_USES)[number]["code"];
