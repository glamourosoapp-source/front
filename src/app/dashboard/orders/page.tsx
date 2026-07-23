"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, FormControlLabel, Tab, Tabs } from "@mui/material";
import { OrderEditDialog } from "@/components/orders/OrderEditDialog";
import { DataTable } from "@/components/ui/DataTable";
import { DateFilterField } from "@/components/ui/DateFilterField";
import { PAYMENT_STATUS_OPTIONS, orderCreatorLabel, paymentStatusLabel } from "@/constants/orders";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { formatDateOnly, localDateOnly } from "@/lib/format-date-only";
import { exportOrdersToPdf, exportOrdersToXlsx } from "@/lib/export-orders-list";
import { ListResponse, Order } from "@/types";
import { toast } from "sonner";

type DeliveryTab = "today" | "tomorrow" | "upcoming" | "all";

const TAB_LABELS: Record<DeliveryTab, string> = {
  today: "Hoy",
  tomorrow: "Mañana",
  upcoming: "Próximos",
  all: "Todos",
};

/** Params de fecha de entrega según el tab activo. */
function deliveryParams(tab: DeliveryTab, unscheduledOnly: boolean) {
  switch (tab) {
    case "today":
      return { deliveryFrom: localDateOnly(0), deliveryTo: localDateOnly(0), sortBy: "deliveryDate" };
    case "tomorrow":
      return { deliveryFrom: localDateOnly(1), deliveryTo: localDateOnly(1), sortBy: "deliveryDate" };
    case "upcoming":
      return { deliveryFrom: localDateOnly(2), sortBy: "deliveryDate" };
    case "all":
      return unscheduledOnly ? { unscheduled: true } : {};
  }
}

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

export default function OrdersPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [undelivered, setUndelivered] = useState(false);
  const [tab, setTab] = useState<DeliveryTab>("today");
  const [unscheduledOnly, setUnscheduledOnly] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);

  const buildParams = useCallback(
    () => ({
      search: appliedSearch || undefined,
      status: status || undefined,
      paymentStatus: paymentStatus || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      undelivered: undelivered || undefined,
      ...deliveryParams(tab, unscheduledOnly),
    }),
    [appliedSearch, dateFrom, dateTo, paymentStatus, status, tab, undelivered, unscheduledOnly]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await httpClient.get<ListResponse<Order>>("/orders", {
        ...buildParams(),
        limit: 100,
      });
      setOrders(response.items);
      setTotal(response.total);
    } catch {
      toast.error("No se pudieron cargar los pedidos.");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  /** Trae TODO lo filtrado paginando (el tope del API es 200 por página). */
  const fetchAllFiltered = useCallback(async () => {
    const params = buildParams();
    const all: Order[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await httpClient.get<ListResponse<Order>>("/orders", {
        ...params,
        page,
        limit: 200,
      });
      all.push(...response.items);
      totalPages = response.totalPages || 1;
      page += 1;
    } while (page <= totalPages && page <= 50);
    return all;
  }, [buildParams]);

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(true);
    try {
      const all = await fetchAllFiltered();
      if (!all.length) {
        toast.info("No hay pedidos para exportar con los filtros actuales.");
        return;
      }
      const context = { scopeLabel: TAB_LABELS[tab] };
      if (format === "xlsx") await exportOrdersToXlsx(all, context);
      else await exportOrdersToPdf(all, context);
    } catch {
      toast.error("No se pudo generar la exportación.");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  function applySearch() {
    setAppliedSearch(search.trim());
  }

  function openEdit(order: Order) {
    setEditing(order);
    setOpen(true);
  }

  function clearFilters() {
    setSearch("");
    setAppliedSearch("");
    setStatus("");
    setPaymentStatus("");
    setDateFrom("");
    setDateTo("");
    setUndelivered(false);
    setUnscheduledOnly(false);
  }

  async function remove(order: Order) {
    try {
      await httpClient.delete(`/orders/${order.id}`);
      toast.success(`Pedido ${order.orderNumber} eliminado con éxito`);
      await load();
    } catch {
      toast.error("Error al eliminar el pedido");
    }
  }

  const hasFilters = Boolean(
    appliedSearch || status || paymentStatus || dateFrom || dateTo || undelivered || unscheduledOnly
  );

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Pedidos</h1>
          <p className="page-kicker">Alta rapida y seguimiento de pedidos capturados desde el panel o WhatsApp.</p>
        </div>
        {can("orders", "create") ? (
          <Button component={Link} href="/dashboard/orders/new" variant="contained">
            Nuevo pedido
          </Button>
        ) : null}
      </div>
      <section className="panel p-4">
        <Tabs
          value={tab}
          onChange={(_, value: DeliveryTab) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab value="today" label="Entregas de hoy" />
          <Tab value="tomorrow" label="Mañana" />
          <Tab value="upcoming" label="Próximos" />
          <Tab value="all" label="Todos" />
        </Tabs>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>{tab === "all" ? "Pedidos recientes" : `Pedidos con entrega: ${TAB_LABELS[tab]}`}</h2>
            <p className="page-kicker">Busca por folio o cliente; combina con fechas, estado y pago.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="small" variant="outlined" disabled={exporting || !orders.length} onClick={() => handleExport("xlsx")}>
              {exporting ? "Exportando..." : "Excel"}
            </Button>
            <Button size="small" variant="outlined" disabled={exporting || !orders.length} onClick={() => handleExport("pdf")}>
              PDF
            </Button>
            <span className="pill">{total.toLocaleString("es-MX")} pedidos</span>
          </div>
        </div>
        <div className="mb-4 flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-[minmax(280px,1fr)_auto]">
            <input
              className="input"
              placeholder="Buscar por folio o nombre de cliente"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
            />
            <Button variant="outlined" onClick={applySearch} disabled={loading}>
              {loading ? "Cargando..." : "Buscar"}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(170px,1fr)_minmax(170px,1fr)_160px_160px]">
            <DateFilterField label="Creado desde" value={dateFrom} onChange={setDateFrom} max={dateTo || undefined} />
            <DateFilterField label="Creado hasta" value={dateTo} onChange={setDateTo} min={dateFrom || undefined} />
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
            {tab === "all" ? (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={unscheduledOnly}
                    onChange={(e) => setUnscheduledOnly(e.target.checked)}
                  />
                }
                label="Solo sin fecha de entrega"
              />
            ) : null}
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
          getDeleteLabel={(row) => `el pedido ${row.orderNumber}`}
          onRowClick={(row) => router.push(`/dashboard/orders/${row.id}`)}
          onEdit={can("orders", "update") ? openEdit : undefined}
          onDelete={can("orders", "delete") ? remove : undefined}
          columns={[
            { key: "orderNumber", label: "Folio" },
            { key: "createdAt", label: "Fecha", render: (r) => formatOrderDate(r.createdAt) },
            {
              key: "scheduledDeliveryDate",
              label: "Entrega",
              render: (r) =>
                r.scheduledDeliveryDate ? (
                  <span>
                    {formatDateOnly(r.scheduledDeliveryDate)}
                    {r.deliveryTimeWindow ? ` · ${r.deliveryTimeWindow}` : ""}
                  </span>
                ) : (
                  <span className="pill">Sin fecha</span>
                ),
            },
            { key: "customer", label: "Cliente", render: (r) => r.customer?.name || "" },
            { key: "creator", label: "Creado por", render: (r) => orderCreatorLabel(r) },
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
            { key: "total", label: "Total", render: (r) => `$${Number(r.total).toFixed(2)}` },
          ]}
        />
      </section>

      <OrderEditDialog
        open={open}
        order={editing}
        onClose={() => setOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
