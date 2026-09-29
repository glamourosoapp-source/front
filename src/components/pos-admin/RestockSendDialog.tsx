"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { unitsPerRestockPackage } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import type { RestockOrder, RestockOrderItem } from "@/types";
import { packQtyLabel } from "./pos-labels";

interface RestockSendDialogProps {
  order: RestockOrder;
  /** Hoja del pedido en modo edición, para corregir antes de mandar. */
  editHref?: string | null;
  onClose: () => void;
  onSent: (order: RestockOrder) => void;
}

/** Lo que sale: lo despachado si ya se capturó, si no lo pedido. */
export function sentQty(item: RestockOrderItem): number {
  return item.dispatchedQty != null ? Number(item.dispatchedQty) : Number(item.requestedQty);
}

/** Litros o piezas que entran al inventario por esa cantidad de empaques. */
export function baseQty(item: RestockOrderItem, qty: number): number {
  return (
    qty *
    unitsPerRestockPackage({
      unit: item.lineId ? "bidon" : item.unit,
      litersPerUnit: item.litersPerUnit,
      unitsPerPackage: item.unitsPerPackage,
    })
  );
}

/**
 * Enviado a sucursal (con el módulo de fábrica apagado): confirma lo que sale
 * y, al aceptar, el pedido queda enviado y eso sube al inventario de la
 * sucursal. Si algo no va completo, "Editar antes de enviar" abre la hoja.
 */
export function RestockSendDialog({ order, editHref, onClose, onSent }: RestockSendDialogProps) {
  const items = (order.items ?? []).filter((item) => sentQty(item) > 0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const totals = items.reduce(
    (sum, item) => {
      const base = baseQty(item, sentQty(item));
      if (item.lineId) sum.liters += base;
      else sum.pieces += base;
      return sum;
    },
    { liters: 0, pieces: 0 }
  );

  async function send() {
    setSaving(true);
    try {
      const updated = await httpClient.post<RestockOrder>(`/pos/restock/orders/${order.id}/send`, {
        notes: notes.trim() ? notes.trim() : null,
      });
      toast.success(
        `Enviado a ${order.branch?.name ?? "la sucursal"}: ${formatQuantity(totals.liters)} L y ${formatQuantity(totals.pieces)} pz subieron al inventario`
      );
      onSent(updated);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo enviar el pedido"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Enviado a sucursal</DialogTitle>
      <DialogContent dividers>
        <p className="page-kicker" style={{ marginTop: 0 }}>
          El pedido queda enviado y esto sube <strong>ahora</strong> al inventario de{" "}
          {order.branch?.name ?? "la sucursal"}. Si algo no va completo porque no hay en fábrica, edítalo antes.
        </p>
        <div className="table-container-premium" style={{ maxHeight: 320, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th style={{ textAlign: "right" }}>Se envía</th>
                <th style={{ textAlign: "right" }}>Entra</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.productName}</td>
                  <td style={{ textAlign: "right" }}>
                    {packQtyLabel(sentQty(item), item.unit, item.unitsPerPackage)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatQuantity(baseQty(item, sentQty(item)))} {item.lineId ? "L" : "pz"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <span className="page-kicker" style={{ margin: 0 }}>
            Entran {formatQuantity(totals.liters)} L · {formatQuantity(totals.pieces)} pz
          </span>
          {order.total != null ? (
            <span className="page-kicker" style={{ margin: 0 }}>
              Total del pedido <strong>{formatMoney(order.total)}</strong>
            </span>
          ) : null}
        </div>
        <TextField
          label="Nota del envío (opcional)"
          placeholder="Quién lo llevó, remisión…"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          fullWidth
          size="small"
          sx={{ mt: 2 }}
          inputProps={{ maxLength: 500 }}
        />
      </DialogContent>
      <DialogActions>
        {editHref ? (
          <Button component={Link} href={editHref} startIcon={<Pencil size={14} />} disabled={saving} sx={{ mr: "auto" }}>
            Editar antes de enviar
          </Button>
        ) : null}
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void send()} disabled={saving || !items.length}>
          {saving ? "Enviando..." : "Marcar enviado y subir al inventario"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
