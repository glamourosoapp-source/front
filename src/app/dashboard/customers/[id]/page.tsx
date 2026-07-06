"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Box, Button, Checkbox, FormControlLabel, Typography } from "@mui/material";
import { ArrowLeft, Pencil } from "lucide-react";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { DataTable } from "@/components/ui/DataTable";
import { DateFilterField } from "@/components/ui/DateFilterField";
import { PAYMENT_STATUS_OPTIONS, paymentStatusLabel } from "@/constants/orders";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { Customer, ListResponse, Order, CustomerLocation } from "@/types";
import { formatCustomerDeliveryAddress } from "@glamouroso/shared";
import { toast } from "sonner";

const orderStatuses = ["new", "processing", "delivered", "cancelled"];

const statusLabels: Record<string, string> = {
  new: "Nuevo",
  processing: "En proceso",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

function formatOrderDate(value: string | Date | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function money(value: string | number | undefined) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Typography sx={{ color: "var(--glam-navy)", fontWeight: 600, mt: 0.5 }}>{value}</Typography>
    </div>
  );
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = usePermissions();
  const customerId = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [undelivered, setUndelivered] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const loadCustomer = useCallback(async () => {
    setLoadingCustomer(true);
    try {
      const data = await httpClient.get<Customer>(`/customers/${customerId}`);
      setCustomer(data);
    } catch {
      toast.error("No se pudo cargar el cliente.");
      router.push("/dashboard/customers");
    } finally {
      setLoadingCustomer(false);
    }
  }, [customerId, router]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const response = await httpClient.get<ListResponse<Order>>("/orders", {
        customerId,
        search: appliedSearch || undefined,
        status: status || undefined,
        paymentStatus: paymentStatus || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        undelivered: undelivered || undefined,
        limit: 100,
      });
      setOrders(response.items);
      setOrdersTotal(response.total);
    } catch {
      toast.error("No se pudo cargar el historial de pedidos.");
    } finally {
      setLoadingOrders(false);
    }
  }, [appliedSearch, customerId, dateFrom, dateTo, paymentStatus, status, undelivered]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  useEffect(() => {
    if (!loadingCustomer && customer) {
      loadOrders();
    }
  }, [loadOrders, loadingCustomer, customer]);

  function applySearch() {
    setAppliedSearch(search.trim());
  }

  function clearFilters() {
    setSearch("");
    setAppliedSearch("");
    setStatus("");
    setPaymentStatus("");
    setDateFrom("");
    setDateTo("");
    setUndelivered(false);
  }

  const hasFilters = Boolean(appliedSearch || status || paymentStatus || dateFrom || dateTo || undelivered);
  const deliveryAddress = customer ? formatCustomerDeliveryAddress(customer) : "";
  const locations = customer?.locations ?? [];

  if (loadingCustomer) {
    return (
      <div className="page-stack">
        <p className="page-kicker">Cargando cliente...</p>
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <Link
            href="/dashboard/customers"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            Volver a clientes
          </Link>
          <h1 className="page-title">{customer.name}</h1>
          <p className="page-kicker">Perfil del cliente e historial de pedidos.</p>
        </div>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          {can("customers", "update") ? (
            <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={() => setEditOpen(true)}>
              Editar información del cliente
            </Button>
          ) : null}
          <Button component={Link} href="/dashboard/orders/new" variant="contained">
            Nuevo pedido
          </Button>
        </Box>
      </div>

      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>Datos del cliente</h2>
            <p className="page-kicker">Contacto, domicilio y resumen de compras.</p>
          </div>
          <span className="pill">{customer.pricingTier === "wholesale" ? "Mayoreo" : "Menudeo"}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="WhatsApp" value={customer.phone || "—"} />
          <DetailField label="Correo" value={customer.email || "—"} />
          <DetailField label="Zona" value={customer.zone || "—"} />
          <DetailField label="Colonia" value={customer.colony || "—"} />
          <DetailField label="Código postal" value={customer.postalCode || "—"} />
          <DetailField label="Ciudad" value={customer.city || "—"} />
          <DetailField label="Domicilio predeterminado" value={deliveryAddress || "—"} />
          <DetailField label="Pedidos" value={String(customer.totalOrders ?? 0)} />
          <DetailField label="Compra acumulada" value={money(customer.totalSpent)} />
        </div>
        {locations.length > 0 ? (
          <div className="mt-4 grid gap-3">
            <Typography variant="subtitle2">Ubicaciones guardadas</Typography>
            {locations.map((location: CustomerLocation) => (
              <div key={location.id} className="rounded-xl border border-[var(--border)] p-3">
                <Typography sx={{ fontWeight: 700, color: "var(--glam-navy)" }}>
                  {location.label || "Ubicación"}
                  {location.isDefault ? " (predeterminada)" : ""}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {location.formattedAddress || formatCustomerDeliveryAddress(location)}
                </Typography>
                {location.googleMapsUrl ? (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    <a href={location.googleMapsUrl} target="_blank" rel="noreferrer">
                      Ver en Google Maps
                    </a>
                  </Typography>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {customer.notes ? (
          <div className="mt-4">
            <DetailField label="Notas" value={customer.notes} />
          </div>
        ) : null}
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Historial de pedidos</h2>
            <p className="page-kicker">Filtra por folio, fechas, estado y pago.</p>
          </div>
          <span className="pill">{ordersTotal.toLocaleString("es-MX")} pedidos</span>
        </div>
        <div className="mb-4 flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-[minmax(280px,1fr)_auto]">
            <input
              className="input"
              placeholder="Buscar por folio"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
            />
            <Button variant="outlined" onClick={applySearch} disabled={loadingOrders}>
              {loadingOrders ? "Cargando..." : "Buscar"}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(170px,1fr)_minmax(170px,1fr)_160px_160px]">
            <DateFilterField label="Desde" value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} />
            <DateFilterField label="Hasta" value={dateTo} onChange={setDateTo} min={dateFrom || undefined} />
            <select
              className="input"
              value={status}
              disabled={undelivered}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todos los estados</option>
              {orderStatuses.map((item) => (
                <option key={item} value={item}>
                  {statusLabels[item] || item}
                </option>
              ))}
            </select>
            <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              <option value="">Todos los pagos</option>
              {PAYMENT_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <FormControlLabel
              control={
                <Checkbox
                  checked={undelivered}
                  onChange={(e) => {
                    setUndelivered(e.target.checked);
                    if (e.target.checked) setStatus("");
                  }}
                />
              }
              label="Solo sin entregar"
            />
            {hasFilters ? (
              <Button size="small" variant="text" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        </div>
        <DataTable
          rows={orders}
          getKey={(row) => row.id}
          onRowClick={(row) => router.push(`/dashboard/orders/${row.id}`)}
          columns={[
            { key: "orderNumber", label: "Folio" },
            { key: "createdAt", label: "Fecha", render: (r) => formatOrderDate(r.createdAt) },
            {
              key: "status",
              label: "Estado",
              render: (r) => <span className="pill">{statusLabels[r.status] || r.status}</span>,
            },
            {
              key: "paymentStatus",
              label: "Pago",
              render: (r) => <span className="pill">{paymentStatusLabel(r.paymentStatus)}</span>,
            },
            { key: "total", label: "Total", render: (r) => money(r.total) },
          ]}
        />
      </section>

      <CustomerFormDialog
        open={editOpen}
        customer={customer}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          if (updated) setCustomer(updated);
        }}
      />
    </div>
  );
}
