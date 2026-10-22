"use client";

import type { ReactNode } from "react";
import { InputAdornment, TextField } from "@mui/material";
import { Undo2 } from "lucide-react";
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
  /** Al recibir: la sección de devoluciones (vacíos que la sucursal regresó a fábrica). */
  showReturns?: boolean;
  /** Aviso bajo la publicidad (si ya se cobró este mes, por ejemplo). */
  publicityHint?: string;
  /** Importe del producto: con él se pinta Producto + Cargos − Devoluciones = Total. */
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
 * Cantidad de bidones o cajas. Sin captura muestra la calculada; al escribir
 * se queda la escrita, y "usar" la regresa al cálculo.
 */
function QuantityInput({
  label,
  ariaLabel,
  value,
  auto,
  onChange,
  disabled,
}: {
  label: string;
  /** Nombre completo para lectores de pantalla cuando la etiqueta visible es corta. */
  ariaLabel?: string;
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
        inputProps={{ min: 0, step: "any", "aria-label": ariaLabel ?? label, style: { textAlign: "right", fontWeight: 700 } }}
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

/** Un importe que puede quedar negativo: "−$203.00". */
function signed(amount: number): string {
  return amount < 0 ? minus(-amount) : formatMoney(amount);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function ChargesHead({ detail = "Detalle", amount = "Importe" }: { detail?: string; amount?: string }) {
  return (
    <div className="restock-charge-head">
      <span>Concepto</span>
      <span>{detail}</span>
      <span>{amount}</span>
    </div>
  );
}

/** Total de una tabla: "Total de cargos", "Total devuelto". */
function TotalRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="restock-charge-row is-total">
      <div className="restock-charge-concept">
        <b>{label}</b>
      </div>
      <div />
      <div className="restock-charge-amount">{amount}</div>
    </div>
  );
}

/** Título de sección dentro de los cargos ("Devoluciones a fábrica"). */
function SectionTitle({ children, hint, tone }: { children: ReactNode; hint?: string; tone?: "returns" }) {
  return (
    <div className={`restock-charges-title${tone ? ` is-${tone}` : ""}`}>
      <h3>
        {tone === "returns" ? <Undo2 size={16} aria-hidden /> : null}
        {children}
      </h3>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

/** Un vacío devuelto: concepto, cantidad (campo o número) y su descuento en verde. */
function ReturnRow({ concept, help, detail, amount }: { concept: string; help?: string; detail: ReactNode; amount: number }) {
  return (
    <div className="restock-charge-row">
      <div className="restock-charge-concept">
        <b>{concept}</b>
        {help ? <small>{help}</small> : null}
      </div>
      <div className="restock-charge-detail">{detail}</div>
      <div className="restock-charge-amount">{minus(amount)}</div>
    </div>
  );
}

/**
 * Producto + Cargos − Devoluciones = Total. Las devoluciones solo salen si hay.
 * `compact` es la versión de una línea para la barra flotante de recibir.
 */
export function RestockTotalEquation({
  productAmount,
  chargesTotal,
  returnsTotal = 0,
  compact = false,
}: {
  productAmount: number;
  chargesTotal: number;
  returnsTotal?: number;
  compact?: boolean;
}) {
  const total = round2(productAmount + chargesTotal - returnsTotal);
  return (
    <div className={`restock-charges-grand${compact ? " is-compact" : ""}`} aria-label="Total del pedido">
      <div>
        <small>Producto</small>
        <b>{formatMoney(productAmount)}</b>
      </div>
      <span aria-hidden>+</span>
      <div>
        <small>Cargos</small>
        <b>{formatMoney(chargesTotal)}</b>
      </div>
      {returnsTotal > 0 ? (
        <>
          <span aria-hidden>−</span>
          <div className="is-returns">
            <small>Devoluciones</small>
            <b>{formatMoney(returnsTotal)}</b>
          </div>
        </>
      ) : null}
      <span aria-hidden>=</span>
      <div className="is-total">
        <small>Total</small>
        <b>{signed(total)}</b>
      </div>
    </div>
  );
}

/**
 * Cargos de fábrica del pedido como una tabla de tres columnas (concepto,
 * detalle, importe). Bidones vacíos y cajas azules se calculan solos con los
 * renglones, pero la cantidad se puede subir o bajar a mano. **Publicidad** y
 * **envío** (flete) se escriben en pesos, y 0 = no se cobra.
 *
 * Al recibir (`showReturns`) va aparte la sección **Devoluciones a fábrica**:
 * los vacíos que la sucursal regresó (van al cambio), un renglón por tipo,
 * que se descuentan al mismo precio. Con `productAmount` cierra con
 * Producto + Cargos − Devoluciones = Total. Lo usan la revisión (al enviar) y la recepción.
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
  const { returned } = charges;

  return (
    <div className="restock-charges-stack">
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
        <TotalRow label="Total de cargos" amount={formatMoney(charges.total)} />
      </div>

      {showReturns ? (
        <>
          <SectionTitle tone="returns" hint="Los vacíos que la sucursal le regresó a fábrica (van al cambio). Se descuentan al mismo precio.">
            Devoluciones a fábrica
          </SectionTitle>
          <div className="restock-charges-box is-returns">
            <ChargesHead detail="Devueltos" amount="Descuento" />
            <ReturnRow
              concept="Bidones transparentes"
              detail={
                <QuantityInput
                  label="Bidones"
                  ariaLabel="Transparentes devueltos"
                  value={quantities.returnedTransparent}
                  onChange={set("returnedTransparent")}
                  disabled={disabled}
                />
              }
              amount={returned.transparentAmount}
            />
            <ReturnRow
              concept="Bidones de color"
              detail={
                <QuantityInput
                  label="Bidones"
                  ariaLabel="De color devueltos"
                  value={quantities.returnedColor}
                  onChange={set("returnedColor")}
                  disabled={disabled}
                />
              }
              amount={returned.colorAmount}
            />
            <ReturnRow
              concept="Cajas azules"
              detail={
                <QuantityInput
                  label="Cajas"
                  ariaLabel="Cajas azules devueltas"
                  value={quantities.returnedBlue}
                  onChange={set("returnedBlue")}
                  disabled={disabled}
                />
              }
              amount={returned.blueAmount}
            />
            <TotalRow label="Total devuelto" amount={minus(returned.amount)} />
          </div>
        </>
      ) : null}

      {productAmount != null ? (
        <RestockTotalEquation
          productAmount={productAmount}
          chargesTotal={charges.total}
          returnsTotal={returned.amount}
        />
      ) : null}
    </div>
  );
}

/**
 * Los cargos que se cobraron en un pedido, de solo lectura: bidones vacíos,
 * cajas azules, publicidad y envío; las devoluciones a fábrica en su propia
 * sección (si hubo), y Producto + Cargos − Devoluciones = Total. Es lo que se
 * ve al abrir el pedido.
 */
export function RestockChargesSummary({ charges }: { charges: RestockOrderCharges }) {
  const { bidones, blueBoxes, returned, manual } = charges;
  const byHand = (flag: boolean) => (flag ? " · a mano" : "");
  const count = (qty: number, one: string, many: string) => `${formatQuantity(qty)} ${qty === 1 ? one : many}`;
  return (
    <div className="restock-charges-stack">
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
          detail={`${count(blueBoxes.qty, "caja", "cajas")}${byHand(manual.blueBox)}`}
          amount={formatMoney(blueBoxes.amount)}
        />
        <ChargeRow concept="Publicidad" amount={formatMoney(charges.publicity.amount)} />
        <ChargeRow concept="Envío (flete)" amount={formatMoney(charges.shipping.amount)} />
        <TotalRow label="Total de cargos" amount={formatMoney(charges.total)} />
      </div>

      {returned.amount > 0 ? (
        <>
          <SectionTitle tone="returns" hint="Los vacíos que la sucursal regresó a fábrica al recibir (al cambio).">
            Devoluciones a fábrica
          </SectionTitle>
          <div className="restock-charges-box is-returns">
            <ChargesHead detail="Devueltos" amount="Descuento" />
            {returned.transparent.qty > 0 ? (
              <ReturnRow
                concept="Bidones transparentes"
                detail={count(returned.transparent.qty, "bidón", "bidones")}
                amount={returned.transparent.amount}
              />
            ) : null}
            {returned.color.qty > 0 ? (
              <ReturnRow
                concept="Bidones de color"
                detail={count(returned.color.qty, "bidón", "bidones")}
                amount={returned.color.amount}
              />
            ) : null}
            {returned.blueBoxes.qty > 0 ? (
              <ReturnRow
                concept="Cajas azules"
                detail={count(returned.blueBoxes.qty, "caja", "cajas")}
                amount={returned.blueBoxes.amount}
              />
            ) : null}
            <TotalRow label="Total devuelto" amount={minus(returned.amount)} />
          </div>
        </>
      ) : null}

      <RestockTotalEquation
        productAmount={charges.productAmount}
        chargesTotal={charges.total}
        returnsTotal={returned.amount}
      />
    </div>
  );
}
