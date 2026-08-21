"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { ArrowLeft, Download, Pencil, Printer } from "lucide-react";
import { OrderEditDialog } from "@/components/orders/OrderEditDialog";
import { OrderPrintSheet } from "@/components/orders/OrderPrintSheet";
import {
  orderCreatorLabel,
  orderStatusLabel,
  orderTeamLabel,
  paymentMethodLabel,
  paymentStatusLabel,
} from "@/constants/orders";
import { DetailField } from "@/components/ui/DetailField";
import { customerLocationMapsUrl } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { usePermissions } from "@/lib/permissions";
import { exportOrderToXlsx } from "@/lib/export-order-xlsx";
import { businessTimeZone } from "@/lib/business-time";
import { formatDateOnly } from "@/lib/format-date-only";
import { Order } from "@/types";
import { toast } from "sonner";

// Timestamp en la timezone del negocio, no la del navegador.
function formatOrderDate(value: string | Date | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX", {
    timeZone: businessTimeZone(),
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

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can, isAdmin } = usePermissions();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [printing, setPrinting] = useState(false);

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

  // Refresco en vivo si ESTE pedido cambió en otra sesión: recarga silenciosa
  // (sin spinner ni redirect en error) y nunca mientras el diálogo de edición
  // está abierto, para no pisar el formulario.
  const { subscribe } = useRealtime();
  useEffect(() => {
    return subscribe((event) => {
      if (event.type !== "orders_changed" || event.orderId !== params.id) return;
      if (editOpen) return;
      httpClient
        .get<OrderDetail>(`/orders/${params.id}`)
        .then(setOrder)
        .catch(() => undefined);
    });
  }, [subscribe, params.id, editOpen]);

  function handleDownload() {
    if (!order) return;
    exportOrderToXlsx(order);
    toast.success("Archivo Excel descargado");
  }

  /**
   * Imprimir (o guardar como PDF desde el diálogo del navegador) marca la nota
   * en el server: a partir de ahí la fila se pinta de azul en el listado. Se
   * puede reimprimir las veces que haga falta; la marca sigue siendo la de la
   * primera impresión.
   */
  async function handlePrint() {
    if (!order) return;
    setPrinting(true);
    try {
      const [printed] = await httpClient.post<OrderDetail[]>("/orders/print", {
        orderIds: [order.id],
      });
      if (printed) setOrder(printed);
      // Un tick para que el estado nuevo esté pintado antes del diálogo.
      setTimeout(() => window.print(), 100);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "No se pudo imprimir la nota."));
    } finally {
      setPrinting(false);
    }
  }

  async function restoreOrder() {
    if (!order) return;
    setRestoring(true);
    try {
      const restored = await httpClient.post<OrderDetail>(`/orders/${order.id}/restore`, {});
      toast.success(`Pedido ${restored.orderNumber} restaurado`);
      setOrder(restored);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "No se pudo restaurar el pedido."));
    } finally {
      setRestoring(false);
    }
  }

  async function confirmDraft() {
    if (!order) return;
    setConfirming(true);
    try {
      const confirmed = await httpClient.post<OrderDetail>(`/orders/${order.id}/confirm`, {});
      toast.success(
        `Pedido ${confirmed.orderNumber} creado${
          confirmed.scheduledDeliveryDate
            ? ` · entrega ${formatDateOnly(confirmed.scheduledDeliveryDate)}`
            : ""
        }`
      );
      setOrder(confirmed);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast.info("Este borrador ya fue confirmado.");
        await load();
      } else {
        toast.error(getApiErrorMessage(err, "No se pudo convertir el borrador."));
      }
    } finally {
      setConfirming(false);
    }
  }

  const isDraft = order?.status === "draft";
  // Un pedido eliminado se ve, pero no se edita ni se confirma: el server
  // responde 409. Solo un admin puede devolverlo con Restaurar.
  const isDeleted = order?.status === "deleted";

  if (loading) {
    return (
      <div className="page-stack">
        <p className="page-kicker">Cargando pedido...</p>
      </div>
    );
  }

  if (!order) return null;

  const items = order.items || [];
  // Ya impresa solo cambia la etiqueta del botón: reimprimir está permitido.
  const alreadyPrinted = Boolean(order.printedAt);
  const deliveryMapsUrl = order.deliveryLocation
    ? customerLocationMapsUrl(order.deliveryLocation)
    : "";

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
          <h1 className="page-title">
            {isDraft ? "Borrador" : "Pedido"} {order.orderNumber}
          </h1>
          <p className="page-kicker">
            {isDeleted
              ? "Eliminado: no cuenta en listados, totales ni reportes. Un administrador puede restaurarlo."
              : isDraft
                ? "Borrador sin confirmar: edítalo o conviértelo en pedido."
                : "Detalle completo del pedido y Productos."}
          </p>
        </div>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          {isDeleted && isAdmin ? (
            <Button variant="contained" disabled={restoring} onClick={() => void restoreOrder()}>
              {restoring ? "Restaurando..." : "Restaurar pedido"}
            </Button>
          ) : null}
          {!isDeleted && isDraft && can("orders", "update") ? (
            <>
              <Button
                variant="outlined"
                startIcon={<Pencil size={16} />}
                onClick={() => router.push(`/dashboard/orders/new?draftId=${order.id}`)}
              >
                Editar borrador
              </Button>
              <Button variant="contained" disabled={confirming} onClick={() => void confirmDraft()}>
                {confirming ? "Convirtiendo..." : "Convertir en pedido"}
              </Button>
            </>
          ) : null}
          {!isDeleted && !isDraft && can("orders", "update") ? (
            <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={() => setEditOpen(true)}>
              Editar
            </Button>
          ) : null}
          <Button variant="outlined" startIcon={<Download size={16} />} onClick={handleDownload}>
            Descargar Excel
          </Button>
          {can("orderPrint") ? (
            <Tooltip
              arrow
              title={
                alreadyPrinted
                  ? `Esta nota ya se imprimió${
                      order.printer?.name ? ` (${order.printer.name})` : ""
                    }; se conserva la marca de la primera impresión.`
                  : ""
              }
            >
              {/* span: el tooltip necesita un nodo propio que reciba el hover. */}
              <span>
                <Button
                  variant="outlined"
                  startIcon={<Printer size={16} />}
                  disabled={printing}
                  onClick={() => void handlePrint()}
                >
                  {printing ? "Preparando..." : alreadyPrinted ? "Reimprimir" : "Imprimir"}
                </Button>
              </span>
            </Tooltip>
          ) : null}
        </Box>
      </div>

      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>Resumen</h2>
            <p className="page-kicker">Informacion general del pedido.</p>
          </div>
          <span className="pill">{orderStatusLabel(order.status)}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Folio" value={order.orderNumber} />
          <DetailField label="Fecha" value={formatOrderDate(order.createdAt)} />
          <DetailField label="Estado de pago" value={paymentStatusLabel(order.paymentStatus)} />
          <DetailField label="Metodo de pago" value={paymentMethodLabel(order.paymentMethod)} />
          <DetailField label="Zona de entrega" value={order.deliveryZone || "—"} />
          <DetailField
            label="Fecha de entrega"
            value={
              order.scheduledDeliveryDate
                ? formatDateOnly(order.scheduledDeliveryDate, {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                : "Sin fecha"
            }
          />
          <DetailField label="Ventana horaria" value={order.deliveryTimeWindow || "—"} />
          <DetailField label="Creado por" value={orderCreatorLabel(order)} />
          <DetailField label="Equipo" value={orderTeamLabel(order)} />
          <DetailField
            label="Impresión de nota"
            value={
              order.printedAt
                ? `${formatOrderDate(order.printedAt)}${
                    order.printer?.name ? ` · ${order.printer.name}` : ""
                  }`
                : "Sin imprimir"
            }
          />
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
          {/* Domicilio elegido al capturar el pedido: la direccion es texto
              congelado; la ubicacion guardada aporta etiqueta y link de Maps. */}
          <DetailField
            label="Direccion"
            value={
              <>
                {order.deliveryAddress || order.customer?.address || "—"}
                {order.deliveryLocation?.label ? (
                  <Typography
                    variant="caption"
                    display="block"
                    sx={{ color: "var(--muted)", fontWeight: 500 }}
                  >
                    Domicilio: {order.deliveryLocation.label}
                  </Typography>
                ) : null}
                {deliveryMapsUrl ? (
                  <Typography variant="caption" display="block">
                    <a
                      href={deliveryMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--glam-blue)" }}
                    >
                      Ver en Google Maps
                    </a>
                  </Typography>
                ) : null}
              </>
            }
          />
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
          {Number(order.containersFee || 0) > 0 ? (
            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
              {/* Precio unitario derivado de fee/count: pedidos históricos siguen
                  correctos aunque cambie CONTAINER_UNIT_PRICE. */}
              Bidones ({Number(order.containersCount || 0)} ×{" "}
              {money(Number(order.containersFee) / Math.max(1, Number(order.containersCount || 0)))}):{" "}
              {money(order.containersFee)}
            </Typography>
          ) : null}
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

      <OrderPrintSheet order={order} />
    </div>
  );
}
