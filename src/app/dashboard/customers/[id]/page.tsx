"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Tab, Tabs, TextField } from "@mui/material";
import {
  ArrowLeft,
  Cake,
  CalendarDays,
  Clock,
  FileText,
  Mail,
  MapPin,
  Navigation,
  PackageCheck,
  Pencil,
  Phone,
  Plus,
  Receipt,
  StickyNote,
  Store,
  Tag,
  Trash2,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import {
  cfdiUseLabel,
  customerLocationMapsUrl,
  formatCustomerDeliveryAddress,
  hasBillingInfo,
  taxRegimeLabel,
} from "@glamouroso/shared";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { CustomerAvatar } from "@/components/pos-admin/CustomerAvatar";
import { customerDisplayName } from "@/components/pos-admin/customer-labels";
import { FilterBar, FilterDateRange, FilterSearch } from "@/components/pos-admin/FilterBar";
import { InfoRow, StatTile } from "@/components/pos-admin/StatTile";
import { formatBusinessTime, formatDate, relativeDays } from "@/components/pos-admin/pos-labels";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import {
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  orderCreatorLabel,
  orderStatusLabel,
  paymentStatusLabel,
} from "@/constants/orders";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateOnly } from "@/lib/format-date-only";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMxPhone } from "@/utils/format-phone";
import type { Customer, CustomerLocation, ListResponse, Order } from "@/types";
import { toast } from "sonner";

const LIST_HREF = "/dashboard/customers";
/** Pedidos que se cargan para "lo que más pide"; el historial filtra aparte. */
const SUMMARY_LIMIT = 200;

const DATE_OPTIONS = [
  { key: "all", label: "Todo", days: null },
  { key: "30", label: "30 días", days: 30 },
  { key: "90", label: "90 días", days: 90 },
  { key: "365", label: "1 año", days: 365 },
];

type ChipColor = "default" | "info" | "warning" | "success" | "error";

const STATUS_COLORS: Record<string, ChipColor> = {
  new: "info",
  processing: "warning",
  delivered: "success",
  cancelled: "error",
};

const PAYMENT_COLORS: Record<string, ChipColor> = {
  paid: "success",
  partial: "warning",
  unpaid: "default",
  refunded: "default",
};

type TabKey = "pedidos" | "datos";

/** Pedidos que no cuentan para "lo que más pide". */
const NOT_SOLD = new Set(["cancelled", "deleted", "draft"]);

interface ProductSummary {
  key: string;
  name: string;
  quantity: number;
  total: number;
  orders: number;
}

/** "1990-03-12" → "12 de marzo". El año no se muestra: es para felicitarlo. */
function formatBirthday(value: string | null | undefined): string | null {
  return value ? formatDateOnly(value.slice(0, 10), { day: "numeric", month: "long" }) || null : null;
}

/**
 * Perfil del cliente en el CRM, con el formato del detalle de Clientes de
 * sucursal: métricas arriba y dos pestañas (`?tab=`). "Pedidos" lleva el
 * historial con lo que más pide; "Datos del cliente", la ficha, ubicaciones y
 * facturación, que en una sola columna lateral quedaban demasiado largas.
 */
export default function CustomerDetailPage() {
  // useSearchParams pide un límite de Suspense en una página del App Router.
  return (
    <Suspense fallback={<div className="page-stack"><p className="page-kicker">Cargando cliente...</p></div>}>
      <CustomerDetail />
    </Suspense>
  );
}

function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: TabKey = searchParams.get("tab") === "datos" ? "datos" : "pedidos";
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const customerId = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [summaryOrders, setSummaryOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [undelivered, setUndelivered] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const loadCustomer = useCallback(async () => {
    try {
      setCustomer(await httpClient.get<Customer>(`/customers/${customerId}`));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el cliente"));
      router.push(LIST_HREF);
    }
  }, [customerId, router]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const response = await httpClient.get<ListResponse<Order>>("/orders", {
        customerId,
        search: debouncedSearch.trim() || undefined,
        status: status || undefined,
        paymentStatus: paymentStatus || undefined,
        dateFrom: range.from || undefined,
        dateTo: range.to || undefined,
        undelivered: undelivered || undefined,
        limit: 100,
      });
      setOrders(response.items);
      setOrdersTotal(response.total);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el historial de pedidos"));
    } finally {
      setLoadingOrders(false);
    }
  }, [customerId, debouncedSearch, status, paymentStatus, range, undelivered]);

  const loadSummary = useCallback(async () => {
    try {
      const response = await httpClient.get<ListResponse<Order>>("/orders", {
        customerId,
        limit: SUMMARY_LIMIT,
      });
      setSummaryOrders(response.items);
    } catch {
      setSummaryOrders([]);
    }
  }, [customerId]);

  useEffect(() => {
    void loadCustomer();
    void loadSummary();
  }, [loadCustomer, loadSummary]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  // Un pedido nuevo o editado mueve los contadores del cliente y su historial.
  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "orders_changed") {
        void loadCustomer();
        void loadOrders();
        void loadSummary();
      }
    });
  }, [subscribe, loadCustomer, loadOrders, loadSummary]);

  const products = useMemo(() => {
    const byProduct = new Map<string, ProductSummary>();
    for (const order of summaryOrders) {
      if (NOT_SOLD.has(order.status)) continue;
      const seen = new Set<string>();
      for (const item of order.items ?? []) {
        const key = item.productId ?? item.productName;
        const current = byProduct.get(key) ?? {
          key,
          name: item.productName,
          quantity: 0,
          total: 0,
          orders: 0,
        };
        current.quantity += Number(item.quantity);
        current.total += Number(item.total);
        if (!seen.has(key)) current.orders += 1;
        seen.add(key);
        byProduct.set(key, current);
      }
    }
    return Array.from(byProduct.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [summaryOrders]);

  async function remove() {
    if (!customer) return;
    const ok = window.confirm(`¿Eliminar a ${customerDisplayName(customer.name)}? Esta acción no se puede deshacer.`);
    if (!ok) return;
    try {
      await httpClient.delete(`/customers/${customer.id}`);
      toast.success("Cliente eliminado");
      router.push(LIST_HREF);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo eliminar el cliente"));
    }
  }

  function selectTab(next: TabKey) {
    const query = new URLSearchParams(searchParams.toString());
    if (next === "pedidos") query.delete("tab");
    else query.set("tab", next);
    const qs = query.toString();
    router.replace(`${LIST_HREF}/${customerId}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPaymentStatus("");
    setRange({ from: "", to: "" });
    setUndelivered(false);
  }

  if (!customer) {
    return (
      <div className="page-stack">
        <p className="page-kicker">Cargando cliente...</p>
      </div>
    );
  }

  const name = customerDisplayName(customer.name);
  const ordersCount = Number(customer.totalOrders ?? 0);
  const spent = Number(customer.totalSpent ?? 0);
  const average = ordersCount ? spent / ordersCount : 0;
  const address = formatCustomerDeliveryAddress(customer);
  const birthday = formatBirthday(customer.birthday);
  const topTotal = products[0]?.total ?? 0;
  const isWholesale = customer.pricingTier === "wholesale";
  const locations = customer.locations ?? [];
  const posPurchases = Number(customer.posSalesCount ?? 0);
  const fromBranch = Boolean(customer.originBranch) || posPurchases > 0;
  const hasSide = products.length > 0 || fromBranch;
  const hasFilters = Boolean(search || status || paymentStatus || range.from || range.to || undelivered);

  return (
    <div className="page-stack">
      <div className="toolbar customer-detail-toolbar">
        <div>
          <Link
            href={LIST_HREF}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            Volver a clientes
          </Link>
          <div className="customer-hero">
            <CustomerAvatar id={customer.id} name={customer.name} size={56} />
            <div style={{ minWidth: 0 }}>
              <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {name}
                <Chip
                  label={isWholesale ? "Mayoreo" : "Menudeo"}
                  size="small"
                  color={isWholesale ? "secondary" : "default"}
                  variant={isWholesale ? "filled" : "outlined"}
                />
              </h1>
              <p className="page-kicker" style={{ margin: 0 }}>
                {formatMxPhone(customer.phone)}
                {customer.zone ? ` · ${customer.zone}` : ""}
                {customer.team ? ` · ${customer.team.name}` : ""}
                {customer.createdAt ? ` · desde ${formatDate(customer.createdAt)}` : ""}
              </p>
            </div>
          </div>
        </div>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          {fromBranch ? (
            <Button
              variant="outlined"
              startIcon={<Store size={16} />}
              component={Link}
              href={`/dashboard/pos/clientes/${customer.id}`}
            >
              En sucursal
            </Button>
          ) : null}
          {can("customers", "update") ? (
            <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={() => setEditOpen(true)}>
              Editar
            </Button>
          ) : null}
          {can("customers", "delete") ? (
            <Button color="error" startIcon={<Trash2 size={16} />} onClick={() => void remove()}>
              Eliminar
            </Button>
          ) : null}
          {can("orders", "create") ? (
            <Button component={Link} href="/dashboard/orders/new" variant="contained" startIcon={<Plus size={16} />}>
              Nuevo pedido
            </Button>
          ) : null}
        </Box>
      </div>

      <div className="stat-tiles">
        <StatTile
          icon={PackageCheck}
          label="Pedidos"
          value={ordersCount.toLocaleString("es-MX")}
          hint={ordersCount ? "pedidos del CRM y WhatsApp" : "Todavía no pide"}
          muted={!ordersCount}
        />
        <StatTile
          icon={Wallet}
          label="Comprado"
          value={formatMoney(spent)}
          hint={ordersCount ? `Pedido promedio ${formatMoney(average)}` : undefined}
          muted={!ordersCount}
        />
        <StatTile
          icon={Clock}
          label="Último pedido"
          value={customer.lastOrderAt ? capitalize(relativeDays(customer.lastOrderAt)) : "Nunca"}
          hint={customer.lastOrderAt ? formatDate(customer.lastOrderAt) : undefined}
          muted={!customer.lastOrderAt}
        />
        <StatTile
          icon={CalendarDays}
          label="Cliente desde"
          value={customer.createdAt ? formatDate(customer.createdAt) : "—"}
          hint={customer.creator ? `Lo registró ${customer.creator.name}` : undefined}
        />
      </div>

      <Tabs value={tab} onChange={(_e, value) => selectTab(value as TabKey)} variant="scrollable" allowScrollButtonsMobile>
        <Tab value="pedidos" label={`Pedidos (${ordersCount.toLocaleString("es-MX")})`} />
        <Tab value="datos" label="Datos del cliente" />
      </Tabs>

      {tab === "pedidos" ? (
        <div className={hasSide ? "customer-detail-grid" : undefined}>
          <div className="page-stack" style={{ minWidth: 0 }}>
            <section className="panel p-5">
              <div className="customer-section-head">
                <h2>Pedidos</h2>
                <span className="page-kicker" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  {hasFilters ? (
                    <Button size="small" variant="text" onClick={clearFilters}>
                      Limpiar filtros
                    </Button>
                  ) : null}
                  {loadingOrders ? "Cargando…" : <><strong>{ordersTotal.toLocaleString("es-MX")}</strong> {ordersTotal === 1 ? "pedido" : "pedidos"}</>}
                </span>
              </div>
  
              {ordersCount || hasFilters ? (
                <FilterBar>
                  <FilterSearch value={search} placeholder="Buscar por folio" onChange={setSearch} />
                  <TextField
                    select
                    size="small"
                    label="Estado"
                    value={status}
                    disabled={undelivered}
                    onChange={(e) => setStatus(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    SelectProps={{ displayEmpty: true }}
                    sx={{ minWidth: 150 }}
                  >
                    <MenuItem value="">Todos</MenuItem>
                    {ORDER_STATUS_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Pago"
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    SelectProps={{ displayEmpty: true }}
                    sx={{ minWidth: 150 }}
                  >
                    <MenuItem value="">Todos</MenuItem>
                    {PAYMENT_STATUS_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <FilterDateRange
                    from={range.from}
                    to={range.to}
                    onChange={setRange}
                    options={DATE_OPTIONS}
                    collapsible
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={undelivered}
                        onChange={(e) => {
                          setUndelivered(e.target.checked);
                          if (e.target.checked) setStatus("");
                        }}
                      />
                    }
                    label="Solo sin entregar"
                    sx={{ mr: 0 }}
                  />
                </FilterBar>
              ) : null}
  
              {!orders.length ? (
                <p className="customer-empty">
                  {loadingOrders
                    ? "Cargando pedidos..."
                    : hasFilters
                      ? "Ningún pedido coincide con los filtros."
                      : "Este cliente todavía no tiene pedidos."}
                </p>
              ) : (
                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table className="table customer-sales-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Folio</th>
                        <th>Entrega</th>
                        <th>Vendedor</th>
                        <th>Estado</th>
                        <th>Pago</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => {
                        const cancelled = order.status === "cancelled" || order.status === "deleted";
                        return (
                          <tr
                            key={order.id}
                            className={cancelled ? "is-voided" : ""}
                            onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                            title="Ver el pedido"
                          >
                            <td>
                              <div style={{ fontWeight: 600, color: "var(--glam-navy)" }}>{formatDate(order.createdAt)}</div>
                              <div className="customer-cell-sub">{formatBusinessTime(order.createdAt)}</div>
                            </td>
                            <td>{order.orderNumber}</td>
                            <td>
                              {order.scheduledDeliveryDate ? (
                                formatDateOnly(order.scheduledDeliveryDate)
                              ) : (
                                <span className="customer-cell-sub">—</span>
                              )}
                            </td>
                            <td>{orderCreatorLabel(order)}</td>
                            <td>
                              <Chip
                                label={orderStatusLabel(order.status)}
                                size="small"
                                color={STATUS_COLORS[order.status] ?? "default"}
                              />
                            </td>
                            <td>
                              <Chip
                                label={paymentStatusLabel(order.paymentStatus)}
                                size="small"
                                variant="outlined"
                                color={PAYMENT_COLORS[order.paymentStatus] ?? "default"}
                              />
                            </td>
                            <td
                              style={{
                                textAlign: "right",
                                fontWeight: 700,
                                textDecoration: cancelled ? "line-through" : undefined,
                              }}
                            >
                              {formatMoney(order.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {ordersTotal > orders.length ? (
                    <p className="page-kicker" style={{ marginTop: 8 }}>
                      Se muestran los {orders.length} más recientes de {ordersTotal}.
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          </div>
          {hasSide ? (
            <div className="page-stack" style={{ minWidth: 0 }}>
              {products.length ? (
                <section className="panel p-5">
                  <div className="customer-section-head">
                    <h2>Lo que más pide</h2>
                  </div>
                  <ul className="customer-products">
                    {products.map((product) => (
                      <li key={product.key}>
                        <div className="customer-products-row">
                          <span className="customer-products-name">{product.name}</span>
                          <strong>{formatMoney(product.total)}</strong>
                        </div>
                        <div className="customer-products-bar">
                          <span style={{ width: `${topTotal ? Math.max(4, (product.total / topTotal) * 100) : 0}%` }} />
                        </div>
                        <div className="customer-cell-sub">
                          {/* La unidad del renglón es la del producto ("litro" en un bidón de 20 L): se cuenta en piezas pedidas. */}
                          ×{formatQuantity(product.quantity)} · en {product.orders}{" "}
                          {product.orders === 1 ? "pedido" : "pedidos"}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {fromBranch ? (
                <section className="panel p-5">
                  <div className="customer-section-head">
                    <h2>En sucursal</h2>
                    <Link href={`/dashboard/pos/clientes/${customer.id}`} className="text-sm">
                      Ver tickets
                    </Link>
                  </div>
                  <div className="customer-info">
                    <InfoRow
                      icon={Store}
                      label="Sucursal de alta"
                      value={customer.originBranch ? `${customer.originBranch.code} · ${customer.originBranch.name}` : null}
                      empty="Del CRM"
                    />
                    <InfoRow
                      icon={Receipt}
                      label="Compras en caja"
                      value={
                        posPurchases
                          ? `${posPurchases} ${posPurchases === 1 ? "ticket" : "tickets"} · ${formatMoney(customer.posSpent)}`
                          : null
                      }
                      empty="Sin compras"
                    />
                    {customer.lastPosSaleAt ? (
                      <InfoRow
                        icon={Clock}
                        label="Última compra en caja"
                        value={`${capitalize(relativeDays(customer.lastPosSaleAt))} · ${formatDate(customer.lastPosSaleAt)}`}
                      />
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="customer-data-grid">
          <div className="page-stack" style={{ minWidth: 0 }}>
            <section className="panel p-5">
              <div className="customer-section-head">
                <h2>Datos del cliente</h2>
              </div>
              <div className="customer-info">
                <InfoRow icon={Phone} label="WhatsApp" value={formatMxPhone(customer.phone)} />
                <InfoRow icon={Mail} label="Correo" value={customer.email || null} empty="Sin correo" />
                <InfoRow icon={Cake} label="Cumpleaños" value={birthday} empty="Sin capturar" />
                <InfoRow icon={MapPin} label="Domicilio predeterminado" value={address || null} empty="Sin domicilio" />
                <InfoRow
                  icon={Navigation}
                  label="Zona"
                  value={[customer.zone, customer.colony, customer.postalCode].filter(Boolean).join(" · ") || null}
                  empty="Sin zona"
                />
                <InfoRow icon={Tag} label="Lista de precios" value={isWholesale ? "Mayoreo" : "Menudeo"} />
                <InfoRow icon={Users} label="Equipo" value={customer.team?.name ?? null} empty="Sin equipo" />
                <InfoRow icon={UserCog} label="Registró" value={customer.creator?.name ?? null} empty="Sin dato" />
                {customer.tags?.length ? (
                  <InfoRow icon={Tag} label="Etiquetas" value={customer.tags.map((tag) => tag.name).join(", ")} />
                ) : null}
                {customer.notes ? <InfoRow icon={StickyNote} label="Notas" value={customer.notes} /> : null}
              </div>
            </section>
          </div>
          <div className="page-stack" style={{ minWidth: 0 }}>
            {locations.length ? (
              <section className="panel p-5">
                <div className="customer-section-head">
                  <h2>Ubicaciones guardadas</h2>
                </div>
                <div className="customer-info">
                  {locations.map((location: CustomerLocation) => {
                    const written =
                      location.formattedAddress?.trim() ||
                      formatCustomerDeliveryAddress({
                        street: location.street,
                        colony: location.colony,
                        postalCode: location.postalCode,
                        city: location.city,
                        address: location.reference,
                      });
                    const mapsUrl = customerLocationMapsUrl(location);
                    return (
                      <div key={location.id} className="info-row">
                        <MapPin size={16} className="info-row-icon" />
                        <div style={{ minWidth: 0 }}>
                          <div className="stat-tile-label">
                            {location.label || "Ubicación"}
                            {location.isDefault ? " · predeterminada" : ""}
                          </div>
                          <div className="info-row-value">
                            {written || (mapsUrl ? "Ubicación por pin" : "Sin dirección")}
                          </div>
                          {mapsUrl ? (
                            <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-sm">
                              Ver en Google Maps
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
  
            <section className="panel p-5">
              <div className="customer-section-head">
                <h2>Facturación</h2>
              </div>
              {hasBillingInfo(customer) ? (
                <div className="customer-info">
                  <InfoRow icon={FileText} label="RFC" value={customer.taxId ?? null} />
                  <InfoRow icon={FileText} label="Razón social" value={customer.legalName || null} />
                  <InfoRow
                    icon={FileText}
                    label="Régimen fiscal"
                    value={taxRegimeLabel(customer.taxRegime) || customer.taxRegime || null}
                  />
                  <InfoRow
                    icon={FileText}
                    label="Uso de CFDI"
                    value={cfdiUseLabel(customer.cfdiUse) || customer.cfdiUse || null}
                  />
                  <InfoRow icon={MapPin} label="CP fiscal" value={customer.taxPostalCode || null} />
                  <InfoRow icon={Mail} label="Correo de facturación" value={customer.billingEmail || null} empty="Sin correo" />
                </div>
              ) : (
                <p className="customer-empty">Sin datos de facturación. Se capturan desde &quot;Editar&quot;.</p>
              )}
            </section>
          </div>
        </div>
      )}

      <CustomerFormDialog
        open={editOpen}
        customer={customer}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          // El PUT no devuelve `locations`: refetch completo para no borrar
          // las ubicaciones guardadas de la vista hasta recargar.
          void loadCustomer();
        }}
      />
    </div>
  );
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
