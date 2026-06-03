import type { Role } from "./constants";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role | string;
  organizationId?: string;
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

export interface Conversation {
  id: string;
  contactName?: string;
  contactPhone?: string;
  status: string;
  isAgentActive: boolean;
  needsHumanReview: boolean;
  lastMessageAt?: string;
  customer?: Customer;
  messages?: Array<{ id: string; role: string; content: string; createdAt: string }>;
}

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
