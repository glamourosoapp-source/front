"use client";

import { InputAdornment, TextField } from "@mui/material";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import type { SheetCharges } from "./factory-form-values";

interface RestockChargesEditorProps {
  charges: SheetCharges;
  /** Publicidad y envío en pesos, como se escriben en el campo. */
  publicity: string;
  shipping: string;
  onPublicityChange: (value: string) => void;
  onShippingChange: (value: string) => void;
  /** Aviso bajo la publicidad (si ya se cobró este mes, por ejemplo). */
  publicityHint?: string;
  disabled?: boolean;
}

/** El importe de publicidad y envío va a la altura de su campo, no centrado con la ayuda de abajo. */
const MONEY_AMOUNT = { alignSelf: "start", paddingTop: 9 } as const;

function MoneyField({
  label,
  value,
  onChange,
  helperText,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  disabled?: boolean;
}) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={(event) => event.currentTarget.querySelector("input")?.select()}
      disabled={disabled}
      inputProps={{ min: 0, step: "any" }}
      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
      InputLabelProps={{ shrink: true }}
      placeholder="0"
      helperText={helperText}
      sx={{ width: 300 }}
    />
  );
}

/**
 * Cargos de fábrica del pedido: bidones vacíos y cajas azules (se calculan
 * solos) y **publicidad** y **envío** (flete), que se capturan en pesos: se
 * puede cambiar el importe o dejarlo en 0 para no cobrarlo. Lo usan la
 * revisión (al enviar) y la recepción (al recibir).
 */
export function RestockChargesEditor({
  charges,
  publicity,
  shipping,
  onPublicityChange,
  onShippingChange,
  publicityHint,
  disabled = false,
}: RestockChargesEditorProps) {
  return (
    <div className="restock-charges">
      <span>
        Bidones vacíos: {formatQuantity(charges.transparent)} transparentes y {formatQuantity(charges.color)} de color
      </span>
      <strong>{formatMoney(charges.bidones)}</strong>
      <span>Cajas azules: {formatQuantity(charges.blue)}</span>
      <strong>{formatMoney(charges.blueAmount)}</strong>
      <MoneyField
        label="Publicidad"
        value={publicity}
        onChange={onPublicityChange}
        helperText={publicityHint ?? "Pon 0 si no se cobra."}
        disabled={disabled}
      />
      <strong style={MONEY_AMOUNT}>{formatMoney(charges.publicityAmount)}</strong>
      <MoneyField
        label="Envío (flete)"
        value={shipping}
        onChange={onShippingChange}
        helperText="Lo que cobra fábrica por el envío; 0 si no se cobra."
        disabled={disabled}
      />
      <strong style={MONEY_AMOUNT}>{formatMoney(charges.shippingAmount)}</strong>
      <span style={{ fontWeight: 700 }}>Total de cargos</span>
      <strong>{formatMoney(charges.total)}</strong>
    </div>
  );
}
