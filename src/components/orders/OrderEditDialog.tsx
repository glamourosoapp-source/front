"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { ORDER_STATUS_OPTIONS, PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/constants/orders";
import { CONTAINER_UNIT_PRICE, type PricingTier } from "@glamouroso/shared";
import {
  OrderItemsEditor,
  lineItemsFromOrder,
  lineItemsPayload,
  orderTotals,
  type OrderLineItem,
} from "@/components/orders/OrderItemsEditor";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { Order } from "@/types";
import { toast } from "sonner";

const DELIVERY_WINDOWS = ["09:00-13:00", "13:00-17:00", "17:00-20:00"];

interface OrderEditDialogProps {
  open: boolean;
  order: Order | null;
  onClose: () => void;
  onSaved: () => void;
}

export function OrderEditDialog({ open, order, onClose, onSaved }: OrderEditDialogProps) {
  const { can } = usePermissions();
  const [saving, setSaving] = useState(false);
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  // Las partidas solo viajan si se tocaron: mandarlas siempre repreciaría el
  // pedido con el catálogo actual aunque el usuario solo cambiara el estatus.
  const [itemsDirty, setItemsDirty] = useState(false);
  const [defaultTier, setDefaultTier] = useState<PricingTier>("retail");

  const orderId = open ? (order?.id ?? null) : null;

  // El listado no trae partidas ni el producto de catálogo: se recarga el
  // pedido completo para poder repreciar por fila.
  const loadItems = useCallback(async (id: string) => {
    setLoadingItems(true);
    try {
      const full = await httpClient.get<Order>(`/orders/${id}`);
      setLineItems(lineItemsFromOrder(full.items ?? []));
      setDefaultTier((full.customer?.pricingTier as PricingTier) || "retail");
    } catch {
      toast.error("No se pudieron cargar los productos del pedido");
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    setLineItems([]);
    setItemsDirty(false);
    if (!orderId) return;
    void loadItems(orderId);
  }, [orderId, loadItems]);

  const canEditItems = can("orders", "update");
  const totals = orderTotals(lineItems);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;
    if (itemsDirty && lineItems.length === 0) {
      toast.error("El pedido debe quedar con al menos un producto");
      return;
    }

    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await httpClient.put(`/orders/${order.id}`, {
        status: String(form.get("status") || order.status),
        paymentStatus: String(form.get("paymentStatus") || order.paymentStatus),
        paymentMethod: String(form.get("paymentMethod") || ""),
        deliveryAddress: String(form.get("address") || ""),
        deliveryZone: String(form.get("deliveryZone") || ""),
        scheduledDeliveryDate: String(form.get("scheduledDeliveryDate") || "") || null,
        deliveryTimeWindow: String(form.get("deliveryTimeWindow") || "") || null,
        customerNotes: String(form.get("customerNotes") || ""),
        internalNotes: String(form.get("internalNotes") || ""),
        // Editar partidas recalcula subtotal, bidones y total server-side.
        ...(itemsDirty ? { items: lineItemsPayload(lineItems) } : {}),
      });
      toast.success("Pedido actualizado con éxito");
      onClose();
      onSaved();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Error al guardar el pedido"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" key={order?.id}>
      <form onSubmit={save}>
        <DialogTitle>Editar pedido {order?.orderNumber}</DialogTitle>
        <DialogContent dividers>
          <Box className="form-grid">
            <TextField select name="status" label="Estado" defaultValue={order?.status || "new"} fullWidth>
              {ORDER_STATUS_OPTIONS.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select name="paymentStatus" label="Estado de pago" defaultValue={order?.paymentStatus || "unpaid"} fullWidth>
              {PAYMENT_STATUS_OPTIONS.map((item) => (
                <MenuItem key={item.value} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select name="paymentMethod" label="Metodo de pago" defaultValue={order?.paymentMethod || ""} fullWidth>
              {PAYMENT_METHOD_OPTIONS.map((item) => (
                <MenuItem key={item.value || "none"} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              name="scheduledDeliveryDate"
              label="Fecha de entrega"
              type="date"
              defaultValue={order?.scheduledDeliveryDate || ""}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField select name="deliveryTimeWindow" label="Ventana horaria" defaultValue={order?.deliveryTimeWindow || ""} fullWidth>
              <MenuItem value="">Sin ventana</MenuItem>
              {DELIVERY_WINDOWS.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>
            <TextField name="address" label="Direccion de entrega" defaultValue={order?.deliveryAddress || ""} fullWidth multiline minRows={2} />
            <TextField name="deliveryZone" label="Zona de entrega" defaultValue={order?.deliveryZone || ""} fullWidth />
            <TextField name="customerNotes" label="Notas cliente" defaultValue={order?.customerNotes || ""} fullWidth multiline minRows={2} />
            <TextField name="internalNotes" label="Notas internas" defaultValue={order?.internalNotes || ""} fullWidth multiline minRows={2} />
          </Box>

          <Divider sx={{ my: 3 }} />

          <Typography variant="h6" sx={{ color: "var(--glam-navy)", fontWeight: 700, mb: 0.5 }}>
            Productos
          </Typography>
          <Typography variant="body2" sx={{ color: "var(--muted)", mb: 2 }}>
            Cada partida va en menudeo o en mayoreo; las de mayoreo salen en rojo en la nota
            impresa. Al guardar, los precios se recalculan con el catálogo actual y la lista de cada
            fila.
          </Typography>

          {loadingItems ? (
            <Typography sx={{ color: "var(--muted)", py: 3, textAlign: "center" }}>
              Cargando productos…
            </Typography>
          ) : (
            <>
              <OrderItemsEditor
                items={lineItems}
                onChange={(next) => {
                  setLineItems(next);
                  setItemsDirty(true);
                }}
                defaultTier={defaultTier}
                disabled={saving || !canEditItems}
                hideTotals
              />
              {itemsDirty ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Nuevo total: ${totals.total.toFixed(2)} (productos ${totals.subtotal.toFixed(2)} +{" "}
                  {totals.containersCount} bidones × ${CONTAINER_UNIT_PRICE.toFixed(2)}). Los
                  acumulados del cliente se recalculan al guardar.
                </Alert>
              ) : null}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={saving || loadingItems}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
