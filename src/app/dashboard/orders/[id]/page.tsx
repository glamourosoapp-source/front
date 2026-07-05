"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { ArrowLeft, Download, Pencil } from "lucide-react";
import { OrderEditDialog } from "@/components/orders/OrderEditDialog";
import { paymentMethodLabel, paymentStatusLabel } from "@/constants/orders";
import { httpClient } from "@/services/http-client";
import { exportOrderToXlsx } from "@/lib/export-order-xlsx";
import { Order } from "@/types";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  new: "Nuevo",
  processing: "En proceso",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

function formatOrderDate(value: string | Date | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function money(value: string | number | undefined) {
  return `$${Number(value || 0).toFixed(2)}`;
}

type OrderDetail = Omit<Order, "items"> & {
  paymentMethod?: string | null;
  deliveryZone?: string | null;
  subtotal?: string | number;
  deliveryFee?: string | number;
  discount?: string | number;
  customerNotes?: string | null;
  internalNotes?: string | null;
  items?: Array<{
    id: string;
    productName: string;
    unit?: string;
    quantity: string | number;
    unitPrice: string | number;
    total: string | number;
    notes?: string | null;
  }>;
};

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

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await httpClient.get<OrderDetail>(`/orders/${params.id}`);
      setOrder(data);
    } catch {
      toast.error("No se pudo cargar el pedido.");
      router.push("/dashboard/orders");
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDownload() {
    if (!order) return;
    exportOrderToXlsx(order);
    toast.success("Archivo Excel descargado");
  }

  if (loading) {
    return (
      <div className="page-stack">
        <p className="page-kicker">Cargando pedido...</p>
      </div>
    );
  }

  if (!order) return null;

  const items = order.items || [];

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <Link
            href="/dashboard/orders"
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            Volver a pedidos
          </Link>
          <h1 className="page-title">Pedido {order.orderNumber}</h1>
          <p className="page-kicker">Detalle completo del pedido y Productos.</p>
        </div>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={() => setEditOpen(true)}>
            Editar
          </Button>
          <Button variant="outlined" startIcon={<Download size={16} />} onClick={handleDownload}>
            Descargar Excel
          </Button>
        </Box>
      </div>

      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>Resumen</h2>
            <p className="page-kicker">Informacion general del pedido.</p>
          </div>
          <span className="pill">{statusLabels[order.status] || order.status}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Folio" value={order.orderNumber} />
          <DetailField label="Fecha" value={formatOrderDate(order.createdAt)} />
          <DetailField label="Estado de pago" value={paymentStatusLabel(order.paymentStatus)} />
          <DetailField label="Metodo de pago" value={paymentMethodLabel(order.paymentMethod)} />
          <DetailField label="Zona de entrega" value={order.deliveryZone || "—"} />
          <DetailField label="Total" value={money(order.total)} />
        </div>
      </section>

      <section className="panel p-5">
        <h2>Cliente y entrega</h2>
        <p className="page-kicker mb-4">Datos de contacto y direccion de entrega.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Cliente" value={order.customer?.name || "—"} />
          <DetailField label="WhatsApp" value={order.customer?.phone || "—"} />
          <DetailField label="Colonia" value={order.customer?.colony || "—"} />
          <DetailField label="Direccion" value={order.deliveryAddress || order.customer?.address || "—"} />
        </div>
        {(order.customerNotes || order.internalNotes) && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {order.customerNotes ? <DetailField label="Notas del cliente" value={order.customerNotes} /> : null}
            {order.internalNotes ? <DetailField label="Notas internas" value={order.internalNotes} /> : null}
          </div>
        )}
      </section>

      <section className="panel p-5">
        <h2>Productos</h2>
        <p className="page-kicker mb-4">{items.length} producto{items.length === 1 ? "" : "s"} en el pedido.</p>

        {items.length === 0 ? (
          <Typography sx={{ color: "var(--muted)", py: 4, textAlign: "center" }}>
            Este pedido no tiene Productos registradas.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Producto</TableCell>
                  <TableCell>Unidad</TableCell>
                  <TableCell align="right">Cantidad</TableCell>
                  <TableCell align="right">Precio unit.</TableCell>
                  <TableCell align="right">Subtotal</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <strong>{item.productName}</strong>
                      {item.notes ? (
                        <Typography variant="caption" display="block" sx={{ color: "var(--muted)" }}>
                          {item.notes}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>{item.unit || "—"}</TableCell>
                    <TableCell align="right">{Number(item.quantity)}</TableCell>
                    <TableCell align="right">{money(item.unitPrice)}</TableCell>
                    <TableCell align="right">{money(item.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Box sx={{ mt: 3, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
            Subtotal: {money(order.subtotal ?? order.total)}
          </Typography>
          {Number(order.deliveryFee || 0) > 0 ? (
            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
              Envio: {money(order.deliveryFee)}
            </Typography>
          ) : null}
          {Number(order.discount || 0) > 0 ? (
            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
              Descuento: -{money(order.discount)}
            </Typography>
          ) : null}
          <Typography variant="h6" sx={{ color: "var(--glam-navy)", fontWeight: 700, mt: 0.5 }}>
            Total: {money(order.total)}
          </Typography>
        </Box>
      </section>

      <OrderEditDialog
        open={editOpen}
        order={order}
        onClose={() => setEditOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
