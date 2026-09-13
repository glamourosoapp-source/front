"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { Printer, Ban } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney } from "@/lib/format-money";
import { POS_SALE_STATUS } from "@glamouroso/shared/constants";
import type { PosSale } from "@/types";
import { toast } from "sonner";

interface PosDaySalesDialogProps {
  open: boolean;
  canVoid: boolean;
  onClose: () => void;
  onReprint: (sale: PosSale) => void;
  onVoided: () => void;
}

interface SalesResponse {
  items: PosSale[];
  meta: { pageTotal: number; pageTickets: number };
}

/** Ventas del día (F4): reimprimir un ticket y anular el que se cobró mal. */
export function PosDaySalesDialog({
  open,
  canVoid,
  onClose,
  onReprint,
  onVoided,
}: PosDaySalesDialogProps) {
  const [sales, setSales] = useState<PosSale[]>([]);
  const [meta, setMeta] = useState({ pageTotal: 0, pageTickets: 0 });
  const [loading, setLoading] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const today = new Date().toLocaleDateString("en-CA");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await httpClient.get<SalesResponse>("/pos/sales", { date: today, limit: 200 });
      setSales(result.items);
      setMeta(result.meta);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar las ventas del día"));
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function voidSale(sale: PosSale) {
    if (!reason.trim()) {
      toast.error("Escribe el motivo de la anulación");
      return;
    }
    try {
      await httpClient.post(`/pos/sales/${sale.id}/void`, { reason: reason.trim() });
      toast.success(`Ticket ${sale.ticketNumber} anulado`);
      setVoidingId(null);
      setReason("");
      await load();
      onVoided();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo anular el ticket"));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Ventas del día</DialogTitle>
      <DialogContent dividers>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div>
            <span className="pos-total-label">Tickets cobrados</span>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{meta.pageTickets}</div>
          </div>
          <div>
            <span className="pos-total-label">Total del día</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--glam-navy)" }}>
              {formatMoney(meta.pageTotal)}
            </div>
          </div>
        </div>

        <table className="pos-grid">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Hora</th>
              <th>Cliente</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td className="code">{sale.ticketNumber}</td>
                <td>
                  {new Date(sale.soldAt).toLocaleTimeString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td>{sale.customer?.name || "Mostrador"}</td>
                <td className="num">{formatMoney(sale.total)}</td>
                <td>
                  {sale.status === POS_SALE_STATUS.VOIDED ? (
                    <Chip label="Anulado" size="small" color="error" />
                  ) : (
                    <Chip label="Cobrado" size="small" color="primary" />
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Button size="small" startIcon={<Printer size={14} />} onClick={() => onReprint(sale)}>
                    Reimprimir
                  </Button>
                  {canVoid && sale.status !== POS_SALE_STATUS.VOIDED ? (
                    <Button
                      size="small"
                      color="error"
                      startIcon={<Ban size={14} />}
                      onClick={() => setVoidingId(sale.id)}
                    >
                      Anular
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!sales.length && !loading ? (
              <tr>
                <td colSpan={6} className="pos-empty">
                  Todavía no hay ventas hoy.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {voidingId ? (
          <div className="panel p-5" style={{ marginTop: 14 }}>
            <p style={{ marginTop: 0 }}>
              Anular el ticket{" "}
              <strong>{sales.find((sale) => sale.id === voidingId)?.ticketNumber}</strong>. El
              inventario de la sucursal se devuelve tal cual se descontó.
            </p>
            <TextField
              label="Motivo"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              fullWidth
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button
                variant="contained"
                color="error"
                onClick={() => voidSale(sales.find((sale) => sale.id === voidingId)!)}
              >
                Anular ticket
              </Button>
              <Button onClick={() => setVoidingId(null)}>Cancelar</Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar (ESC)</Button>
      </DialogActions>
    </Dialog>
  );
}
