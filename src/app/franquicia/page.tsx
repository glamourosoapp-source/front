"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import {
  AlertTriangle,
  Droplets,
  LogOut,
  Minus,
  Package,
  Plus,
  RotateCcw,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useAuthStore } from "@/stores/auth.store";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { RESTOCK_ORDER_STATUS } from "@glamouroso/shared/constants";
import { ListResponse, RestockOrder } from "@/types";
import { toast } from "sonner";
import "./franquicia.css";

interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  price: string | number | null;
  category_name: string | null;
}

interface CatalogLine {
  id: string;
  name: string;
  liters_per_bidon: string | number;
  price: string | number | null;
}

interface CartItem {
  productId: string | null;
  lineId: string | null;
  /** Solo el producto o la línea; la presentación va aparte. */
  name: string;
  /** Cómo se cuenta: "bidón" / "bidones". */
  unitSingular: string;
  unitPlural: string;
  unitPrice: number;
  quantity: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "En preparación",
  preparing: "En preparación",
  sent: "Enviado",
  received: "Recibido",
  cancelled: "Cancelado",
};

/**
 * El pedido a medio armar vive en esta computadora.
 *
 * Un pedido de franquicia son decenas de partidas y se arma en varias sentadas;
 * perderlo por recargar o por un cierre accidental obliga a empezar de cero. La
 * versión en la llave permite cambiar la forma del renglón sin resucitar datos
 * viejos: si no coincide, se descarta en silencio.
 */
const CART_STORAGE_KEY = "franquicia.pedido.v1";

/** Identidad de una partida: un producto o una línea, nunca los dos. */
function itemKey(item: { productId: string | null; lineId: string | null }): string {
  return item.productId ? `p:${item.productId}` : `l:${item.lineId}`;
}

/** "1 bidón" y no "1 bidones": el pedido lo lee una persona. */
function pluralize(quantity: number, singular: string, plural: string): string {
  return quantity === 1 ? singular : plural;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * Paso de cantidad; el mismo en el catálogo y en el carrito.
 *
 * Vive **fuera** del componente de página a propósito: declarado adentro, React
 * lo trata como un tipo nuevo en cada render y remonta el `<input>`, que pierde
 * el foco a la primera tecla.
 */
function Stepper({
  item,
  onChange,
}: {
  item: CartItem;
  onChange: (key: string, quantity: number) => void;
}) {
  const key = itemKey(item);
  return (
    <div className="fr-stepper">
      <button
        type="button"
        className="fr-step-btn"
        aria-label={`Quitar un ${item.unitSingular} de ${item.name}`}
        disabled={item.quantity <= 1}
        onClick={() => onChange(key, item.quantity - 1)}
      >
        <Minus size={15} />
      </button>
      <input
        className="fr-step-input"
        type="number"
        min={1}
        step={1}
        value={item.quantity}
        aria-label={`Cantidad de ${item.name}`}
        onChange={(event) => {
          const parsed = Math.floor(Number(event.target.value));
          // Mientras borra el campo no se tira el renglón: el valor inválido
          // simplemente se ignora.
          if (!Number.isFinite(parsed) || parsed < 1) return;
          onChange(key, parsed);
        }}
      />
      <button
        type="button"
        className="fr-step-btn"
        aria-label={`Agregar un ${item.unitSingular} de ${item.name}`}
        onClick={() => onChange(key, item.quantity + 1)}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

export default function FranchisePortalPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [lines, setLines] = useState<CatalogLine[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<RestockOrder[]>([]);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** Solo cuenta en la versión de una columna: ahí el carrito es una hoja. */
  const [cartOpen, setCartOpen] = useState(false);

  // El carrito guardado se lee tras montar, no en el estado inicial: en el
  // primer render del cliente tiene que coincidir con el del servidor.
  useEffect(() => {
    const saved = loadCart();
    if (saved.length) setCart(saved);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      /* sin almacenamiento el pedido sigue funcionando, solo no sobrevive a una recarga */
    }
  }, [cart]);

  // Con la hoja arriba, el fondo no debe correrse bajo el dedo.
  useEffect(() => {
    if (!cartOpen) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [cartOpen]);

  /**
   * El catálogo entero, de una sola carga (~850 renglones, ligeros).
   *
   * Antes iba una consulta por tecleo con `debounce`: con un pedido de decenas
   * de partidas eso es esperar en cada búsqueda. Teniéndolo en memoria la
   * búsqueda es instantánea y, de paso, repetir el último pedido puede resolver
   * nombres y precios de hoy sin pedir nada más.
   */
  const loadCatalog = useCallback(async () => {
    try {
      const result = await httpClient.get<{ products: CatalogProduct[]; lines: CatalogLine[] }>(
        "/franchise/catalog",
        { limit: 1000 }
      );
      setProducts(result.products);
      setLines(result.lines);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el catálogo"));
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const result = await httpClient.get<ListResponse<RestockOrder>>("/franchise/orders", {
        limit: 50,
      });
      setOrders(result.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar tu historial"));
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
    void loadOrders();
  }, [loadCatalog, loadOrders]);

  const inCart = useMemo(() => new Map(cart.map((item) => [itemKey(item), item])), [cart]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart]
  );

  const categories = useMemo(
    () =>
      [...new Set(products.map((p) => p.category_name).filter(Boolean))].sort() as string[],
    [products]
  );

  const filtered = useMemo(() => {
    const needle = normalize(search).trim();
    const matches = (value: string | null | undefined) => normalize(value).includes(needle);
    return {
      lines: lines.filter((line) => !needle || matches(line.name)),
      products: products.filter(
        (product) =>
          (!needle || matches(product.name) || matches(product.sku)) &&
          (!category || product.category_name === category)
      ),
    };
  }, [search, category, lines, products]);

  /** Con 750 productos, pintarlos todos hace lenta la lista y no ayuda a nadie. */
  const VISIBLE = 60;

  // ---- Carrito ----

  function setQuantity(key: string, quantity: number) {
    setCart((current) =>
      current
        .map((row) => (itemKey(row) === key ? { ...row, quantity } : row))
        .filter((row) => row.quantity > 0)
    );
  }

  function addToCart(entry: Omit<CartItem, "quantity">, quantity = 1) {
    setCart((current) => {
      const key = itemKey(entry);
      const existing = current.find((row) => itemKey(row) === key);
      if (existing) {
        return current.map((row) =>
          itemKey(row) === key ? { ...row, quantity: row.quantity + quantity } : row
        );
      }
      return [...current, { ...entry, quantity }];
    });
  }

  const cartEntryForLine = (line: CatalogLine): Omit<CartItem, "quantity"> => ({
    productId: null,
    lineId: line.id,
    name: `${line.name} · bidón de ${formatQuantity(line.liters_per_bidon)} L`,
    unitSingular: "bidón",
    unitPlural: "bidones",
    unitPrice: Number(line.price ?? 0),
  });

  const cartEntryForProduct = (product: CatalogProduct): Omit<CartItem, "quantity"> => ({
    productId: product.id,
    lineId: null,
    name: product.name,
    unitSingular: "pieza",
    unitPlural: "piezas",
    unitPrice: Number(product.price ?? 0),
  });

  /**
   * Repetir un pedido anterior.
   *
   * Una franquicia pide casi lo mismo cada semana; rearmar 22 partidas a mano es
   * el trabajo que hace que la gente prefiera mandar la lista por WhatsApp. Se
   * reconstruye contra el catálogo de HOY, así que los precios son los vigentes
   * y lo que ya no existe se avisa en vez de colarse con un precio viejo.
   */
  function repeatOrder(order: RestockOrder) {
    const lineById = new Map(lines.map((line) => [line.id, line]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const next: CartItem[] = [];
    const missing: string[] = [];

    for (const item of order.items ?? []) {
      const quantity = Math.max(1, Math.round(Number(item.requestedQty) || 0));
      const line = item.lineId ? lineById.get(item.lineId) : undefined;
      const product = item.productId ? productById.get(item.productId) : undefined;
      if (line) next.push({ ...cartEntryForLine(line), quantity });
      else if (product) next.push({ ...cartEntryForProduct(product), quantity });
      else missing.push(item.productName);
    }

    if (!next.length) {
      toast.error("Ese pedido ya no tiene productos disponibles en el catálogo");
      return;
    }

    setCart(next);
    setTab(0);
    toast.success(
      `${next.length} ${next.length === 1 ? "partida copiada" : "partidas copiadas"} a tu pedido`
    );
    if (missing.length) {
      toast.warning(
        `${missing.length} ya no está${missing.length === 1 ? "" : "n"} en el catálogo: ${missing
          .slice(0, 3)
          .join(", ")}${missing.length > 3 ? "…" : ""}`
      );
    }
  }

  const lastOrder = orders[0] ?? null;

  async function submit() {
    if (!cart.length) return;
    setSending(true);
    try {
      await httpClient.post("/franchise/orders", {
        items: cart.map((item) => ({
          productId: item.productId,
          lineId: item.lineId,
          requestedQty: item.quantity,
        })),
      });
      toast.success("Pedido enviado a fábrica");
      setCart([]);
      setConfirming(false);
      setCartOpen(false);
      setTab(1);
      await loadOrders();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo enviar el pedido"));
    } finally {
      setSending(false);
    }
  }


  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 20px",
          background: "#fff",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Image
          src="/branding/glamouroso-logo-azul-sobre-blanco.svg"
          alt="Glamouroso"
          width={478}
          height={117}
          style={{ height: 28, width: "auto" }}
          priority
        />
        <div>
          <strong style={{ color: "var(--glam-navy)" }}>Pedidos a fábrica</strong>
          <div className="page-kicker" style={{ margin: 0 }}>
            {user?.branch ? `${user.branch.code} · ${user.branch.name}` : user?.name}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Button startIcon={<LogOut size={16} />} onClick={() => logout()}>
          Salir
        </Button>
      </header>

      <div className="fr-page" style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
        <Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab label="Hacer pedido" />
          <Tab label="Mis pedidos" />
        </Tabs>

        {tab === 0 ? (
          <div className="fr-layout">
            <div>
              <div className="fr-toolbar">
                <TextField
                  label="Buscar producto o línea"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  size="small"
                  sx={{ flex: "1 1 280px" }}
                />
                <TextField
                  select
                  label="Categoría"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  size="small"
                  sx={{ flex: "0 1 220px", minWidth: 180 }}
                >
                  <MenuItem value="">Todas</MenuItem>
                  {categories.map((name) => (
                    <MenuItem key={name} value={name}>
                      {name}
                    </MenuItem>
                  ))}
                </TextField>
                <p className="fr-toolbar-hint">
                  Los precios son de mayoreo. Los líquidos se piden en bidones. Lo que ya está en tu
                  pedido aparece marcado y se ajusta desde la misma lista.
                </p>
              </div>

              {filtered.lines.length ? (
                <div className="panel p-5" style={{ marginBottom: 16 }}>
                  <h3 className="fr-section-head">
                    <Droplets size={16} style={{ color: "var(--glam-blue)" }} /> Líquidos por bidón
                    <span className="fr-section-count">{filtered.lines.length}</span>
                  </h3>
                  <div>
                    {filtered.lines.slice(0, VISIBLE).map((line) => {
                      const item = inCart.get(`l:${line.id}`);
                      return (
                        <div
                          key={line.id}
                          className={`fr-catalog-row ${item ? "is-in-order" : ""}`}
                        >
                          <div className="fr-catalog-main">
                            <div className="fr-catalog-name">{line.name}</div>
                            <div className="fr-catalog-meta">
                              bidón de {formatQuantity(line.liters_per_bidon)} L
                            </div>
                          </div>
                          <div className="fr-catalog-price">{formatMoney(line.price)}</div>
                          <div className="fr-catalog-action">
                            {item ? (
                              <Stepper item={item} onChange={setQuantity} />
                            ) : (
                              <button
                                type="button"
                                className="fr-add-btn"
                                onClick={() => addToCart(cartEntryForLine(line))}
                              >
                                <Plus size={14} /> Agregar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {filtered.lines.length > VISIBLE ? (
                    <div className="fr-more">
                      y {filtered.lines.length - VISIBLE} líneas más — usa el buscador
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="panel p-5">
                <h3 className="fr-section-head">
                  <Package size={16} style={{ color: "var(--glam-blue)" }} /> Productos por pieza
                  <span className="fr-section-count">{filtered.products.length}</span>
                </h3>
                <div>
                  {filtered.products.slice(0, VISIBLE).map((product) => {
                    const item = inCart.get(`p:${product.id}`);
                    return (
                      <div
                        key={product.id}
                        className={`fr-catalog-row ${item ? "is-in-order" : ""}`}
                      >
                        <div className="fr-catalog-main">
                          <div className="fr-catalog-name">{product.name}</div>
                          <div className="fr-catalog-meta">{product.category_name ?? ""}</div>
                        </div>
                        <div className="fr-catalog-price">{formatMoney(product.price)}</div>
                        <div className="fr-catalog-action">
                          {item ? (
                            <Stepper item={item} onChange={setQuantity} />
                          ) : (
                            <button
                              type="button"
                              className="fr-add-btn"
                              onClick={() => addToCart(cartEntryForProduct(product))}
                            >
                              <Plus size={14} /> Agregar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!filtered.products.length ? (
                    <div className="fr-empty-row">Sin productos con esa búsqueda.</div>
                  ) : null}
                </div>
                {filtered.products.length > VISIBLE ? (
                  <div className="fr-more">
                    y {filtered.products.length - VISIBLE} productos más — usa el buscador o la
                    categoría
                  </div>
                ) : null}
              </div>
            </div>

            <aside className={`panel p-5 fr-cart ${cartOpen ? "is-open" : ""}`}>
              <h3 className="fr-cart-head">
                <ShoppingCart size={17} /> Tu pedido
                {cart.length ? <span className="fr-cart-count">{cart.length}</span> : null}
                <button
                  type="button"
                  className="fr-cart-close"
                  aria-label="Cerrar el pedido"
                  onClick={() => setCartOpen(false)}
                >
                  <X size={18} />
                </button>
              </h3>

              {cart.length ? (
                <>
                  <div className="fr-cart-actions">
                    <button
                      type="button"
                      className="fr-link-btn danger"
                      onClick={() => setCart([])}
                    >
                      Vaciar pedido
                    </button>
                    {lastOrder ? (
                      <button
                        type="button"
                        className="fr-link-btn"
                        onClick={() => repeatOrder(lastOrder)}
                      >
                        Repetir el último
                      </button>
                    ) : null}
                  </div>

                  <div className="fr-cart-list">
                    {cart.map((item) => (
                      <div key={itemKey(item)} className="fr-cart-item">
                        <div className="fr-cart-title">
                          <span className="fr-cart-name" title={item.name}>
                            {item.name}
                          </span>
                          <button
                            type="button"
                            className="fr-cart-remove"
                            aria-label={`Quitar ${item.name} del pedido`}
                            onClick={() => setQuantity(itemKey(item), 0)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="fr-cart-row">
                          <Stepper item={item} onChange={setQuantity} />
                          <span className="fr-cart-each">
                            {pluralize(item.quantity, item.unitSingular, item.unitPlural)} ×{" "}
                            {formatMoney(item.unitPrice)}
                          </span>
                          <span className="fr-cart-amount">
                            {formatMoney(item.unitPrice * item.quantity)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="fr-cart-empty">
                  <ShoppingCart size={26} strokeWidth={1.5} />
                  <span>Tu pedido está vacío.</span>
                  {lastOrder ? (
                    <Button
                      size="small"
                      startIcon={<RotateCcw size={15} />}
                      onClick={() => repeatOrder(lastOrder)}
                    >
                      Repetir el último pedido
                    </Button>
                  ) : (
                    <span>Agrega bidones o productos del catálogo.</span>
                  )}
                </div>
              )}

              {cart.length ? (
                <div className="fr-cart-foot">
                  <div className="fr-cart-total">
                    <span className="fr-cart-total-label">Total</span>
                    <span className="fr-cart-total-value">{formatMoney(total)}</span>
                  </div>
                  <Button
                    variant="contained"
                    fullWidth
                    sx={{ mt: 1.5 }}
                    disabled={sending}
                    onClick={() => setConfirming(true)}
                  >
                    Revisar y confirmar
                  </Button>
                  <p className="fr-cart-note">
                    El pedido queda pendiente hasta que administración lo apruebe.
                  </p>
                </div>
              ) : null}
            </aside>

            {/*
              En una columna el carrito es una hoja que sube desde abajo, y esta
              barra es lo único que se queda fijo: sin ella el pedido vive al
              final de 60 renglones de catálogo y en un celular se arma a ciegas.
            */}
            <div
              className={`fr-scrim ${cartOpen ? "is-open" : ""}`}
              onClick={() => setCartOpen(false)}
              aria-hidden
            />
            <div className="fr-bar">
              <div className="fr-bar-info">
                <div className="fr-bar-count">
                  {cart.length
                    ? `${cart.length} ${cart.length === 1 ? "partida" : "partidas"}`
                    : "Sin partidas"}
                </div>
                <div className="fr-bar-total">{formatMoney(total)}</div>
              </div>
              <button
                type="button"
                className="fr-bar-btn"
                disabled={!cart.length}
                onClick={() => setCartOpen(true)}
              >
                <ShoppingCart size={17} /> Ver pedido
              </button>
            </div>
          </div>
        ) : (
          <div className="page-stack">
            {orders.map((order) => (
              <div key={order.id} className="panel p-5">
                <div className="toolbar" style={{ marginBottom: 8 }}>
                  <div>
                    <strong>
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString("es-MX", { dateStyle: "long" })
                        : ""}
                    </strong>
                    <Chip
                      label={STATUS_LABELS[order.status] ?? order.status}
                      size="small"
                      color={
                        order.status === RESTOCK_ORDER_STATUS.RECEIVED ||
                        order.status === RESTOCK_ORDER_STATUS.SENT
                          ? "success"
                          : order.status === RESTOCK_ORDER_STATUS.CANCELLED
                            ? "error"
                            : "warning"
                      }
                      sx={{ ml: 1 }}
                    />
                    <span className="fr-section-count" style={{ marginLeft: 10 }}>
                      {(order.items ?? []).length} partidas
                    </span>
                  </div>
                  <Button
                    size="small"
                    startIcon={<RotateCcw size={15} />}
                    onClick={() => repeatOrder(order)}
                  >
                    Repetir este pedido
                  </Button>
                </div>
                <div>
                  {(order.items ?? []).map((item) => {
                    const pedido = Number(item.requestedQty);
                    const unidad = (qty: number) =>
                      item.unit === "bidon" ? pluralize(qty, "bidón", "bidones") : "pz";
                    /*
                     * `dispatchedQty` en null significa "fábrica no capturó
                     * nada": mientras el pedido no se envía no hay diferencia
                     * que mostrar, y ya enviado equivale a lo pedido.
                     */
                    const enviado = item.dispatchedQty == null ? null : Number(item.dispatchedQty);
                    const short = enviado != null && enviado < pedido;
                    return (
                      <div key={item.id} className={`fr-order-item ${short ? "is-short" : ""}`}>
                        <div className="fr-order-line">
                          <span className="fr-order-name">{item.productName}</span>
                          <span className="fr-order-qty">
                            {short ? (
                              <>
                                <s>{formatQuantity(pedido)}</s>{" "}
                                <strong>{formatQuantity(enviado!)}</strong> {unidad(enviado!)}
                              </>
                            ) : (
                              <>
                                {formatQuantity(pedido)} {unidad(pedido)}
                              </>
                            )}
                          </span>
                          <span className="fr-order-price">
                            {item.unitPrice ? formatMoney(item.unitPrice) : "—"}
                          </span>
                        </div>
                        {short ? (
                          <div className="fr-order-note">
                            <AlertTriangle size={14} />
                            <span>
                              Fábrica mandó {formatQuantity(enviado!)} de {formatQuantity(pedido)}
                              {item.notes ? <> · {item.notes}</> : null}
                            </span>
                          </div>
                        ) : item.notes ? (
                          <div className="fr-order-note">
                            <AlertTriangle size={14} />
                            <span>{item.notes}</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {order.dispatchNotes ? (
                  <div className="fr-order-dispatch">
                    <strong>Nota de fábrica</strong>
                    <p>{order.dispatchNotes}</p>
                  </div>
                ) : null}
              </div>
            ))}
            {!orders.length ? (
              <div className="panel p-5" style={{ textAlign: "center", color: "var(--muted)" }}>
                Todavía no has hecho pedidos.
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/*
        Revisión antes de mandar: un pedido de decenas de partidas y varios miles
        de pesos no debería salir con un solo clic sin ver la lista completa.
      */}
      <Dialog
        className="fr-confirm"
        open={confirming}
        onClose={() => setConfirming(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Confirmar pedido · {cart.length} {cart.length === 1 ? "partida" : "partidas"}
        </DialogTitle>
        <DialogContent dividers>
          <div className="fr-confirm-list">
            {cart.map((item) => (
              <div key={itemKey(item)} className="fr-confirm-row">
                <span className="fr-confirm-qty">
                  {item.quantity} {pluralize(item.quantity, item.unitSingular, item.unitPlural)}
                </span>
                <span>{item.name}</span>
                <span className="fr-confirm-amount">
                  {formatMoney(item.unitPrice * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="fr-cart-foot">
            <div className="fr-cart-total">
              <span className="fr-cart-total-label">Total</span>
              <span className="fr-cart-total-value">{formatMoney(total)}</span>
            </div>
            <p className="fr-cart-note">
              El pedido queda pendiente hasta que administración lo apruebe. Los precios son los de
              mayoreo vigentes hoy.
            </p>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Seguir editando</Button>
          <Button variant="contained" disabled={sending} onClick={() => void submit()}>
            {sending ? "Enviando..." : "Enviar a fábrica"}
          </Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}
