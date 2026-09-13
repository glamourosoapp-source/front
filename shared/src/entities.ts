import type {
  BranchType,
  InventoryMovementType,
  NotificationType,
  PosPaymentMethod,
  PosSaleStatus,
  PosSaleUnit,
  PricingTier,
  RestockItemUnit,
  RestockOrderStatus,
  RestockOrigin,
  Role,
} from "./constants";
import type { TicketSettings } from "./utils/pos-ticket-settings";
import type { PermissionMap } from "./permissions";

export interface Profile {
  id: string;
  organizationId?: string;
  name: string;
  description?: string | null;
  permissions: PermissionMap;
  createdAt?: string;
  updatedAt?: string;
}

export interface Team {
  id: string;
  organizationId?: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role | string;
  organizationId?: string;
  isActive?: boolean;
  profileId?: string | null;
  profile?: Profile | null;
  teamId?: string | null;
  team?: Team | null;
  /** Sucursal del POS a la que está fijado el usuario (cajero o franquicia). */
  branchId?: string | null;
  branch?: Branch | null;
  /** true mientras el usuario siga usando la contraseña que le puso el admin. */
  mustChangePassword?: boolean;
  /** Última vez que el usuario eligió su propia contraseña. */
  passwordChangedAt?: string | null;
  /** Resumen de la organización que cualquier rol necesita (viene de /auth/me). */
  organization?: { timezone: string };
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  street?: string;
  colony?: string;
  postalCode?: string;
  address?: string;
  city?: string;
  zone?: string;
  notes?: string;
  source?: string;
  pricingTier?: "retail" | "wholesale";
  /** Fecha de nacimiento (DATEONLY); la captura la caja al registrar en mostrador. */
  birthday?: string | null;
  totalOrders?: number;
  totalSpent?: string | number;
  /**
   * Compras en sucursal, contadas aparte de los pedidos del CRM: una venta de
   * mostrador no altera `totalOrders`/`totalSpent`/`lastOrderAt`, así que no
   * mueve Seguimiento ni Reactivación.
   */
  posSalesCount?: number;
  posSpent?: string | number;
  lastPosSaleAt?: string | null;
  createdBy?: string | null;
  creator?: { id: string; name: string } | null;
  teamId?: string | null;
  team?: Team | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  locations?: CustomerLocation[];
}

export interface CustomerLocation {
  id: string;
  customerId: string;
  label?: string | null;
  street?: string | null;
  colony?: string | null;
  postalCode?: string | null;
  city?: string | null;
  zone?: string | null;
  reference?: string | null;
  googleMapsUrl?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  isDefault: boolean;
  sortOrder: number;
  formattedAddress?: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  unit: string;
  unitType?: string | null;
  unitsPerPackage?: number | null;
  price: string | number;
  wholesalePrice?: string | number;
  cost?: string | number;
  stock: string | number;
  minStock?: string | number;
  /** true = no depende del inventario: existencias infinitas. */
  unlimitedStock?: boolean;
  isAvailable: boolean;
  /** Código de barras del envase; lo escanea la caja. */
  barcode?: string | null;
  /** Línea de líquido a la que pertenece: su inventario en sucursal va en litros. */
  lineId?: string | null;
  line?: ProductLine | null;
  /** Litros que representa UNA unidad de este producto (1, 4, 20, 0.5…). */
  litersPerUnit?: string | number | null;
  variants?: Record<string, unknown>;
  category?: { id: string; name: string; externalCode?: string };
}

/**
 * Línea de líquido: el conjunto de presentaciones (1 L, 4 L, 20 L) que comparten
 * producto y que en sucursal se inventarían como un solo saldo en litros.
 */
export interface ProductLine {
  id: string;
  organizationId?: string;
  name: string;
  categoryId?: string | null;
  /** SKU de 20 L: unidad de surtido de fábrica y precio del bidón completo. */
  bidonProductId: string | null;
  bidonProduct?: Product | null;
  /** SKU de 1 L: precio de los litros sueltos. */
  literProductId: string | null;
  literProduct?: Product | null;
  litersPerBidon: string | number;
  isActive: boolean;
  /** true si tiene los dos SKU y puede venderse por litro. */
  canSellByLiter?: boolean;
  productsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  total: string | number;
  deliveryAddress?: string;
  /** Domicilio guardado del cliente que se eligió al capturar el pedido. */
  customerLocationId?: string | null;
  deliveryLocation?: CustomerLocation | null;
  deliveryZone?: string | null;
  scheduledDeliveryDate?: string | null;
  deliveryTimeWindow?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  subtotal?: string | number;
  deliveryFee?: string | number;
  containersCount?: number;
  containersFee?: string | number;
  discount?: string | number;
  createdAt: string;
  source?: string;
  createdBy?: string | null;
  creator?: {
    id: string;
    name: string;
    phone?: string | null;
    teamId?: string | null;
    team?: { id: string; name: string } | null;
  } | null;
  /** Primera impresión de la nota; una reimpresión no la modifica. */
  printedAt?: string | null;
  printedBy?: string | null;
  printer?: { id: string; name: string } | null;
  /** Eliminado no destructivo (status "deleted"): rastro para la papelera. */
  deletedAt?: string | null;
  deletedBy?: string | null;
  deleter?: { id: string; name: string } | null;
  /** Estado al que vuelve el pedido si se restaura. */
  deletedFromStatus?: string | null;
  customer?: Customer;
  items?: Array<{
    id: string;
    productId?: string | null;
    productName: string;
    unit?: string;
    quantity: string | number;
    unitPrice: string | number;
    total: string | number;
    /**
     * Lista de precios con la que se cobró ESTA partida. Se elige por fila al
     * capturar el pedido; el default es la lista del cliente.
     */
    priceTier?: "retail" | "wholesale";
    notes?: string | null;
    product?: {
      id: string;
      name: string;
      unit: string;
      price: string | number;
      wholesalePrice?: string | number | null;
    } | null;
  }>;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  isActive?: boolean;
  embeddingStatus: "pending" | "ready" | "failed";
  score?: number;
}

export type MediaType = "image" | "audio" | "document" | "video" | "sticker";

export interface MessageMedia {
  type: MediaType;
  url: string;
  mimeType?: string;
  fileName?: string;
  byteSize?: number;
  caption?: string;
}

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  metadata?: { media?: MessageMedia } & Record<string, unknown>;
}

/**
 * Resumen que deja el agente al escalar a una persona: por que escalo, que
 * paso y que conviene hacer. Lo escribe `handoff_to_human` en
 * `conversations.metadata`.
 */
export interface HandoffBrief {
  reason?: string;
  summary?: string;
  customerMessage?: string;
  suggestedAction?: string;
}

export interface Conversation {
  id: string;
  contactName?: string;
  contactPhone?: string;
  status: string;
  isAgentActive: boolean;
  needsHumanReview: boolean;
  derivationReason?: string;
  lastMessageAt?: string;
  metadata?: { handoffBrief?: HandoffBrief; handoffBriefAt?: string } & Record<string, unknown>;
  customer?: Customer;
  messages?: ConversationMessage[];
}

export interface ConversationPatch {
  isAgentActive: boolean;
  needsHumanReview: boolean;
  status: string;
  derivationReason?: string | null;
  contactName?: string | null;
  lastMessageAt?: string | null;
}

export type ConversationStreamEvent =
  | { type: "message_created"; conversationId: string; message: ConversationMessage }
  | { type: "agent_typing"; conversationId: string; on: boolean }
  | { type: "conversation_updated"; conversationId: string; patch: ConversationPatch };

export interface Notification {
  id: string;
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  message?: string | null;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

/** Señal de refetch de pedidos: sin datos del pedido para respetar los scopes own/team del server. */
export interface OrdersChangedEvent {
  type: "orders_changed";
  action: "created" | "updated" | "deleted";
  orderId: string;
}

/** Eventos de control del transporte realtime (no llegan a los subscribers de la app). */
export type RealtimeControlEvent = { type: "connected" } | { type: "heartbeat" };

/** Notificación tal como viaja por el stream (validable con notificationEventSchema). */
export interface NotificationStreamEvent {
  type: NotificationType;
  notification: Notification;
}

/** Todo lo que el server puede empujar por el canal realtime (WS, y SSE durante la transición). */
export type RealtimeServerEvent =
  | ConversationStreamEvent
  | OrdersChangedEvent
  | PosSalesChangedEvent
  | RestockOrdersChangedEvent
  | NotificationStreamEvent
  | RealtimeControlEvent;

/** Sucursal con POS, o franquicia que solo levanta pedidos a fábrica. */
export interface Branch {
  id: string;
  organizationId?: string;
  /** Prefijo del folio de ticket, p. ej. "SUC01". */
  code: string;
  name: string;
  type: BranchType;
  street?: string | null;
  colony?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  isActive: boolean;
  /** Día de la semana (0 domingo … 6 sábado) en que se calculan los faltantes. */
  restockCutoffDow?: number | null;
  ticketSettings?: Record<string, unknown> | null;
  notes?: string | null;
  usersCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Existencia de una sucursal: litros de una línea, o piezas de un producto. */
export interface BranchInventoryRow {
  id: string;
  branchId: string;
  productId?: string | null;
  product?: Product | null;
  lineId?: string | null;
  line?: ProductLine | null;
  stock: string | number;
  /** Stock mínimo de ESTA sucursal; es el nivel ideal que repone el surtido. */
  minStock: string | number;
  updatedAt?: string;
}

export interface InventoryMovement {
  id: string;
  branchId: string;
  productId?: string | null;
  product?: Product | null;
  lineId?: string | null;
  line?: ProductLine | null;
  type: InventoryMovementType;
  quantity: string | number;
  balanceAfter: string | number;
  refType?: string | null;
  refId?: string | null;
  userId?: string | null;
  user?: { id: string; name: string } | null;
  notes?: string | null;
  createdAt?: string;
}

export interface PosSaleItem {
  id: string;
  saleId: string;
  productId?: string | null;
  product?: Product | null;
  lineId?: string | null;
  line?: ProductLine | null;
  productName: string;
  sku?: string | null;
  saleUnit: PosSaleUnit;
  quantity: string | number;
  /** Litros descontados del inventario de la línea (null si se cobró por pieza sin línea). */
  litersDeducted?: string | number | null;
  unitPrice: string | number;
  priceTier: PricingTier;
  /** Desglose de bidones + litros sueltos cuando la partida se cobró por litro. */
  pricingBreakdown?: Record<string, unknown> | null;
  total: string | number;
}

export interface PosSale {
  id: string;
  organizationId?: string;
  branchId: string;
  branch?: Branch | null;
  ticketNumber: string;
  cashierUserId: string;
  cashier?: { id: string; name: string } | null;
  customerId?: string | null;
  customer?: Customer | null;
  status: PosSaleStatus;
  subtotal: string | number;
  discount: string | number;
  total: string | number;
  paymentMethod: PosPaymentMethod;
  amountTendered: string | number;
  changeAmount: string | number;
  itemsCount: string | number;
  notes?: string | null;
  soldAt: string;
  printedAt?: string | null;
  printTarget?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  items?: PosSaleItem[];
}

/** Lo que la caja necesita al abrir: sucursal, ticket y cajero. */
export interface PosSession {
  branch: Branch;
  ticketSettings: TicketSettings;
  walkInCustomerName: string;
  cashier: { id: string; name: string };
  lastSale?: PosSale | null;
  catalogVersion: string;
}

/** Producto tal como lo consume la caja (catálogo ligero, sin embeddings ni descripción). */
export interface PosCatalogProduct {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  posId?: string | null;
  unit: string;
  price: string | number;
  wholesalePrice?: string | number | null;
  categoryName?: string | null;
  lineId?: string | null;
  litersPerUnit?: string | number | null;
  /**
   * Existencia en la sucursal: piezas del producto, o litros si tiene línea.
   * `null` cuando quien consulta no tiene `posInventory:view` (el cajero no ve
   * inventario, ni en pantalla ni en la respuesta).
   */
  stock: string | number | null;
}

/** Línea de líquido vista por la caja, con su existencia en litros. */
export interface PosCatalogLine {
  id: string;
  name: string;
  bidonProductId: string | null;
  literProductId: string | null;
  bidonPrice: string | number | null;
  bidonWholesalePrice?: string | number | null;
  literPrice: string | number | null;
  literWholesalePrice?: string | number | null;
  litersPerBidon: string | number;
  canSellByLiter: boolean;
  /** `null` sin `posInventory:view`, igual que `stock` del producto. */
  stockLiters: string | number | null;
  /** `null` sin `posInventory:view`. */
  minStockLiters: string | number | null;
}

export interface PosCatalog {
  version: string;
  products: PosCatalogProduct[];
  lines: PosCatalogLine[];
}

export interface CashCut {
  id: string;
  organizationId?: string;
  branchId?: string | null;
  branch?: Branch | null;
  periodStart: string;
  periodEnd: string;
  granularity: string;
  generatedBy?: string | null;
  generatedByUser?: { id: string; name: string } | null;
  summary: Record<string, unknown>;
  createdAt?: string;
}

export interface RestockOrderItem {
  id: string;
  restockOrderId: string;
  productId?: string | null;
  product?: Product | null;
  lineId?: string | null;
  line?: ProductLine | null;
  productName: string;
  unit: RestockItemUnit;
  requestedQty: string | number;
  dispatchedQty?: string | number | null;
  /** Litros por unidad despachada (20 para bidones); congela la conversión del surtido. */
  litersPerUnit?: string | number | null;
  prepared: boolean;
  unitPrice?: string | number | null;
}

export interface RestockOrder {
  id: string;
  organizationId?: string;
  branchId: string;
  branch?: Branch | null;
  origin: RestockOrigin;
  status: RestockOrderStatus;
  generatedForDate?: string | null;
  requestedBy?: string | null;
  approvedBy?: string | null;
  sentBy?: string | null;
  sentAt?: string | null;
  receivedBy?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  items?: RestockOrderItem[];
  createdAt?: string;
  updatedAt?: string;
}

/** Faltante calculado de una sucursal, listo para convertirse en pedido de surtido. */
export interface BranchShortage {
  lineId?: string | null;
  productId?: string | null;
  name: string;
  unit: RestockItemUnit;
  /** Litros o piezas en existencia (puede ser negativo). */
  stock: number;
  minStock: number;
  /** Litros o piezas que faltan para el mínimo. */
  shortage: number;
  /** Bidones o piezas a pedir, ya redondeados. */
  requestedQty: number;
  litersPerUnit?: number | null;
}

/** Señal de refetch: hubo una venta (o anulación) en una sucursal. */
export interface PosSalesChangedEvent {
  type: "pos_sales_changed";
  action: "created" | "voided";
  branchId: string;
  saleId: string;
}

/** Señal de refetch: cambió un pedido de surtido (creado, aprobado, enviado, recibido). */
export interface RestockOrdersChangedEvent {
  type: "restock_orders_changed";
  action: "created" | "updated" | "sent" | "received" | "cancelled";
  branchId: string;
  restockOrderId: string;
}
