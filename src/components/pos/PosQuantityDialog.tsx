"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";

interface PosQuantityDialogProps {
  open: boolean;
  title: string;
  label: string;
  /** Los litros admiten decimales; las piezas no. */
  allowDecimals: boolean;
  initialValue?: number;
  helperText?: string;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
}

/** Captura de cantidad: INS Varios, F5 cambiar cantidad y litros sueltos. */
export function PosQuantityDialog({
  open,
  title,
  label,
  allowDecimals,
  initialValue = 1,
  helperText,
  onClose,
  onConfirm,
}: PosQuantityDialogProps) {
  const [value, setValue] = useState(String(initialValue));

  useEffect(() => {
    if (open) setValue(String(initialValue));
  }, [open, initialValue]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    if (!allowDecimals && !Number.isInteger(parsed)) return;
    onConfirm(allowDecimals ? Math.round(parsed * 100) / 100 : parsed);
    onClose();
  }

  const parsed = Number(value.replace(",", "."));
  const invalid =
    !Number.isFinite(parsed) || parsed <= 0 || (!allowDecimals && !Number.isInteger(parsed));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={submit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent dividers>
          <TextField
            label={label}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
            fullWidth
            error={Boolean(value) && invalid}
            helperText={
              Boolean(value) && invalid
                ? allowDecimals
                  ? "Escribe una cantidad mayor a cero"
                  : "Las piezas se venden en cantidades enteras"
                : helperText
            }
            inputProps={{ inputMode: allowDecimals ? "decimal" : "numeric", style: { fontSize: 24, textAlign: "right" } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar (ESC)</Button>
          <Button type="submit" variant="contained" disabled={invalid}>
            Agregar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
