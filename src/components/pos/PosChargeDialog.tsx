"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, DialogContent, DialogTitle, TextField } from "@mui/material";
import { Printer, Receipt, StickyNote, X } from "lucide-react";
import { formatMoney } from "@/lib/format-money";
import { usePosShortcuts } from "@/hooks/usePosShortcuts";

interface PosChargeDialogProps {
  open: boolean;
  total: number;
  itemsCount: number;
  customerName: string;
  /** Billetes sugeridos, como los de eleventa. */
  onClose: () => void;
  onCharge: (params: { amountTendered: number; print: boolean; notes: string }) => void;
  charging: boolean;
  printerReady: boolean;
}

const BILLS = [50, 100, 200, 500, 1000];

/**
 * Cobro (F12), con el mismo acomodo que eleventa: total gigante, "Pagó con",
 * "Su cambio" y las acciones a la derecha con su tecla.
 *
 * v1 cobra solo efectivo; tarjeta y transferencia quedan visibles pero
 * deshabilitadas para que el cajero sepa que llegarán.
 */
export function PosChargeDialog({
  open,
  total,
  itemsCount,
  customerName,
  onClose,
  onCharge,
  charging,
  printerReady,
}: PosChargeDialogProps) {
  const [tendered, setTendered] = useState(String(total.toFixed(2)));
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    if (open) {
      setTendered(total.toFixed(2));
      setNotes("");
      setShowNotes(false);
    }
  }, [open, total]);

  const amount = Number(tendered.replace(",", ".")) || 0;
  const change = useMemo(() => Math.round((amount - total) * 100) / 100, [amount, total]);
  const insufficient = change < 0;

  const charge = (print: boolean) => {
    if (insufficient || charging) return;
    onCharge({ amountTendered: amount, print, notes });
  };

  // Dentro del cobro manda este diálogo: F1 imprime, F2 no, F4 notas, ESC sale.
  usePosShortcuts(
    useMemo(
      () => ({
        F1: () => charge(true),
        F2: () => charge(false),
        F4: () => setShowNotes((value) => !value),
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

            <div className="pos-methods">
              <button type="button" className="pos-method active">
                Efectivo
              </button>
              <button type="button" className="pos-method" disabled>
                Tarjeta
                <br />
                próximamente
              </button>
              <button type="button" className="pos-method" disabled>
                Transferencia
                <br />
                próximamente
              </button>
            </div>

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
                {itemsCount}
              </div>
              <div className="page-kicker" style={{ marginTop: 8 }}>
                Cliente: <strong>{customerName}</strong>
              </div>
              {!printerReady ? (
                <div className="page-kicker" style={{ marginTop: 8, color: "#d97706" }}>
                  Sin agente de impresión: F1 abrirá el diálogo del navegador.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
