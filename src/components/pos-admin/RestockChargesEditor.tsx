"use client";

import type { ReactNode } from "react";
import { InputAdornment, TextField } from "@mui/material";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import type { RestockOrderCharges } from "@/types";
import type { ChargeQuantityInputs, SheetCharges } from "./factory-form-values";

interface RestockChargesEditorProps {
  charges: SheetCharges;
  /** Publicidad y envío en pesos, como se escriben en el campo. */
  publicity: string;
  shipping: string;
  onPublicityChange: (value: string) => void;
  onShippingChange: (value: string) => void;
  /** Bidones vacíos y cajas azules como se escriben (cobrados y, al recibir, devueltos). */
  quantities: ChargeQuantityInputs;
  onQuantitiesChange: (next: ChargeQuantityInputs) => void;
  /** Al recibir: renglones de los vacíos que la sucursal regresó a fábrica. */
  showReturns?: boolean;
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
  className,
}: {
  concept: string;
  help?: string;
  detail?: ReactNode;
  amount: ReactNode;
  className?: string;
}) {
  return (
    <div className={`restock-charge-row${className ? ` ${className}` : ""}`}>
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
 * Cantidad de bidones o cajas. Sin captura muestra la calculada; al escribir
 * se queda la escrita, y "usar calculado" la regresa al cálculo.
 */
function QuantityInput({
  label,
  value,
  auto,
  onChange,
  disabled,
}: {
  label: string;
  /** `null` = la calculada. */
  value: string | null;
  /** Lo que calcula el sistema con los renglones; sin él es un conteo libre (devueltos). */
  auto?: number;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const manual = auto != null && value != null && Number(value || 0) !== auto;
  return (
    <div className="restock-charge-qty">
      <TextField
        type="number"
        size="small"
        label={label}
        value={value ?? (auto != null ? String(auto) : "")}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => event.currentTarget.querySelector("input")?.select()}
        disabled={disabled}
        placeholder="0"
        inputProps={{ min: 0, step: "any", style: { textAlign: "right", fontWeight: 700 } }}
        InputLabelProps={{ shrink: true }}
        sx={{ width: 112 }}
      />
      {manual ? (
        <button type="button" className="restock-charge-auto" onClick={() => onChange(null)} disabled={disabled}>
          Calculado: {formatQuantity(auto)} · usar
        </button>
      ) : null}
    </div>
  );
}

/** "−$92.00" para lo que se descuenta. */
function minus(amount: number): string {
  return amount > 0 ? `−${formatMoney(amount)}` : formatMoney(0);
}

/** Un importe que puede quedar negativo (se devolvieron más vacíos de los que se cobran): "−$203.00". */
function signed(amount: number): string {
  return amount < 0 ? minus(-amount) : formatMoney(amount);
}

/** Producto + Cargos = Total, al pie de la tabla. */
function GrandTotal({ productAmount, chargesTotal }: { productAmount: number; chargesTotal: number }) {
  return (
    <div className="restock-charges-grand" aria-label="Total del pedido">
      <div>
        <small>Producto</small>
        <b>{formatMoney(productAmount)}</b>
      </div>
      <span aria-hidden>+</span>
      <div>
        <small>Cargos</small>
        <b>{signed(chargesTotal)}</b>
      </div>
      <span aria-hidden>=</span>
      <div className="is-total">
        <small>Total con cargos</small>
        <b>{signed(Math.round((productAmount + chargesTotal) * 100) / 100)}</b>
      </div>
    </div>
  );
}

function ChargesHead() {
  return (
    <div className="restock-charge-head">
      <span>Concepto</span>
      <span>Detalle</span>
      <span>Importe</span>
    </div>
  );
}

/**
 * Cargos de fábrica del pedido como una tabla de tres columnas (concepto,
 * detalle, importe). Bidones vacíos y cajas azules se calculan solos con los
 * renglones, pero la cantidad se puede subir o bajar a mano; al recibir
 * (`showReturns`) se capturan además los vacíos que la sucursal regresó (van al
 * cambio) y se descuentan al mismo precio. **Publicidad** y **envío** (flete)
 * se escriben en pesos, y 0 = no se cobra. Con `productAmount` cierra con el
 * resumen Producto + Cargos = Total. Lo usan la revisión (al enviar) y la recepción.
 */
export function RestockChargesEditor({
  charges,
  publicity,
  shipping,
  onPublicityChange,
  onShippingChange,
  quantities,
  onQuantitiesChange,
  showReturns = false,
  publicityHint,
  productAmount,
  disabled = false,
}: RestockChargesEditorProps) {
  const set = (key: keyof ChargeQuantityInputs) => (value: string | null) =>
    onQuantitiesChange({ ...quantities, [key]: value ?? (key.startsWith("returned") ? "" : null) });

  return (
    <div className="restock-charges-box">
      <ChargesHead />
      <ChargeRow
        concept="Bidones vacíos"
        help="El envase en que viaja cada bidón de 20 L. Se calcula solo; cámbialo si se cobran más o menos."
        detail={
          <div className="restock-charge-qtys">
            <QuantityInput
              label="Transparentes"
              value={quantities.transparent}
              auto={charges.auto.transparent}
              onChange={set("transparent")}
              disabled={disabled}
            />
            <QuantityInput
              label="De color"
              value={quantities.color}
              auto={charges.auto.color}
              onChange={set("color")}
              disabled={disabled}
            />
          </div>
        }
        amount={formatMoney(charges.bidones)}
      />
      <ChargeRow
        concept="Cajas azules"
        help="Una por cada caja de los productos que la llevan. Cámbialo si se cobran más o menos."
        detail={
          <div className="restock-charge-qtys">
            <QuantityInput
              label="Cajas"
              value={quantities.blue}
              auto={charges.auto.blue}
              onChange={set("blue")}
              disabled={disabled}
            />
          </div>
        }
        amount={formatMoney(charges.blueAmount)}
      />
      {showReturns ? (
        <>
          <ChargeRow
            className="is-discount"
            concept="Bidones devueltos"
            help="Los vacíos que la sucursal le regresó a fábrica (al cambio). Se descuentan."
            detail={
              <div className="restock-charge-qtys">
                <QuantityInput
                  label="Transparentes"
                  value={quantities.returnedTransparent}
                  onChange={set("returnedTransparent")}
                  disabled={disabled}
                />
                <QuantityInput
                  label="De color"
                  value={quantities.returnedColor}
                  onChange={set("returnedColor")}
                  disabled={disabled}
                />
              </div>
            }
            amount={minus(charges.returned.bidonesAmount)}
          />
          <ChargeRow
            className="is-discount"
            concept="Cajas azules devueltas"
            help="Las cajas que la sucursal regresó. Se descuentan."
            detail={
              <div className="restock-charge-qtys">
                <QuantityInput
                  label="Cajas"
                  value={quantities.returnedBlue}
                  onChange={set("returnedBlue")}
                  disabled={disabled}
                />
              </div>
            }
            amount={minus(charges.returned.blueAmount)}
          />
        </>
      ) : null}
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
        <div className="restock-charge-amount">{signed(charges.total)}</div>
      </div>

      {productAmount != null ? <GrandTotal productAmount={productAmount} chargesTotal={charges.total} /> : null}
    </div>
  );
}

/**
 * Los cargos que se cobraron en un pedido, de solo lectura: bidones vacíos,
 * cajas azules, lo devuelto (si hubo), publicidad y envío, con Producto +
 * Cargos = Total. Es lo que se ve al abrir el pedido.
 */
export function RestockChargesSummary({ charges }: { charges: RestockOrderCharges }) {
  const { bidones, blueBoxes, returned, manual } = charges;
  const byHand = (flag: boolean) => (flag ? " · a mano" : "");
  const returnedBidones = Math.round((returned.transparent.amount + returned.color.amount) * 100) / 100;
  return (
    <div className="restock-charges-box">
      <ChargesHead />
      <ChargeRow
        concept="Bidones vacíos"
        help="El envase en que viaja cada bidón de 20 L."
        detail={`${formatQuantity(bidones.transparent.qty)} transparentes${byHand(manual.bidonTransparent)} · ${formatQuantity(bidones.color.qty)} de color${byHand(manual.bidonColor)}`}
        amount={formatMoney(bidones.transparent.amount + bidones.color.amount)}
      />
      <ChargeRow
        concept="Cajas azules"
        help="Una por cada caja de los productos que la llevan."
        detail={`${formatQuantity(blueBoxes.qty)} ${blueBoxes.qty === 1 ? "caja" : "cajas"}${byHand(manual.blueBox)}`}
        amount={formatMoney(blueBoxes.amount)}
      />
      {returned.transparent.qty + returned.color.qty > 0 ? (
        <ChargeRow
          className="is-discount"
          concept="Bidones devueltos"
          help="Los vacíos que la sucursal regresó a fábrica (al cambio)."
          detail={`${formatQuantity(returned.transparent.qty)} transparentes · ${formatQuantity(returned.color.qty)} de color`}
          amount={minus(returnedBidones)}
        />
      ) : null}
      {returned.blueBoxes.qty > 0 ? (
        <ChargeRow
          className="is-discount"
          concept="Cajas azules devueltas"
          help="Las cajas que la sucursal regresó."
          detail={`${formatQuantity(returned.blueBoxes.qty)} ${returned.blueBoxes.qty === 1 ? "caja" : "cajas"}`}
          amount={minus(returned.blueBoxes.amount)}
        />
      ) : null}
      <ChargeRow concept="Publicidad" amount={formatMoney(charges.publicity.amount)} />
      <ChargeRow concept="Envío (flete)" amount={formatMoney(charges.shipping.amount)} />
      <div className="restock-charge-row is-total">
        <div className="restock-charge-concept">
          <b>Total de cargos</b>
        </div>
        <div />
        <div className="restock-charge-amount">{signed(charges.total)}</div>
      </div>
      <GrandTotal productAmount={charges.productAmount} chargesTotal={charges.total} />
    </div>
  );
}
