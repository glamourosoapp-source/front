"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { Check, Eye, FileDown, MoreHorizontal, PackageCheck, PackagePlus, Pencil, Send, X } from "lucide-react";
import { toast } from "sonner";
import { RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import { config } from "@/config";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import type { RestockOrder } from "@/types";
import { approvedRestockMessage, formatDateTime, restockOrderSheetHref } from "./pos-labels";
import { RestockSendDialog } from "./RestockSendDialog";
import { useFactoryFormDownload } from "./useFactoryFormDownload";

/** Pendiente, aprobado o en preparación: todavía no llega a la sucursal. */
export function isOpenRestockOrder(order: Pick<RestockOrder, "status">): boolean {
  return (
    order.status === RESTOCK_ORDER_STATUS.PENDING ||
    order.status === RESTOCK_ORDER_STATUS.APPROVED ||
    order.status === RESTOCK_ORDER_STATUS.PREPARING
  );
}

/** Abierto o enviado: lo que la sucursal todavía tiene "por recibir". */
export function isAwaitingRestockOrder(order: Pick<RestockOrder, "status">): boolean {
  return isOpenRestockOrder(order) || order.status === RESTOCK_ORDER_STATUS.SENT;
}

/** Hoja de llegada de surtido precargada con este pedido. */
export function restockArrivalHref(order: Pick<RestockOrder, "id" | "branchId">): string {
  return `/dashboard/pos/sucursales/${order.branchId}/entrada?order=${order.id}`;
}

interface RestockOrderActionsProps {
  order: RestockOrder;
  /** `posRestock:update`: aprobar, cancelar y confirmar la llegada. */
  canUpdate: boolean;
  /** `posRestock:update` + `posInventory:update`: registrar la llegada y corregir el envío (mueven inventario). */
  canDispatch: boolean;
  onChanged: () => void;
  /** En la hoja del pedido no se ofrece "Ver pedido" ni se repite la descarga. */
  inSheet?: boolean;
  size?: "small" | "medium";
}

/**
 * Las acciones de un pedido de surtido: UNA acción principal según en qué va y
 * todo lo demás en el menú "⋯". Es el mismo juego de botones en la tabla de
 * pedidos, en la tarjeta y en la hoja del pedido.
 *
 * Con fábrica apagada (lo normal hoy) el ciclo es pedido → llegada:
 * - abierto → **Registrar llegada** (la hoja de entrada precargada; el pedido
 *   queda recibido con lo que se capture y sube al inventario);
 * - enviado (los que se marcaron con el botón anterior) → **Confirmar llegada**,
 *   que solo lo pasa a recibido: su inventario ya subió al enviarse;
 * - recibido → sin acción principal; "Corregir envío" en el menú.
 * No hay "Aprobar" ni "Enviado a sucursal": nadie actúa sobre un pedido
 * aprobado y los dos botones de entrada dejaban el pedido en estados distintos.
 * Con fábrica prendida se conserva el flujo de fábrica (aprobar y enviar).
 */
export function RestockOrderActions({
  order,
  canUpdate,
  canDispatch,
  onChanged,
  inSheet = false,
  size = "small",
}: RestockOrderActionsProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState<"cancel" | "receive" | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const { download, downloading } = useFactoryFormDownload();

  const factoryOn = config.factoryModuleEnabled;
  const isFranchise = order.origin === RESTOCK_ORIGIN.FRANCHISE || order.branch?.type === "franchise";
  const open = isOpenRestockOrder(order);
  const sent = order.status === RESTOCK_ORDER_STATUS.SENT;
  const received = order.status === RESTOCK_ORDER_STATUS.RECEIVED;
  const dispatch = canDispatch && !isFranchise;
  const canCancel = canUpdate && open;
  const canCorrect = dispatch && (sent || received);

  async function run(action: "approve" | "cancel" | "receive") {
    setBusy(true);
    try {
      if (action === "approve") {
        await httpClient.put(`/pos/restock/orders/${order.id}`, { status: RESTOCK_ORDER_STATUS.APPROVED });
        toast.success(approvedRestockMessage());
      } else if (action === "cancel") {
        await httpClient.post(`/pos/restock/orders/${order.id}/cancel`, {});
        toast.success("Pedido cancelado");
      } else {
        await httpClient.post(`/pos/restock/orders/${order.id}/receive`, {});
        toast.success("Llegada confirmada: el pedido quedó recibido");
      }
      setConfirm(null);
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo actualizar el pedido"));
    } finally {
      setBusy(false);
    }
  }

  // La acción principal: lo siguiente que le toca a este pedido.
  let primary: React.ReactNode = null;
  if (factoryOn) {
    if (canUpdate && order.status === RESTOCK_ORDER_STATUS.PENDING) {
      primary = (
        <Button size={size} variant="contained" startIcon={<Check size={14} />} disabled={busy} onClick={() => void run("approve")}>
          Aprobar
        </Button>
      );
    } else if (sent && canUpdate) {
      primary = (
        <Button size={size} variant="contained" color="success" startIcon={<PackageCheck size={14} />} onClick={() => setConfirm("receive")}>
          Confirmar llegada
        </Button>
      );
    }
  } else if (open && dispatch) {
    primary = (
      <Button
        size={size}
        variant="contained"
        color="success"
        startIcon={<PackagePlus size={14} />}
        component={Link}
        href={restockArrivalHref(order)}
        title="Captura lo que llegó en la hoja precargada con este pedido: queda recibido y sube al inventario"
      >
        Registrar llegada
      </Button>
    );
  } else if (sent && canUpdate) {
    primary = (
      <Button
        size={size}
        variant="contained"
        color="success"
        startIcon={<PackageCheck size={14} />}
        onClick={() => setConfirm("receive")}
        title="Ya se marcó como enviado y su inventario ya subió: solo falta pasarlo a recibido"
      >
        Confirmar llegada
      </Button>
    );
  }

  const closeMenu = () => setMenuAnchor(null);
  const menuItems: React.ReactNode[] = [];
  if (!inSheet) {
    menuItems.push(
      <MenuItem key="view" component={Link} href={restockOrderSheetHref(order.id)} onClick={closeMenu}>
        <ListItemIcon><Eye size={16} /></ListItemIcon>
        <ListItemText>Ver pedido</ListItemText>
      </MenuItem>,
      <MenuItem
        key="download"
        disabled={downloading}
        onClick={() => {
          closeMenu();
          void download(`/pos/restock/orders/${order.id}/form`);
        }}
      >
        <ListItemIcon><FileDown size={16} /></ListItemIcon>
        <ListItemText>{downloading ? "Generando..." : "Descargar formato"}</ListItemText>
      </MenuItem>
    );
  }
  if (factoryOn && open && dispatch) {
    menuItems.push(
      <MenuItem key="arrival" component={Link} href={restockArrivalHref(order)} onClick={closeMenu}>
        <ListItemIcon><PackagePlus size={16} /></ListItemIcon>
        <ListItemText>Registrar llegada</ListItemText>
      </MenuItem>,
      <MenuItem
        key="send"
        onClick={() => {
          closeMenu();
          setSending(true);
        }}
      >
        <ListItemIcon><Send size={16} /></ListItemIcon>
        <ListItemText>Enviado a sucursal</ListItemText>
      </MenuItem>,
      <MenuItem key="edit" component={Link} href={restockOrderSheetHref(order.id, true)} onClick={closeMenu}>
        <ListItemIcon><Pencil size={16} /></ListItemIcon>
        <ListItemText>Editar envío</ListItemText>
      </MenuItem>
    );
  }
  if (canCorrect) {
    menuItems.push(
      <MenuItem key="correct" component={Link} href={restockOrderSheetHref(order.id, true)} onClick={closeMenu}>
        <ListItemIcon><Pencil size={16} /></ListItemIcon>
        <ListItemText
          primary="Corregir envío"
          secondary="La diferencia entra o sale del inventario"
        />
      </MenuItem>
    );
  }
  if (canCancel) {
    menuItems.push(
      <MenuItem
        key="cancel"
        onClick={() => {
          closeMenu();
          setConfirm("cancel");
        }}
        sx={{ color: "error.main" }}
      >
        <ListItemIcon sx={{ color: "inherit" }}><X size={16} /></ListItemIcon>
        <ListItemText>Cancelar pedido</ListItemText>
      </MenuItem>
    );
  }

  const stop = (event: MouseEvent) => event.stopPropagation();

  return (
    <span
      className="restock-actions"
      onClick={stop}
      style={{ display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}
    >
      {primary}
      {menuItems.length ? (
        <>
          <IconButton
            size="small"
            aria-label="Más acciones del pedido"
            aria-haspopup="menu"
            onClick={(event) => setMenuAnchor(event.currentTarget)}
          >
            <MoreHorizontal size={18} />
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={closeMenu}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            {menuItems}
          </Menu>
        </>
      ) : null}

      <Dialog open={confirm !== null} onClose={busy ? undefined : () => setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{confirm === "cancel" ? "Cancelar pedido" : "Confirmar llegada"}</DialogTitle>
        <DialogContent dividers>
          <p style={{ margin: 0 }}>
            {confirm === "cancel"
              ? `El pedido del ${formatDateTime(order.createdAt)} se cancela y ya no se surte. No mueve inventario.`
              : `El pedido del ${formatDateTime(order.createdAt)} pasa a recibido. Su inventario ya subió cuando se marcó como enviado, así que no se mueve de nuevo.`}
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={busy}>
            Volver
          </Button>
          <Button
            variant="contained"
            color={confirm === "cancel" ? "error" : "success"}
            disabled={busy}
            onClick={() => confirm && void run(confirm)}
          >
            {confirm === "cancel" ? "Cancelar pedido" : "Pasar a recibido"}
          </Button>
        </DialogActions>
      </Dialog>

      {sending ? (
        <RestockSendDialog
          order={order}
          editHref={restockOrderSheetHref(order.id, true)}
          onClose={() => setSending(false)}
          onSent={() => {
            setSending(false);
            onChanged();
          }}
        />
      ) : null}
    </span>
  );
}
