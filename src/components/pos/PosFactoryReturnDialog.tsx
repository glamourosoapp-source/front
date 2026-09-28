"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";
import { Undo2 } from "lucide-react";
import {
  FACTORY_RETURN_REASONS,
  FACTORY_RETURN_REASON_LABELS,
  type FactoryReturnReason,
} from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatQuantity } from "@/lib/format-money";
import type { PosLine } from "@/lib/pos/ticket";
import type { FactoryReturn } from "@/types";

interface ReturnableOrder {
  id: string;
  origin: string;
  status: string;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  itemsCount: number;
}

const REASONS = Object.values(FACTORY_RETURN_REASONS) as FactoryReturnReason[];

function orderLabel(order: ReturnableOrder): string {
  const at = order.receivedAt ?? order.sentAt ?? order.createdAt;
  const when = new Date(at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  const state = order.status === "received" ? "llegó" : "en camino";
  return `${order.id.slice(0, 8).toUpperCase()} · ${state} ${when} · ${order.itemsCount} partidas`;
}

/**
 * Registra la devolución a fábrica que se capturó en la pestaña Devolución
 * (F9 → captura → F12). Se liga al pedido que acaba de llegar con el
 * transportista (el primero de la lista) y cada partida lleva su motivo.
 *
 * A diferencia del cobro, necesita red: la devolución vive ligada a un pedido
 * del servidor y la hoja del transportista tiene que llevar el folio real.
 */
export function PosFactoryReturnDialog({
  open,
  lines,
  onClose,
  onRegistered,
}: {
  open: boolean;
  lines: PosLine[];
  onClose: () => void;
  onRegistered: (ret: FactoryReturn) => void;
}) {
  const [orders, setOrders] = useState<ReturnableOrder[]>([]);
  const [orderId, setOrderId] = useState("");
  const [reasons, setReasons] = useState<Record<string, FactoryReturnReason>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Una llave por apertura: reintentar tras un error de red no duplica.
    setIdempotencyKey(crypto.randomUUID());
    setReasons({});
    setNotes("");
    setError(null);
    setLoading(true);
    httpClient
      .get<ReturnableOrder[]>("/pos/factory-returns/orders")
      .then((rows) => {
        setOrders(rows);
        setOrderId(rows[0]?.id ?? "");
      })
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [open]);

  const reasonOf = (key: string) => reasons[key] ?? FACTORY_RETURN_REASONS.BROKEN;

  async function register() {
    setSaving(true);
    try {
      const ret = await httpClient.post<FactoryReturn>("/pos/factory-returns", {
        idempotencyKey,
        restockOrderId: orderId || null,
        notes: notes.trim() || null,
        items: lines.map((line) => ({
          saleUnit: line.kind,
          productId: line.kind === "piece" ? line.productId : null,
          lineId: line.kind === "liter" ? line.lineId : null,
          quantity: line.quantity,
          reason: reasonOf(line.key),
        })),
      });
      onRegistered(ret);
    } catch (error) {
      setError(getApiErrorMessage(error, "No se pudo registrar la devolución. Revisa la conexión."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => (saving ? null : onClose())} fullWidth maxWidth="md">
      <DialogTitle sx={{ color: "#b91c1c", display: "flex", alignItems: "center", gap: 1 }}>
        <Undo2 size={20} /> Registrar devolución a fábrica
      </DialogTitle>
      <DialogContent dividers className="form-grid">
        <TextField
          select
          label="Pedido que trae el transportista"
          value={orderId}
          onChange={(event) => setOrderId(event.target.value)}
          SelectProps={{ displayEmpty: true }}
          InputLabelProps={{ shrink: true }}
          helperText={
            loading
              ? "Buscando pedidos..."
              : orders.length
                ? "Lo devuelto se marca en rojo en este pedido."
                : "Esta sucursal no tiene pedidos que ya hayan salido de fábrica: la devolución queda sin pedido."
          }
        >
          <MenuItem value="">Sin pedido</MenuItem>
          {orders.map((order) => (
            <MenuItem key={order.id} value={order.id}>
              {orderLabel(order)}
            </MenuItem>
          ))}
        </TextField>

        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th style={{ textAlign: "right" }}>Cantidad</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td>{line.name}</td>
                <td style={{ textAlign: "right" }}>
                  {formatQuantity(line.quantity)} {line.kind === "liter" ? "L" : "pz"}
                </td>
                <td>
                  <TextField
                    select
                    size="small"
                    value={reasonOf(line.key)}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [line.key]: event.target.value as FactoryReturnReason }))
                    }
                    inputProps={{ "aria-label": `Motivo de ${line.name}` }}
                    sx={{ minWidth: 180 }}
                  >
                    {REASONS.map((reason) => (
                      <MenuItem key={reason} value={reason}>
                        {FACTORY_RETURN_REASON_LABELS[reason]}
                      </MenuItem>
                    ))}
                  </TextField>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <TextField
          label="Nota (opcional)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          inputProps={{ maxLength: 500 }}
          placeholder="Ej. llegaron golpeados en el viaje del lunes"
        />
        <p className="page-kicker" style={{ margin: 0 }}>
          Sale del inventario de la sucursal y se imprimen dos tickets marcados DEVOLUCIÓN: uno se queda
          aquí y el otro, firmado, se lo lleva el transportista. No es venta: no entra a la caja.
        </p>
        {error ? <p style={{ color: "#b91c1c", margin: 0, fontWeight: 600 }}>{error}</p> : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => void register()}
          disabled={saving || loading || !lines.length}
        >
          {saving ? "Registrando..." : "Registrar e imprimir"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
