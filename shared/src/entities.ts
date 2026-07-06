import type { Role } from "./constants";
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

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role | string;
  organizationId?: string;
  isActive?: boolean;
  profileId?: string | null;
  profile?: Profile | null;
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
  deliveryZone?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  subtotal?: string | number;
  deliveryFee?: string | number;
  discount?: string | number;
  createdAt: string;
  customer?: Customer;
  items?: Array<{
    id: string;
    productName: string;
    quantity: string | number;
    unitPrice: string | number;
    total: string | number;
  }>;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
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

export interface Conversation {
  id: string;
  contactName?: string;
  contactPhone?: string;
  status: string;
  isAgentActive: boolean;
  needsHumanReview: boolean;
  lastMessageAt?: string;
  customer?: Customer;
  messages?: ConversationMessage[];
}

export type ConversationStreamEvent =
  | { type: "message_created"; conversationId: string; message: ConversationMessage }
  | { type: "agent_typing"; conversationId: string; on: boolean };

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
