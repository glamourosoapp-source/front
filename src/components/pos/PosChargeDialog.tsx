"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, DialogContent, DialogTitle, TextField } from "@mui/material";
import { Printer, Receipt, StickyNote, X } from "lucide-react";
import { POS_PAYMENT_METHODS, type PosPaymentMethod } from "@glamouroso/shared/constants";
import { formatMoney } from "@/lib/format-money";
import { usePosShortcuts } from "@/hooks/usePosShortcuts";

export interface PosChargeParams {
  paymentMethod: PosPaymentMethod;
  /** Con tarjeta o transferencia es el total exacto. */
  amountTendered: number;
  print: boolean;
  notes: string;
}

interface PosChargeDialogProps {
  open: boolean;
  total: number;
  /** Partidas del ticket (no unidades): 3 productos aunque uno sean 18 litros. */
  linesCount: number;
  customerName: string;
  /** Billetes sugeridos, como los de eleventa. */
  onClose: () => void;
  onCharge: (params: PosChargeParams) => void;
  charging: boolean;
  printerReady: boolean;
}

const BILLS = [50, 100, 200, 500, 1000];

/** Método, tecla y qué le decimos al cajero cuando lo elige. */
const METHODS: Array<{
  value: PosPaymentMethod;
  label: string;
  key: "F5" | "F6" | "F7";
  hint: string | null;
}> = [
  { value: POS_PAYMENT_METHODS.CASH, label: "Efectivo", key: "F5", hint: null },
  {
    value: POS_PAYMENT_METHODS.CARD,
    label: "Tarjeta",
    key: "F6",
    hint: "Cobra el total exacto en la terminal y, cuando el voucher salga aprobado, confirma aquí.",
  },
  {
    value: POS_PAYMENT_METHODS.TRANSFER,
    label: "Transferencia",
    key: "F7",
    hint: "Confirma aquí cuando veas la transferencia recibida por el total exacto.",
  },
];

/**
 * Cobro (F12), con el mismo acomodo que eleventa: total gigante, "Pagó con",
 * "Su cambio" y las acciones a la derecha con su tecla.
 *
 * Tarjeta y transferencia son declarativos: la terminal y el banco no están
 * conectados, así que el cajero dice cómo pagó el cliente y el ticket lo
 * registra con el total exacto, sin "pagó con" ni cambio.
 */
export function PosChargeDialog({
  open,
  total,
  linesCount,
  customerName,
  onClose,
  onCharge,
  charging,
  printerReady,
}: PosChargeDialogProps) {
  const [method, setMethod] = useState<PosPaymentMethod>(POS_PAYMENT_METHODS.CASH);
  const [tendered, setTendered] = useState(String(total.toFixed(2)));
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod(POS_PAYMENT_METHODS.CASH);
      setTendered(total.toFixed(2));
      setNotes("");
      setShowNotes(false);
    }
  }, [open, total]);

  const isCash = method === POS_PAYMENT_METHODS.CASH;
  const amount = isCash ? Number(tendered.replace(",", ".")) || 0 : total;
  const change = useMemo(() => Math.round((amount - total) * 100) / 100, [amount, total]);
  const insufficient = isCash && change < 0;
  const selected = METHODS.find((item) => item.value === method) ?? METHODS[0]!;

  const charge = (print: boolean) => {
    if (insufficient || charging) return;
    onCharge({ paymentMethod: method, amountTendered: amount, print, notes });
  };

  // Dentro del cobro manda este diálogo: F1 imprime, F2 no, F4 notas,
  // F5/F6/F7 eligen el método, ESC sale.
  usePosShortcuts(
    useMemo(
      () => ({
        F1: () => charge(true),
        F2: () => charge(false),
        F4: () => setShowNotes((value) => !value),
        F5: () => setMethod(POS_PAYMENT_METHODS.CASH),
        F6: () => setMethod(POS_PAYMENT_METHODS.CARD),
        F7: () => setMethod(POS_PAYMENT_METHODS.TRANSFER),
        Escape: () => onClose(),
      }),
      [charge, onClose]
    ),
    open
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Cobrar</DialogTitle>
      <DialogContent dividers>
        <div className="pos-charge-dialog">
          <div>
            <div className="pos-charge-total">
              <div className="label">Total a cobrar</div>
              <div className="value">{formatMoney(total)}</div>
            </div>

            <div className="pos-methods" role="radiogroup" aria-label="Forma de pago">
              {METHODS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={method === item.value}
                  className={`pos-method ${method === item.value ? "active" : ""}`}
                  onClick={() => setMethod(item.value)}
                >
                  {item.label}
                  <br />
                  <span className="pos-method-key">{item.key}</span>
                </button>
              ))}
            </div>

            {isCash ? (
              <>
                <label className="pos-total-label" htmlFor="pos-tendered">
                  Pagó con
                </label>
                <input
                  id="pos-tendered"
                  className="pos-tender-input"
                  value={tendered}
                  onChange={(event) => setTendered(event.target.value)}
                  inputMode="decimal"
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                />
                <div className="pos-bills">
                  {BILLS.map((bill) => (
                    <button
                      key={bill}
                      type="button"
                      className="pos-bill"
                      onClick={() => setTendered(bill.toFixed(2))}
                    >
                      ${bill}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="pos-bill"
                    onClick={() => setTendered(total.toFixed(2))}
                  >
                    Exacto
                  </button>
                </div>

                <div className={`pos-change ${insufficient ? "insufficient" : ""}`}>
                  <div className="pos-total-label">{insufficient ? "Falta" : "Su cambio"}</div>
                  <div className="value">{formatMoney(Math.abs(change))}</div>
                </div>
              </>
            ) : (
              <div className="pos-method-hint" data-testid="pos-method-hint">
                <div className="pos-total-label">Se cobra con {selected.label.toLowerCase()}</div>
                <div className="value">{formatMoney(total)}</div>
                <p>{selected.hint}</p>
              </div>
            )}

            {showNotes ? (
              <TextField
                label="Notas del ticket"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                fullWidth
                multiline
                minRows={2}
                sx={{ mt: 2 }}
              />
            ) : null}
          </div>

          <div className="pos-charge-side">
            <Button
              variant="contained"
              size="large"
              startIcon={<Printer size={18} />}
              disabled={insufficient || charging}
              onClick={() => charge(true)}
            >
              F1 · Cobrar e imprimir
            </Button>
            <Button
              variant="outlined"
              startIcon={<Receipt size={18} />}
              disabled={insufficient || charging}
              onClick={() => charge(false)}
            >
              F2 · Cobrar sin imprimir
            </Button>
            <Button color="inherit" startIcon={<X size={18} />} onClick={onClose} disabled={charging}>
              ESC · Cancelar
            </Button>
            <Button
              color="inherit"
              startIcon={<StickyNote size={18} />}
              onClick={() => setShowNotes((value) => !value)}
            >
              F4 · Notas
            </Button>

            <div style={{ marginTop: "auto", textAlign: "center" }}>
              <div className="pos-total-label">Total de artículos</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: "var(--glam-navy)" }}>
                {linesCount}
              </div>
              <div className="page-kicker" style={{ marginTop: 8 }}>
                Cliente: <strong>{customerName}</strong>
              </div>
              {!printerReady ? (
                <div className="page-kicker" style={{ marginTop: 8, color: "#d97706" }}>
                  Sin conector de impresión: F1 abrirá el diálogo del navegador.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
