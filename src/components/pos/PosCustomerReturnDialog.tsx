"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { Search, Undo2 } from "lucide-react";
import axios from "axios";
import {
  POS_PAYMENT_METHODS,
  POS_RETURN_REASONS,
  POS_RETURN_REASON_LABELS,
  POS_RETURN_REASON_VALUES,
  POS_SALE_UNITS,
  posPaymentMethodLabel,
  type PosReturnReason,
} from "@glamouroso/shared/constants";
import { posTicketNumber } from "@glamouroso/shared/pos-sync";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { findSaleByTicket, type LocalSale } from "@/lib/pos-offline/store";
import { businessStamp } from "@/lib/business-time";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import {
  canRestock,
  chosenLines,
  returnBlocker,
  returnableRows,
  returnedLines,
  type ReturnSelection,
  type ReturnableRow,
} from "@/lib/pos/customer-return";
import type { PosSale } from "@/types";

/** Lo que el diálogo entrega a la caja para registrar e imprimir. */
export interface CustomerReturnRequest {
  sale: PosSale;
  /** El ticket guardado en esta PC, si lo hay. */
  local: LocalSale | null;
  /** Id del ticket en el servidor, si ya subió. */
  serverSaleId: string | null;
  rows: ReturnableRow[];
  selections: Record<string, ReturnSelection>;
  notes: string | null;
}

/** Motivos con los que el producto suele estar bien: por omisión vuelve al anaquel. */
const RESELLABLE_REASONS: PosReturnReason[] = [POS_RETURN_REASONS.WRONG_PRODUCT, POS_RETURN_REASONS.DISLIKED];

function defaultSelection(): ReturnSelection {
  return { quantity: 0, reason: POS_RETURN_REASONS.DEFECTIVE, restock: false };
}

/**
 * Devolución de cliente (F2, o "Devolver" en Ventas del día).
 *
 * Primero el ticket: el folio escaneado del papel, tecleado, o solo el
 * consecutivo si es de hoy ("7" → SUC01-hoy-0007). Se busca en la PC y, con
 * red, también en el servidor (que sabe de anulaciones y devoluciones hechas
 * desde otro lado). Luego, por renglón, cuánto regresa, por qué y si vuelve al
 * anaquel o va a merma. El dinero sale por la forma de pago del ticket.
 */
export function PosCustomerReturnDialog({
  open,
  initialTicket,
  branchCode,
  branchId,
  isAdmin,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialTicket: string | null;
  branchCode: string | null;
  branchId: string | null;
  isAdmin: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (request: CustomerReturnRequest) => void;
}) {
  const [folio, setFolio] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<PosSale | null>(null);
  const [local, setLocal] = useState<LocalSale | null>(null);
  const [serverSaleId, setServerSaleId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [selections, setSelections] = useState<Record<string, ReturnSelection>>({});
  /** Renglones donde el cajero eligió el destino a mano: el motivo ya no lo cambia. */
  const [touchedDestination, setTouchedDestination] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  /** Lo tecleado en cada cantidad, para poder escribir "1." antes de "1.5". */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const folioRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setSale(null);
    setLocal(null);
    setServerSaleId(null);
    setOffline(false);
    setSelections({});
    setTouchedDestination(new Set());
    setNotes("");
    setDrafts({});
    setError(null);
  }, []);

  const lookup = useCallback(
    async (raw: string) => {
      const typed = raw.trim().toUpperCase();
      if (!typed) return;
      // Solo el consecutivo: un ticket de hoy de esta sucursal.
      const ticketNumber =
        /^\d{1,4}$/.test(typed) && branchCode
          ? posTicketNumber(branchCode, businessStamp(), Number(typed))
          : typed;
      reset();
      setFolio(ticketNumber);
      setLoading(true);
      try {
        const saved = await findSaleByTicket(ticketNumber);
        let remote: PosSale | null = null;
        let notFound = false;
        let unreachable = false;
        try {
          remote = await httpClient.get<PosSale>("/pos/sales/lookup", { ticketNumber });
        } catch (lookupError) {
          const status = axios.isAxiosError(lookupError) ? lookupError.response?.status : undefined;
          if (status === 404) notFound = true;
          else if (status && status < 500) {
            setError(getApiErrorMessage(lookupError, "No se pudo buscar el ticket"));
            return;
          } else unreachable = true;
        }

        // Lo del servidor manda (anulaciones, devoluciones de otro lado); lo de
        // la PC cubre el ticket que todavía no sube o la caja sin red.
        const found = remote ?? saved?.sale ?? null;
        if (!found) {
          setError(
            notFound
              ? `No encontramos el ticket ${ticketNumber} en esta sucursal. Revisa el folio: solo se devuelve en la tienda donde se compró.`
              : `El ticket ${ticketNumber} no está en esta computadora y no hay conexión para buscarlo en el servidor.`,
          );
          return;
        }
        setSale(found);
        setLocal(saved);
        setServerSaleId(remote?.id ?? saved?.serverId ?? null);
        setOffline(unreachable);
      } finally {
        setLoading(false);
      }
    },
    [branchCode, reset],
  );

  useEffect(() => {
    if (!open) return;
    reset();
    setFolio(initialTicket ?? "");
    if (initialTicket) void lookup(initialTicket);
  }, [open, initialTicket, reset, lookup]);

  const rows = useMemo(
    () => (sale ? returnableRows(sale, returnedLines(sale, local?.returns ?? [])) : []),
    [sale, local],
  );
  const blocker = useMemo(
    () => (sale ? returnBlocker(sale, { isAdmin, branchId, today: businessStamp() }) : null),
    [sale, isAdmin, branchId],
  );
  const lines = useMemo(
    () => (sale ? chosenLines({ sale, rows, selections }) : []),
    [sale, rows, selections],
  );
  const total = useMemo(
    () => Math.round(lines.reduce((sum, line) => sum + line.refund, 0) * 100) / 100,
    [lines],
  );
  const nothingLeft = rows.length > 0 && rows.every((row) => row.remaining <= 0);

  function selectionOf(row: ReturnableRow): ReturnSelection {
    return selections[row.key] ?? defaultSelection();
  }

  function update(row: ReturnableRow, patch: Partial<ReturnSelection>) {
    setSelections((current) => ({ ...current, [row.key]: { ...selectionOf(row), ...patch } }));
  }

  function setQuantity(row: ReturnableRow, raw: string) {
    setDrafts((current) => ({ ...current, [row.key]: raw }));
    const parsed = Number(raw.replace(",", ".") || 0);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const step = row.saleUnit === POS_SALE_UNITS.LITER ? Math.round(parsed * 100) / 100 : Math.floor(parsed);
    update(row, { quantity: Math.min(step, row.remaining) });
  }

  function setReason(row: ReturnableRow, reason: PosReturnReason) {
    const patch: Partial<ReturnSelection> = { reason };
    // Si el cajero no eligió el destino, el motivo lo sugiere: lo que no le
    // gustó o se equivocó suele estar cerrado y vuelve al anaquel.
    if (!touchedDestination.has(row.key) && canRestock(row.saleUnit)) {
      patch.restock = RESELLABLE_REASONS.includes(reason);
    }
    update(row, patch);
  }

  function returnEverything() {
    const next: Record<string, ReturnSelection> = {};
    for (const row of rows) {
      if (row.remaining > 0) next[row.key] = { ...selectionOf(row), quantity: row.remaining };
    }
    setSelections((current) => ({ ...current, ...next }));
    setDrafts({});
  }

  function submit() {
    if (!sale || blocker || !lines.length) return;
    onSubmit({
      sale,
      local,
      serverSaleId,
      rows,
      selections,
      notes: notes.trim() || null,
    });
  }

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    void lookup(folio);
  };

  const method = sale ? posPaymentMethodLabel(sale.paymentMethod).toLowerCase() : "";

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="lg"
      // El foco del diálogo se lo queda el contenedor al terminar la animación:
      // el lector de código de barras escribiría en el vacío.
      TransitionProps={{
        onEntered: () => {
          if (!initialTicket) folioRef.current?.focus();
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Undo2 size={20} /> Devolución de cliente
      </DialogTitle>
      <DialogContent dividers>
        <form onSubmit={onSearch} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14 }}>
          <TextField
            label="Folio del ticket"
            placeholder={branchCode ? `${branchCode}-${businessStamp()}-0007, o solo 7 si es de hoy` : "Escanea o escribe el folio"}
            value={folio}
            onChange={(event) => setFolio(event.target.value)}
            autoFocus={!initialTicket}
            inputRef={folioRef}
            fullWidth
            size="small"
            helperText="Escanea el código de barras del ticket o escribe el folio."
          />
          <Button type="submit" variant="outlined" startIcon={<Search size={16} />} disabled={loading || !folio.trim()}>
            {loading ? "Buscando…" : "Buscar"}
          </Button>
        </form>

        {error ? <Alert severity="warning">{error}</Alert> : null}

        {sale ? (
          <>
            <div className="toolbar" style={{ marginBottom: 10, gap: 24, flexWrap: "wrap" }}>
              <div>
                <span className="pos-total-label">Ticket</span>
                <div style={{ fontWeight: 700 }}>{sale.ticketNumber}</div>
              </div>
              <div>
                <span className="pos-total-label">Compra</span>
                <div>
                  {new Date(sale.soldAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
              <div>
                <span className="pos-total-label">Cliente</span>
                <div>{sale.customer?.name || "Mostrador"}</div>
              </div>
              <div>
                <span className="pos-total-label">Pagó</span>
                <div>
                  {formatMoney(sale.total)} con {method}
                </div>
              </div>
            </div>

            {offline ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                Sin conexión: se usa el ticket guardado en esta computadora. La devolución sube al volver el internet.
              </Alert>
            ) : null}
            {blocker ? (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                {blocker}
              </Alert>
            ) : nothingLeft ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                De este ticket ya se devolvió todo.
              </Alert>
            ) : null}

            <table className="pos-grid pos-return-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>Vendido</th>
                  <th style={{ textAlign: "right" }}>Ya devuelto</th>
                  <th style={{ width: 110, textAlign: "right" }}>Devolver</th>
                  <th style={{ width: 210 }}>Motivo</th>
                  <th style={{ width: 170 }}>Destino</th>
                  <th style={{ width: 110, textAlign: "right" }}>Regresa</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const selection = selectionOf(row);
                  const unit = row.saleUnit === POS_SALE_UNITS.LITER ? " L" : "";
                  const line = lines.find((item) => item.row.key === row.key);
                  const disabled = Boolean(blocker) || row.remaining <= 0;
                  return (
                    <tr key={row.key} className={row.remaining <= 0 ? "is-done" : ""}>
                      <td className="name">
                        {row.name}
                        <span className="pos-breakdown">pagó {formatMoney(row.unitPrice)}{unit ? " / L" : " c/u"}</span>
                      </td>
                      <td className="num">
                        {formatQuantity(row.soldQuantity)}
                        {unit}
                      </td>
                      <td className="num">
                        {row.returnedQuantity ? `${formatQuantity(row.returnedQuantity)}${unit}` : "—"}
                      </td>
                      <td className="num">
                        <input
                          className="pos-qty-input"
                          value={drafts[row.key] ?? (selection.quantity ? String(selection.quantity) : "")}
                          placeholder="0"
                          onChange={(event) => setQuantity(row, event.target.value)}
                          // Al salir se ve lo que de verdad se va a devolver (ya con el tope).
                          onBlur={() =>
                            setDrafts((current) => {
                              const next = { ...current };
                              delete next[row.key];
                              return next;
                            })
                          }
                          inputMode={row.saleUnit === POS_SALE_UNITS.LITER ? "decimal" : "numeric"}
                          disabled={disabled}
                          aria-label={`Cantidad a devolver de ${row.name}`}
                        />
                        <span className="pos-breakdown">de {formatQuantity(row.remaining)}{unit}</span>
                      </td>
                      <td>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={selection.reason}
                          onChange={(event) => setReason(row, event.target.value as PosReturnReason)}
                          disabled={disabled}
                        >
                          {POS_RETURN_REASON_VALUES.map((reason) => (
                            <MenuItem key={reason} value={reason}>
                              {POS_RETURN_REASON_LABELS[reason]}
                            </MenuItem>
                          ))}
                        </TextField>
                      </td>
                      <td>
                        {canRestock(row.saleUnit) ? (
                          <TextField
                            select
                            size="small"
                            fullWidth
                            value={selection.restock ? "restock" : "waste"}
                            onChange={(event) => {
                              setTouchedDestination((current) => new Set(current).add(row.key));
                              update(row, { restock: event.target.value === "restock" });
                            }}
                            disabled={disabled}
                          >
                            <MenuItem value="restock">Al anaquel</MenuItem>
                            <MenuItem value="waste">Merma</MenuItem>
                          </TextField>
                        ) : (
                          <span className="pos-breakdown" title="El granel no se revisa ni se vuelve a servir">
                            Merma (litros sueltos)
                          </span>
                        )}
                      </td>
                      <td className="num amount">{line ? formatMoney(line.refund) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 12 }}>
              <Button onClick={returnEverything} disabled={Boolean(blocker) || nothingLeft}>
                Devolver todo lo que queda
              </Button>
              <TextField
                label="Nota (opcional)"
                value={notes}
                onChange={(event) => setNotes(event.target.value.slice(0, 500))}
                size="small"
                fullWidth
              />
            </div>

            <div className="pos-return-summary">
              <div>
                <span className="pos-total-label">
                  {sale.paymentMethod === POS_PAYMENT_METHODS.CASH
                    ? "Entrega al cliente en efectivo"
                    : `Regresa por ${method}`}
                </span>
                <div className="pos-total-value">{formatMoney(total)}</div>
              </div>
              {sale.paymentMethod !== POS_PAYMENT_METHODS.CASH && total > 0 ? (
                <p>
                  Haz el reembolso por {method} (terminal o banco): la caja solo lo registra, no sale efectivo
                  del cajón.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar (ESC)
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<Undo2 size={16} />}
          onClick={submit}
          disabled={!sale || Boolean(blocker) || !lines.length || saving}
        >
          {saving ? "Registrando…" : `Registrar devolución ${total > 0 ? formatMoney(total) : ""}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
