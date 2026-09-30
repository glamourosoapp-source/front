import type { ContainerMaterial } from "./constants";
import type {
  BranchType,
  FactoryReturnReason,
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
import type { BranchHealth } from "./pos-health";
import type { BranchSyncState } from "./pos-sync";
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
  /**
   * Datos de facturación del cliente como receptor de CFDI 4.0. Todo-o-nada:
   * con RFC son obligatorios razón social, régimen, uso y CP fiscal (el
   * correo es opcional). Reglas en `utils/customer-billing.ts`.
   */
  taxId?: string | null;
  legalName?: string | null;
  taxRegime?: string | null;
  cfdiUse?: string | null;
  taxPostalCode?: string | null;
  billingEmail?: string | null;
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
  /** Caja de otra pieza: vender la caja descuenta `unitsPerPackage` piezas de esa pieza. */
  packOfProductId?: string | null;
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
  /** Envase en que se venden sus presentaciones: PET, o polietileno para las líneas agresivas. */
  containerMaterial?: ContainerMaterial | null;
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
  /** Lo que la caja de esta sucursal reportó en su último contacto. */
  syncState?: BranchSyncState | null;
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
  /**
   * Lo que el servidor habría cobrado con el catálogo actual, cuando difiere de
   * `unitPrice`. Solo pasa si el precio cambió mientras la caja estaba sin red:
   * manda lo que se cobró, y esto queda para que el administrador lo vea.
   */
  serverUnitPrice?: string | number | null;
  /** Desglose de bidones + litros sueltos cuando la partida se cobró por litro. */
  pricingBreakdown?: Record<string, unknown> | null;
  /** Envase y tapa que se descontaron con esta partida (presentaciones envasadas de una línea). */
  containerProductId?: string | null;
  capProductId?: string | null;
  /** Por qué NO se descontó envase (p. ej. polietileno de 2 L sin regla). null = sin problema. */
  containerWarning?: string | null;
  total: string | number;
}

/** Regla de envase y tapa por material × litros, editable por organización. */
export interface PosContainerRule {
  id?: string;
  organizationId?: string;
  material: ContainerMaterial;
  liters: string | number;
  containerProductId: string | null;
  containerProduct?: Product | null;
  capProductId: string | null;
  capProduct?: Product | null;
  createdAt?: string;
  updatedAt?: string;
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
  /** Se cobró sin conexión y subió después. */
  recordedOffline?: boolean;
  /** Cuándo llegó al servidor (null = nació en línea). */
  syncedAt?: string | null;
  /** Versión del catálogo con la que cobró la caja. */
  catalogVersion?: string | null;
  /** Alguna partida se cobró a un precio distinto al del catálogo actual. */
  priceMismatch?: boolean;
  /** El folio de la caja chocaba con uno ya existente; se guardó igual. */
  syncConflict?: Record<string, unknown> | null;
  /** Desfase del reloj de la PC al cobrar, en ms. */
  clockSkewMs?: number | null;
  deviceId?: string | null;
  items?: PosSaleItem[];
}

/**
 * Evento que el servidor no pudo aplicar (producto borrado, sucursal inactiva…).
 *
 * No se descarta nunca: el dinero ya entró a la caja. Queda aquí hasta que un
 * administrador lo reintente o lo descarte con motivo, desde el detalle de la
 * sucursal.
 */
export interface PosSyncRejection {
  id: string;
  branchId: string;
  branch?: Branch | null;
  deviceId: string | null;
  cashierUserId?: string | null;
  cashier?: { id: string; name: string } | null;
  clientEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  reason: string;
  occurredAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolvedByUser?: { id: string; name: string } | null;
  resolution?: string | null;
  notes?: string | null;
  createdAt?: string;
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
  /** Piezas por empaque despachado (24 para una caja de latas); congela la conversión del surtido. */
  unitsPerPackage?: string | number | null;
  prepared: boolean;
  unitPrice?: string | number | null;
  /** Por qué esta partida se despachó distinto de lo pedido. Lo escribe fábrica. */
  notes?: string | null;
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
  /** Nota de quien pidió. */
  notes?: string | null;
  /** Nota de fábrica sobre el envío. Separada para no pisar la de quien pidió. */
  dispatchNotes?: string | null;
  items?: RestockOrderItem[];
  /** Devoluciones a fábrica ligadas a este pedido: lo que el transportista se llevó de regreso. */
  returns?: FactoryReturn[];
  /**
   * Total del formato de pedido (precio de tienda + bidones vacíos, cajas
   * azules y publicidad) con lo que se envía: cambia al editar lo despachado.
   * `null` en los pedidos de franquicia, que suman su precio de mayoreo congelado.
   */
  total?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Partida de una devolución a fábrica: se capturó como una venta y descontó lo mismo. */
export interface FactoryReturnItem {
  id: string;
  factoryReturnId: string;
  /** Partida del pedido de surtido con el mismo producto o línea, si el pedido lo traía. */
  restockOrderItemId: string | null;
  productId: string | null;
  lineId: string | null;
  productName: string;
  sku: string | null;
  saleUnit: PosSaleUnit;
  quantity: number;
  /** Sobre qué cayó el descuento: la línea (litros) o el producto (piezas; la pieza de una caja). */
  inventoryLineId: string | null;
  inventoryProductId: string | null;
  /** Lo que salió del inventario de la sucursal: litros si hay `inventoryLineId`, si no piezas. */
  inventoryQuantity: number;
  reason: FactoryReturnReason;
  /** Precio a tienda por unidad de la partida (del formato o el costo del catálogo); null si no hay. */
  unitValue: number | null;
  total: number | null;
}

/**
 * Devolución a fábrica: producto roto o echado a perder que el transportista
 * se lleva de regreso. Sale del inventario de la sucursal (kardex
 * `factory_return`), no toca dinero de la caja y se liga al pedido de surtido.
 */
export interface FactoryReturn {
  id: string;
  organizationId?: string;
  branchId: string;
  branch?: { id: string; code: string; name: string } | null;
  restockOrderId: string | null;
  /** `DEV-SUC01-20260928-0001` */
  folio: string;
  notes: string | null;
  userId: string | null;
  user?: { id: string; name: string } | null;
  /** Importe a precio de tienda; informativo: no cambia el total del pedido. */
  total: number;
  items: FactoryReturnItem[];
  createdAt: string;
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
  /** Empaques (bidones, garrafas, cajas o piezas) a pedir, ya redondeados con la regla del 30 %. */
  requestedQty: number;
  litersPerUnit?: number | null;
  /** Piezas por empaque para productos por pieza (1 = pieza suelta). */
  unitsPerPackage?: number | null;
  /** Cómo se llama el empaque en el formato de fábrica: bidón, garrafa, caja, bolsa, paquete, pieza. */
  packLabel?: string | null;
}

/**
 * Producto o línea que la sucursal vendió (o dejó en negativo) sin estar ligado
 * a ningún renglón activo del formato de pedido a fábrica: nunca va a entrar al
 * surtido hasta que alguien lo ligue.
 */
export interface UnlinkedRestockItem {
  branchId: string;
  branchCode: string;
  branchName: string;
  lineId: string | null;
  productId: string | null;
  name: string;
  sku: string | null;
  /** Litros para una línea de líquidos, piezas para un producto. */
  unit: "liters" | "pieces";
  /** Existencia actual (normalmente negativa: se vendió sin surtido). */
  stock: number;
  /** Vendido neto (ventas menos anulaciones) desde el primer movimiento. */
  sold: number;
  lastSoldAt: string | null;
}

/** Tipo de renglón del formato de pedido a fábrica. */
export type FactoryFormRowKind = "product" | "section" | "blank";

/**
 * Un renglón del formato de pedido a fábrica (4 hojas, 4 bloques por hoja),
 * ya resuelto para una sucursal o un pedido. `qty` en empaques; `null` cuando
 * el renglón no lleva cantidad (se imprime en blanco para llenar a mano). Una
 * línea o producto ligado a varios renglones (uno por color/aroma) trae en cada
 * uno su parte del reparto, en empaques enteros y el sobrante a los primeros.
 */
export interface FactoryFormRow {
  page: number;
  block: number;
  row: number;
  kind: FactoryFormRowKind;
  label: string;
  packSize: number;
  packLabel: string;
  productId?: string | null;
  lineId?: string | null;
  qty: number | null;
  /** Costo por pieza (`products.cost`). */
  unitCost: number | null;
  /** `qty × unitPrice` si el renglón trae precio a tienda; si no, `qty × packSize × unitCost`. */
  amount: number | null;
  /** Precio a tienda por unidad de Cant (por bidón, garrafa, caja o pieza), del formato de tiendas. */
  unitPrice?: number | null;
  /** Viaja en bidón vacío de 20 L: transparente o de color (HIPOCLORITO, CLORO 20L). */
  bidon?: "transparent" | "color" | null;
  /** Cada caja pedida lleva una caja azul. */
  blueBox?: boolean;
  /**
   * Solo en el formato de stock mínimo (`source.kind = "min_stock"`): el mínimo
   * de la sucursal en su unidad base (litros para líneas, piezas para
   * productos). `qty` es ese mismo mínimo expresado en empaques. Repartido
   * entre renglones, cada uno trae su parte (0 = ligado pero sin parte).
   */
  minStock?: number | null;
}

export interface FactoryFormPage {
  page: number;
  /** Cuatro bloques de columnas, cada uno con sus renglones en orden. */
  blocks: FactoryFormRow[][];
  /** Suma de `amount` de la hoja. */
  total: number;
}

/** Conteo y costo de bidones vacíos del pedido (pie de la hoja 1). */
export interface FactoryFormBidones {
  transparent: { qty: number; amount: number };
  color: { qty: number; amount: number };
}

/** Un renglón del formato tal como lo administra el panel (Punto de venta → Formato de pedido). */
export interface FactoryFormAdminRow {
  id: string;
  page: number;
  block: number;
  row: number;
  kind: FactoryFormRowKind;
  label: string;
  packSize: number;
  packLabel: string;
  unitPrice: number | null;
  bidon: "transparent" | "color" | null;
  blueBox: boolean;
  lineId: string | null;
  productId: string | null;
  /** Nombre de la línea o producto del catálogo al que está ligado. */
  targetName: string | null;
}

/** El formato completo para administrarlo y descargarlo en Excel. */
export interface FactoryFormAdmin {
  rows: FactoryFormAdminRow[];
  charges: FactoryFormCharges;
}

/** Línea o producto del catálogo que se puede ligar a un renglón. */
export interface FactoryFormTarget {
  type: "line" | "product";
  id: string;
  name: string;
  /** Litros por bidón (línea) o piezas por empaque (producto). */
  packSize: number;
  /** Costo del catálogo por empaque, como sugerencia del precio a tienda. */
  cost: number;
  /** Ya está en otro renglón del formato. */
  inForm: boolean;
}

/** Precios de los cargos del pie del formato. */
export interface FactoryFormCharges {
  bidonTransparent: number;
  bidonColor: number;
  blueBox: number;
  publicity: number;
}

/** Un pedido de surtido todavía abierto (pendiente, aprobado o en preparación). */
export interface FactoryFormOpenOrder {
  id: string;
  origin: string;
  status: string;
  createdAt: string;
  itemsCount: number;
}

/** Con qué se precargó la entrada de surtido. */
export interface FactoryFormEntryBasis {
  /** `order`: las partidas de un pedido abierto; `shortages`: el faltante de hoy; `blank`: nada. */
  kind: "order" | "shortages" | "blank";
  orderId?: string | null;
  /** Pedidos abiertos de la sucursal, el más reciente primero. */
  openOrders: FactoryFormOpenOrder[];
}

/** Formato de pedido a fábrica completo, listo para dibujarse en PDF. */
export interface FactoryForm {
  /**
   * Fuente: faltantes recién calculados, un pedido de surtido, los stocks
   * mínimos de la sucursal (la misma hoja, con el mínimo en `Cant`), o la
   * captura de una entrada de surtido (`entry`, precargada y editable).
   */
  source: {
    kind: "shortages" | "order" | "min_stock" | "entry";
    branchId: string;
    orderId?: string | null;
  };
  /** Solo con `source.kind = "entry"`: de dónde salió lo precargado y qué pedidos siguen abiertos. */
  entry?: FactoryFormEntryBasis | null;
  /** Fecha del pedido o del cálculo (YYYY-MM-DD). */
  date: string;
  /** Sucursal o franquicia: nombre y código. */
  name: string;
  code?: string | null;
  pages: FactoryFormPage[];
  /** Faltantes o partidas que no están en el formato: sección OTROS al final. */
  extras: FactoryFormRow[];
  bidones: FactoryFormBidones;
  /** Cajas azules: una por cada caja pedida de los renglones que la llevan. */
  blueBoxes?: { qty: number; amount: number };
  /** Publicidad del pedido (pie de la hoja 4). */
  publicity?: { qty: number; amount: number };
  /** Precios de los cargos del pie (configurables por organización). */
  charges?: FactoryFormCharges;
  /** Suma de las hojas + OTROS + bidones + cajas azules + publicidad. */
  grandTotal: number;
}

/** Ventas de un periodo en el resumen de sucursal. */
export interface BranchSalesPeriod {
  total: number;
  tickets: number;
  avgTicket: number;
}

/**
 * Resumen de una sucursal o franquicia para el panel: ventas por periodo,
 * inventario bajo mínimo, surtido y la salud derivada. `sales` llega en null
 * sin `posReports:view` e `inventory` sin `posInventory:view`.
 */
export interface BranchStats {
  branchId: string;
  code: string;
  name: string;
  type: BranchType;
  isActive: boolean;
  city: string | null;
  restockCutoffDow: number | null;
  usersCount: number;
  sales: {
    today: BranchSalesPeriod;
    week: BranchSalesPeriod;
    month: BranchSalesPeriod;
    last30: BranchSalesPeriod;
    prev30: BranchSalesPeriod;
    lifetimeTickets: number;
    customersCount: number;
    lastSaleAt: string | null;
  } | null;
  inventory: { belowMinCount: number; trackedCount: number } | null;
  restock: {
    openCount: number;
    oldestOpenAt: string | null;
    lastOrderAt: string | null;
    monthCount: number;
  };
  health: BranchHealth;
}

export interface BranchOverview {
  branch: Branch;
  stats: BranchStats;
}

/** Cliente registrado en una sucursal: lo que compró AHÍ con su teléfono. */
export interface BranchCustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  birthday: string | null;
  pricingTier: PricingTier | string;
  source: string | null;
  purchases: number;
  spent: number;
  lastPurchaseAt: string | null;
  firstPurchaseAt: string | null;
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
