import type { NotificationType, Role } from "./constants";
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
  totalOrders?: number;
  totalSpent?: string | number;
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
  variants?: Record<string, unknown>;
  category?: { id: string; name: string; externalCode?: string };
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
  | NotificationStreamEvent
  | RealtimeControlEvent;
