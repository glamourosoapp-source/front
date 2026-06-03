"use client";

import { FormEvent } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_STATUS_OPTIONS } from "@/constants/orders";
import { httpClient } from "@/services/http-client";
import { Order } from "@/types";
import { toast } from "sonner";

const orderStatuses = ["new", "processing", "delivered", "cancelled"];

const statusLabels: Record<string, string> = {
  new: "Nuevo",
  processing: "En proceso",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

interface OrderEditDialogProps {
  open: boolean;
  order: Order | null;
  onClose: () => void;
  onSaved: () => void;
}

export function OrderEditDialog({ open, order, onClose, onSaved }: OrderEditDialogProps) {
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;

    const form = new FormData(event.currentTarget);
    try {
      await httpClient.put(`/orders/${order.id}`, {
        status: String(form.get("status") || order.status),
        paymentStatus: String(form.get("paymentStatus") || order.paymentStatus),
        paymentMethod: String(form.get("paymentMethod") || ""),
        deliveryAddress: String(form.get("address") || ""),
        deliveryZone: String(form.get("deliveryZone") || ""),
        customerNotes: String(form.get("customerNotes") || ""),
        internalNotes: String(form.get("internalNotes") || ""),
      });
      toast.success("Pedido actualizado con éxito");
      onClose();
      onSaved();
    } catch {
      toast.error("Error al guardar el pedido");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" key={order?.id}>
      <form onSubmit={save}>
        <DialogTitle>Editar pedido {order?.orderNumber}</DialogTitle>
        <DialogContent className="form-grid" dividers>
          <TextField select name="status" label="Estado" defaultValue={order?.status || "new"} fullWidth>
            {orderStatuses.map((item) => (
              <MenuItem key={item} value={item}>
                {statusLabels[item] || item}
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
          <TextField name="address" label="Direccion de entrega" defaultValue={order?.deliveryAddress || ""} fullWidth multiline minRows={2} />
          <TextField name="deliveryZone" label="Zona de entrega" defaultValue={order?.deliveryZone || ""} fullWidth />
          <TextField name="customerNotes" label="Notas cliente" defaultValue={order?.customerNotes || ""} fullWidth multiline minRows={2} />
          <TextField name="internalNotes" label="Notas internas" defaultValue={order?.internalNotes || ""} fullWidth multiline minRows={2} />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
