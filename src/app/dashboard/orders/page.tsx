"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, FormControlLabel } from "@mui/material";
import { OrderEditDialog } from "@/components/orders/OrderEditDialog";
import { DataTable } from "@/components/ui/DataTable";
import { DateFilterField } from "@/components/ui/DateFilterField";
import { PAYMENT_STATUS_OPTIONS, paymentStatusLabel } from "@/constants/orders";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { ListResponse, Order } from "@/types";
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
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await httpClient.get<ListResponse<Order>>("/orders", {
        search: appliedSearch || undefined,
        status: status || undefined,
        paymentStatus: paymentStatus || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        undelivered: undelivered || undefined,
        limit: 100,
      });
      setOrders(response.items);
      setTotal(response.total);
    } catch {
      toast.error("No se pudieron cargar los pedidos.");
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, dateFrom, dateTo, paymentStatus, status, undelivered]);

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

  const hasFilters = Boolean(appliedSearch || status || paymentStatus || dateFrom || dateTo || undelivered);

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
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Pedidos recientes</h2>
            <p className="page-kicker">Busca por folio o cliente; combina con fechas, estado y pago.</p>
          </div>
          <span className="pill">{total.toLocaleString("es-MX")} pedidos</span>
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
          getDeleteLabel={(row) => `el pedido ${row.orderNumber}`}
          onRowClick={(row) => router.push(`/dashboard/orders/${row.id}`)}
          onEdit={can("orders", "update") ? openEdit : undefined}
          onDelete={can("orders", "delete") ? remove : undefined}
          columns={[
            { key: "orderNumber", label: "Folio" },
            { key: "createdAt", label: "Fecha", render: (r) => formatOrderDate(r.createdAt) },
            { key: "customer", label: "Cliente", render: (r) => r.customer?.name || "" },
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
