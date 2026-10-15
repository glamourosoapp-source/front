"use client";

import type { ReactNode } from "react";
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
  /** Importe del producto: con él se pinta el resumen Producto + Cargos = Total. */
  productAmount?: number;
  disabled?: boolean;
}

/** Un renglón de la tabla: concepto con su ayuda, detalle e importe (o el campo del importe). */
function ChargeRow({
  concept,
  help,
  detail,
  amount,
}: {
  concept: string;
  help?: string;
  detail?: ReactNode;
  amount: ReactNode;
}) {
  return (
    <div className="restock-charge-row">
      <div className="restock-charge-concept">
        <b>{concept}</b>
        {help ? <small>{help}</small> : null}
      </div>
      <div className="restock-charge-detail">{detail}</div>
      <div className="restock-charge-amount">{amount}</div>
    </div>
  );
}

/** Campo de importe en pesos, alineado a la derecha como el resto de la columna. */
function MoneyInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <TextField
      type="number"
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={(event) => event.currentTarget.querySelector("input")?.select()}
      disabled={disabled}
      placeholder="0"
      inputProps={{ min: 0, step: "any", "aria-label": label, style: { textAlign: "right", fontWeight: 700 } }}
      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
      sx={{ width: 150 }}
    />
  );
}

/**
 * Cargos de fábrica del pedido como una tabla de tres columnas (concepto,
 * detalle, importe): bidones vacíos y cajas azules se calculan solos;
 * **publicidad** y **envío** (flete) se escriben en pesos en la misma columna
 * del importe, y 0 = no se cobra. Con `productAmount` cierra con el resumen
 * Producto + Cargos = Total. Lo usan la revisión (al enviar) y la recepción.
 */
export function RestockChargesEditor({
  charges,
  publicity,
  shipping,
  onPublicityChange,
  onShippingChange,
  publicityHint,
  productAmount,
  disabled = false,
}: RestockChargesEditorProps) {
  return (
    <div className="restock-charges-box">
      <div className="restock-charge-head">
        <span>Concepto</span>
        <span>Detalle</span>
        <span>Importe</span>
      </div>
      <ChargeRow
        concept="Bidones vacíos"
        help="El envase en que viaja cada bidón de 20 L."
        detail={`${formatQuantity(charges.transparent)} transparentes · ${formatQuantity(charges.color)} de color`}
        amount={formatMoney(charges.bidones)}
      />
      <ChargeRow
        concept="Cajas azules"
        help="Una por cada caja de los productos que la llevan."
        detail={`${formatQuantity(charges.blue)} ${charges.blue === 1 ? "caja" : "cajas"}`}
        amount={formatMoney(charges.blueAmount)}
      />
      <ChargeRow
        concept="Publicidad"
        help={publicityHint ?? "Pon 0 si no se cobra."}
        detail={<span className="restock-charge-tag">Se puede cambiar</span>}
        amount={<MoneyInput label="Publicidad en pesos" value={publicity} onChange={onPublicityChange} disabled={disabled} />}
      />
      <ChargeRow
        concept="Envío (flete)"
        help="Lo que cobra fábrica por el envío. Pon 0 si no se cobra."
        detail={<span className="restock-charge-tag">Se puede cambiar</span>}
        amount={<MoneyInput label="Envío en pesos" value={shipping} onChange={onShippingChange} disabled={disabled} />}
      />
      <div className="restock-charge-row is-total">
        <div className="restock-charge-concept">
          <b>Total de cargos</b>
        </div>
        <div />
        <div className="restock-charge-amount">{formatMoney(charges.total)}</div>
      </div>

      {productAmount != null ? (
        <div className="restock-charges-grand" aria-label="Total del pedido">
          <div>
            <small>Producto</small>
            <b>{formatMoney(productAmount)}</b>
          </div>
          <span aria-hidden>+</span>
          <div>
            <small>Cargos</small>
            <b>{formatMoney(charges.total)}</b>
          </div>
          <span aria-hidden>=</span>
          <div className="is-total">
            <small>Total con cargos</small>
            <b>{formatMoney(Math.round((productAmount + charges.total) * 100) / 100)}</b>
          </div>
        </div>
      ) : null}
    </div>
  );
}
