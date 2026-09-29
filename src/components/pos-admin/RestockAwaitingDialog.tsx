"use client";

import Link from "next/link";
import axios from "axios";
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import { Eye, PackagePlus, Truck } from "lucide-react";
import { formatMoney } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import type { RestockOrder } from "@/types";
import {
  RESTOCK_STATUS_COLORS,
  RESTOCK_STATUS_LABELS,
  formatDateTime,
  relativeDays,
  restockOrderSheetHref,
} from "./pos-labels";
import { isOpenRestockOrder, restockArrivalHref } from "./RestockOrderActions";

/** El Back responde 409 con este código cuando la sucursal ya tiene un pedido en camino. */
export function isAwaitingOrderError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const data = error.response?.data as { error?: { details?: { code?: string } } } | undefined;
  return error.response?.status === 409 && data?.error?.details?.code === "RESTOCK_ORDER_AWAITING";
}

/** El pedido que bloquea: el más viejo de los que siguen en camino. */
export function blockingRestockOrder(awaiting: RestockOrder[]): RestockOrder | null {
  if (!awaiting.length) return null;
  return [...awaiting].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] ?? null;
}

interface RestockAwaitingDialogProps {
  /** El pedido en camino; `null` cierra el modal. */
  order: RestockOrder | null;
  branchLabel?: string | null;
  onClose: () => void;
}

/**
 * Alerta al intentar confirmar un pedido a fábrica cuando la sucursal ya tiene
 * uno en camino: no se puede crear otro hasta que ese se registre como
 * recibido (el faltante no descuenta lo que viene y se pediría dos veces).
 * El Back aplica la misma regla con un 409, así que el modal es la explicación,
 * no el candado.
 */
export function RestockAwaitingDialog({ order, branchLabel, onClose }: RestockAwaitingDialogProps) {
  const { can } = usePermissions();
  const canRegister = can("posRestock", "update") && can("posInventory", "update");
  const open = Boolean(order);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Truck size={20} style={{ color: "var(--glam-blue)" }} />
        Ya hay un pedido en camino
      </DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {branchLabel ? <strong>{branchLabel}</strong> : "Esta sucursal"} ya tiene un pedido a fábrica creado y en
          camino. <strong>No se puede crear otro hasta que ese pedido cambie a Recibido.</strong>
        </Alert>
        {order ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "6px 16px",
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            <span>
              <strong>Pedido del {formatDateTime(order.createdAt)}</strong>
              <div className="page-kicker" style={{ margin: 0 }}>
                {relativeDays(order.createdAt)} · {order.items?.length ?? 0}{" "}
                {(order.items?.length ?? 0) === 1 ? "partida" : "partidas"}
              </div>
            </span>
            <span style={{ textAlign: "right" }}>
              <Chip
                size="small"
                label={RESTOCK_STATUS_LABELS[order.status] ?? order.status}
                color={RESTOCK_STATUS_COLORS[order.status] ?? "default"}
              />
              {order.total != null ? (
                <div style={{ fontWeight: 700, marginTop: 4 }}>{formatMoney(order.total)}</div>
              ) : null}
            </span>
          </div>
        ) : null}
        <p className="page-kicker" style={{ marginBottom: 0 }}>
          Cuando llegue el producto, usa <strong>Registrar llegada</strong> en ese pedido (o{" "}
          <strong>Confirmar llegada</strong> si ya estaba marcado como enviado). Si ese pedido ya no va a llegar,
          cancélalo desde su menú &quot;⋯&quot; y entonces podrás confirmar uno nuevo.
        </p>
      </DialogContent>
      <DialogActions>
        {order ? (
          <Button component={Link} href={restockOrderSheetHref(order.id)} startIcon={<Eye size={16} />} sx={{ mr: "auto" }}>
            Ver pedido
          </Button>
        ) : null}
        <Button onClick={onClose}>Entendido</Button>
        {order && canRegister && isOpenRestockOrder(order) ? (
          <Button
            variant="contained"
            color="success"
            component={Link}
            href={restockArrivalHref(order)}
            startIcon={<PackagePlus size={16} />}
          >
            Registrar llegada
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
