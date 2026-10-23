"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ClipboardCopy,
  Download,
  Droplets,
  Eye,
  ListChecks,
  Package,
  ReceiptText,
  RotateCcw,
  Send,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import type { FactoryForm } from "@glamouroso/shared";
import { RESTOCK_ORDER_STATUS } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { exportFactoryFormPdf } from "@/lib/export-factory-form";
import type { ListResponse, RestockOrder } from "@/types";
import { FactoryFormSheet, allRows, packDescription, sameValue, sheetPages, type SheetValues } from "./FactoryFormSheet";
import {
  AUTO_CHARGE_QUANTITIES,
  capturedRows,
  capturedTargets,
  capturedTotals,
  chargeQuantityInputs,
  chargeQuantityPayload,
  initialValues,
  sheetCharges,
  type ChargeQuantityInputs,
} from "./factory-form-values";
import { RestockSummaryList } from "./RestockSummaryList";
import { RestockChargesEditor } from "./RestockChargesEditor";
import { RestockSteps } from "./RestockSteps";
import { RestockOrderActions, isAwaitingRestockOrder } from "./RestockOrderActions";
import { RESTOCK_STATUS_LABELS, formatDateTime, relativeDays } from "./pos-labels";
import { usePosLinks } from "./pos-links";

type View = "resumen" | "formato";

/** Empaques por tipo (bidones y garrafas, cajas, piezas sueltas) y lo que equivalen. */
function packCounts(captured: ReturnType<typeof capturedRows>) {
  return captured.reduce(
    (acc, { row, packs, base }) => {
      if (row.lineId) {
        acc.bidones += packs;
        acc.liters += base;
      } else if (row.packSize > 1) {
        acc.cajas += packs;
        acc.boxPieces += base;
      } else acc.piezas += packs;
      return acc;
    },
    { bidones: 0, liters: 0, cajas: 0, boxPieces: 0, piezas: 0 }
  );
}

/** Una cifra del encabezado: ícono, etiqueta, número grande y su equivalencia. */
function Stat({
  icon: Icon,
  label,
  value,
  note,
  total = false,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
  note?: string;
  total?: boolean;
}) {
  return (
    <div className={`restock-stat${total ? " is-total" : ""}`}>
      <span className="restock-stat-head">
        <Icon size={14} />
        {label}
      </span>
      <b>{value}</b>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

/** Primer día del mes en curso (YYYY-MM-DD) en la hora del navegador: basta para el aviso de publicidad. */
function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Paso 1 del surtido: **Revisar y enviar**. La hoja viene con el faltante de
 * hoy; se ajusta en la vista Resumen (lista con − / +) o en la vista Formato
 * (la hoja de 4 páginas de siempre), que editan los mismos valores. "Enviar a
 * fábrica" crea el pedido ya enviado (`approved`), baja el PDF y deja listo un
 * resumen para pegar en WhatsApp. El envío a fábrica sigue siendo manual.
 */
export function RestockReviewPage() {
  const params = useParams<{ id: string }>();
  const branchId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const links = usePosLinks();
  // La caja de una sucursal que hace su pedido (`/pos/pedido`): ve, edita y envía el suyo.
  const cashier = Boolean(links.cashierRestock);
  const canView = can("posRestock", "view") || cashier;
  const canCreate = can("posRestock", "create") || cashier;
  const canUpdate = can("posRestock", "update");
  const canDispatch = canUpdate && can("posInventory", "update");
  // El supervisor de caja ve el pedido con montos, igual que el administrador;
  // la caja también (son los precios de tienda que ya cobra).
  const canSeeCosts = can("productCosts", "view") || can("posSupervisor", "view") || cashier;

  const view: View = searchParams.get("vista") === "formato" ? "formato" : "resumen";
  const [form, setForm] = useState<FactoryForm | null>(null);
  const [values, setValues] = useState<SheetValues>({});
  const [suggested, setSuggested] = useState<SheetValues>({});
  const [page, setPage] = useState(1);
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [awaiting, setAwaiting] = useState<RestockOrder[]>([]);
  const [publicityThisMonth, setPublicityThisMonth] = useState<boolean | null>(null);
  /** Publicidad y envío en pesos. La publicidad va por omisión al precio configurado ($1,300) si este mes no se ha cobrado. */
  const [publicity, setPublicity] = useState("");
  const [shipping, setShipping] = useState("");
  /** Bidones vacíos y cajas azules: calculados con los renglones, o lo que se escriba a mano. */
  const [chargeQuantities, setChargeQuantities] = useState<ChargeQuantityInputs>(AUTO_CHARGE_QUANTITIES);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState<RestockOrder | null>(null);
  /** Pedido "Por enviar" de la sucursal: se revisa y se envía ese. */
  const [draft, setDraft] = useState<RestockOrder | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [orders, month] = await Promise.all([
        httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", { branchId, limit: 100 }),
        httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", { branchId, limit: 100, from: monthStart() }),
      ]);
      const open = orders.items.filter(isAwaitingRestockOrder);
      // Un pedido que se creó pero no se envió ("Por enviar") ES el pedido que
      // se revisa: se carga ese, no el faltante, y Enviar a fábrica lo envía.
      const pendingDraft = open.some((order) => order.status !== RESTOCK_ORDER_STATUS.PENDING)
        ? null
        : (open.find((order) => order.status === RESTOCK_ORDER_STATUS.PENDING) ?? null);
      const data = await httpClient.get<FactoryForm>(
        pendingDraft
          ? `/pos/restock/orders/${pendingDraft.id}/form`
          : `/pos/restock/branches/${branchId}/shortages/form`
      );
      const initial = initialValues(data);
      setForm(data);
      setValues(initial);
      setSuggested(initial);
      setAwaiting(open);
      setDraft(pendingDraft);
      // ¿Ya se le cobró publicidad este mes a la sucursal? (sin contar el propio borrador)
      const chargedThisMonth = month.items.some(
        (order) =>
          order.id !== pendingDraft?.id &&
          order.status !== RESTOCK_ORDER_STATUS.CANCELLED &&
          (Number(order.publicityAmount ?? 0) > 0 || Number(order.publicityQty ?? 0) > 0)
      );
      setPublicityThisMonth(chargedThisMonth);
      const price = data.charges?.publicity ?? 1300;
      if (pendingDraft) {
        // El borrador conserva lo que ya traía; si no traía nada, la regla del mes.
        const saved = data.publicity?.amount ?? 0;
        setPublicity(String(saved > 0 ? saved : chargedThisMonth ? 0 : price));
        setShipping(String(data.shipping?.amount ?? 0));
        setChargeQuantities(chargeQuantityInputs(data));
        setNotes(pendingDraft.notes ?? "");
      } else {
        setPublicity(String(chargedThisMonth ? 0 : price));
        setShipping("0");
        setChargeQuantities(AUTO_CHARGE_QUANTITIES);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo calcular el pedido"));
    } finally {
      setLoading(false);
    }
  }, [branchId, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => (form ? allRows(form) : []), [form]);
  const pages = useMemo(() => (form ? sheetPages(form) : []), [form]);
  const captured = useMemo(() => capturedRows(rows, values), [rows, values]);
  const targets = useMemo(() => capturedTargets(rows, values), [rows, values]);
  const totals = useMemo(() => capturedTotals(captured), [captured]);
  const counts = useMemo(() => packCounts(captured), [captured]);
  const charges = useMemo(
    () => sheetCharges(captured, form?.charges, { publicity, shipping }, chargeQuantities),
    [captured, form?.charges, publicity, shipping, chargeQuantities]
  );
  const grandTotal = totals.amount + charges.total;
  const changed = useMemo(
    () => Object.keys(values).filter((key) => !sameValue(values[key], suggested[key])).length,
    [values, suggested]
  );
  // Ya enviado a fábrica (o en camino): no se puede mandar otro; la pantalla queda de solo lectura.
  const inTransit = draft ? null : (awaiting[0] ?? null);
  const locked = Boolean(inTransit);
  const baseLabel = draft ? "Pedido" : "Sugerido";
  const branchLabel = form ? `${form.code ? `${form.code} · ` : ""}${form.name}` : "";
  const backHref = links.branchOrders(branchId);

  // Con cambios sin enviar, cerrar la pestaña pide confirmación.
  useEffect(() => {
    if (!changed || saving || sent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed, saving, sent]);

  function selectView(next: View) {
    router.replace(links.review(branchId, next === "formato" ? "formato" : null));
  }

  async function downloadPdf(orderId: string) {
    setDownloading(true);
    try {
      const orderForm = await httpClient.get<FactoryForm>(`/pos/restock/orders/${orderId}/form`);
      await exportFactoryFormPdf(orderForm);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo generar el PDF"));
    } finally {
      setDownloading(false);
    }
  }

  async function submit() {
    if (!targets.length) return;
    setSaving(true);
    try {
      const items = targets.map(({ lineId, productId, packs }) => (lineId ? { lineId, qty: packs } : { productId, qty: packs }));
      const order = draft
        ? await httpClient.post<RestockOrder>(`/pos/restock/orders/${draft.id}/submit`, {
            items,
            publicityAmount: charges.publicityAmount,
            shippingAmount: charges.shippingAmount,
            ...chargeQuantityPayload(charges, chargeQuantities),
            notes: notes.trim() || null,
          })
        : await httpClient.post<RestockOrder>(`/pos/restock/branches/${branchId}/generate`, {
            items,
            submit: true,
            publicityAmount: charges.publicityAmount,
            shippingAmount: charges.shippingAmount,
            ...chargeQuantityPayload(charges, chargeQuantities),
            notes: notes.trim() || null,
          });
      setConfirmOpen(false);
      setSent(order);
      toast.success("Pedido enviado a fábrica");
      void downloadPdf(order.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo enviar el pedido"));
    } finally {
      setSaving(false);
    }
  }

  async function copySummary() {
    const lines = captured.map(({ row, packs }) => `• ${row.label}: ${formatQuantity(packs)} ${packDescription(row)}`);
    const extras = [
      charges.publicityAmount && !form?.amountsHidden ? (canSeeCosts ? `• Publicidad: ${formatMoney(charges.publicityAmount)}` : "• Publicidad del mes") : "",
      charges.shippingAmount ? (canSeeCosts ? `• Envío: ${formatMoney(charges.shippingAmount)}` : "• Envío") : "",
      canSeeCosts ? `Total: ${formatMoney(grandTotal)}` : "",
    ].filter(Boolean);
    const text = [`Pedido a fábrica · ${branchLabel}`, ...lines, ...extras, notes.trim() ? `Nota: ${notes.trim()}` : ""]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Resumen copiado: pégalo en el WhatsApp de fábrica");
    } catch {
      toast.error("No se pudo copiar el resumen");
    }
  }

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              El pedido a fábrica necesita el permiso de Faltantes y surtido del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Resultado: el pedido ya salió a fábrica.
  if (sent) {
    return (
      <div className="page-stack">
        <Link href={backHref} className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]">
          <ArrowLeft size={16} />
          {links.backLabel ?? "Volver a los pedidos"}
        </Link>
        <section className="panel p-5 restock-result">
          <RestockSteps current="transit" />
          <CheckCircle2 size={44} className="restock-result-icon" />
          <h1 className="page-title" style={{ margin: 0 }}>Pedido enviado a fábrica</h1>
          <p className="page-kicker" style={{ margin: 0 }}>
            {branchLabel} · {captured.length} {captured.length === 1 ? "producto" : "productos"}
            {canSeeCosts ? ` · ${formatMoney(grandTotal)}` : ""}. El PDF se descargó: mándaselo a fábrica como siempre.{" "}
            {canDispatch ? (
              <>
                Cuando llegue el producto, usa <strong>Recibir</strong> en el pedido.
              </>
            ) : (
              "Cuando llegue el producto, la oficina lo recibe en el panel."
            )}
          </p>
          <div className="restock-result-actions">
            <Button variant="contained" startIcon={<Download size={16} />} disabled={downloading} onClick={() => void downloadPdf(sent.id)}>
              {downloading ? "Generando…" : "Descargar PDF"}
            </Button>
            <Button variant="outlined" startIcon={<ClipboardCopy size={16} />} onClick={() => void copySummary()}>
              Copiar resumen para WhatsApp
            </Button>
            <Button variant="outlined" startIcon={<Eye size={16} />} component={Link} href={links.orderSheet(sent.id)}>
              Ver pedido
            </Button>
            <Button color="inherit" component={Link} href={backHref}>
              {links.backLabel ?? "Volver a los pedidos"}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack msf-page">
      <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]">
        <ArrowLeft size={16} />
        {links.backLabel ?? "Volver a los pedidos"}
      </Link>

      <section className="pos-day pos-cut is-overall restock-review-head">
        <div className="restock-review-top">
          <div className="restock-review-title">
            <span className="restock-review-icon">
              <Truck size={20} />
            </span>
            <div>
              <h1 className="page-title" style={{ margin: 0 }}>
                Pedido a fábrica
              </h1>
              <p className="restock-review-branch">{branchLabel || "…"}</p>
              <p className="page-kicker" style={{ margin: 0 }}>
                {draft ? (
                  <>
                    Este pedido se creó el {formatDateTime(draft.createdAt)} y <strong>todavía no se envía a fábrica</strong>.
                    Revísalo y presiona <strong>Enviar a fábrica</strong>.
                  </>
                ) : locked ? (
                  <>Esta sucursal ya tiene un pedido enviado a fábrica: se podrá hacer otro cuando ese se reciba o se cancele.</>
                ) : (
                  <>
                    Viene con el faltante de hoy. Ajusta lo que quieras pedir y presiona <strong>Enviar a fábrica</strong>.
                  </>
                )}
              </p>
            </div>
          </div>
          <RestockSteps current={locked ? "transit" : "review"} />
        </div>

        {/* Con un pedido en camino las cifras serían del faltante, no de un pedido: se ocultan. */}
        {locked ? null : (
        <div className={`restock-review-stats${canSeeCosts ? "" : " is-no-total"}`} aria-label="Totales del pedido">
          <Stat icon={ListChecks} label="Productos" value={formatQuantity(captured.length)} note={changed ? `${changed} cambiado${changed === 1 ? "" : "s"}` : draft ? "igual al pedido" : "igual al faltante"} />
          <Stat icon={Droplets} label="Líquidos" value={formatQuantity(counts.bidones)} note={`${formatQuantity(counts.liters)} L en bidón o garrafa`} />
          <Stat icon={Package} label="Cajas" value={formatQuantity(counts.cajas)} note={`${formatQuantity(counts.boxPieces)} piezas`} />
          <Stat icon={Boxes} label="Piezas sueltas" value={formatQuantity(counts.piezas)} />
          {canSeeCosts ? (
            <Stat
              icon={ReceiptText}
              label="Total con cargos"
              value={formatMoney(grandTotal)}
              note={`${formatMoney(totals.amount)} de producto + ${formatMoney(charges.total)} de cargos`}
              total
            />
          ) : null}
        </div>
        )}
      </section>

      {inTransit ? (
        <Alert
          severity="info"
          action={
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <Button size="small" startIcon={<Eye size={14} />} component={Link} href={links.orderSheet(inTransit.id)} sx={{ whiteSpace: "nowrap" }}>
                Ver pedido
              </Button>
              <RestockOrderActions order={inTransit} canUpdate={canUpdate} canDispatch={canDispatch} onChanged={() => void load()} />
            </span>
          }
        >
          <strong>Ya hay un pedido en camino</strong> ({RESTOCK_STATUS_LABELS[inTransit.status]}, {formatDateTime(inTransit.createdAt)},{" "}
          {relativeDays(inTransit.createdAt)}).{" "}
          {canUpdate
            ? "Recíbelo cuando llegue o cancélalo para hacer uno nuevo."
            : "Cuando llegue, la oficina lo recibe en el panel; entonces podrás hacer el siguiente."}{" "}
          Abajo puedes ver el faltante de hoy, solo para consultarlo.
        </Alert>
      ) : null}

      <Tabs value={view} onChange={(_e, next) => selectView(next as View)} sx={{ borderBottom: "1px solid var(--border)" }}>
        <Tab value="resumen" label={`Resumen · ${captured.length}`} />
        <Tab value="formato" label="Formato" />
      </Tabs>

      {loading && !form ? <p className="page-kicker">Calculando el faltante…</p> : null}

      {form ? (
        view === "resumen" ? (
          <section className="panel p-5">
            <RestockSummaryList
              rows={rows}
              values={values}
              baseline={suggested}
              baselineLabel={baseLabel}
              onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
              canSeeCosts={canSeeCosts}
              disabled={!canCreate || saving || locked}
              readOnly={locked || !canCreate}
              emptyText="La sucursal está completa en su stock: no hay faltante. Agrega lo que quieras pedir."
            />
          </section>
        ) : (
          <>
            <FormControlLabel
              control={<Switch checked={onlyFilled} onChange={(event) => setOnlyFilled(event.target.checked)} />}
              label="Solo renglones con cantidad"
              sx={{ m: 0 }}
            />
            <FactoryFormSheet
              pages={pages}
              page={page}
              onPageChange={setPage}
              values={values}
              baseline={suggested}
              onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
              disabled={!canCreate || saving || locked}
              readOnly={locked || !canCreate}
              onlyFilled={onlyFilled}
              qtyHeader="Cant"
              inputLabel="Cantidad de"
            />
          </>
        )
      ) : null}

      {form && canSeeCosts ? (
        <section className="panel p-5" style={{ display: "grid", gap: 4 }}>
          <h3 className="restock-summary-title" style={{ margin: 0 }}>
            Cargos de fábrica
          </h3>
          <RestockChargesEditor
            charges={charges}
            publicity={publicity}
            shipping={shipping}
            onPublicityChange={setPublicity}
            onShippingChange={setShipping}
            quantities={chargeQuantities}
            onQuantitiesChange={setChargeQuantities}
            disabled={!canCreate || saving || locked || cashier}
            publicityHint={
              cashier
                ? "Los cargos los pone la oficina: la publicidad va una vez al mes y el envío lo ajustan después."
                : publicityThisMonth
                ? "Este mes ya se le cobró publicidad a esta sucursal: va en $0. Cámbialo si toca cobrarla."
                : `Este mes todavía no se cobra: va en ${formatMoney(form.charges?.publicity ?? 1300)}. Pon 0 si no se cobra.`
            }
          />
        </section>
      ) : null}

      {canCreate && form && !locked ? (
        <div className={`msf-savebar${captured.length ? " msf-savebar--active" : ""}`}>
          <span>
            {captured.length
              ? `${captured.length} ${captured.length === 1 ? "producto" : "productos"} · ${formatQuantity(totals.liters)} L · ${formatQuantity(totals.pieces)} pz${
                  canSeeCosts ? ` · ${formatMoney(grandTotal)}` : ""
                }${changed ? ` · ${changed} cambiado${changed === 1 ? "" : "s"} contra lo ${baseLabel.toLowerCase()}` : ""}`
              : "Sin productos en el pedido"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button color="inherit" startIcon={<RotateCcw size={15} />} disabled={!changed || saving} onClick={() => setValues(suggested)}>
              {draft ? "Volver al pedido" : "Volver a lo sugerido"}
            </Button>
            <Button
              variant="contained"
              startIcon={<Send size={15} />}
              disabled={!captured.length || saving || Boolean(inTransit)}
              onClick={() => setConfirmOpen(true)}
              title={inTransit ? "Ya hay un pedido en camino" : undefined}
            >
              Enviar a fábrica
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={confirmOpen} onClose={() => (saving ? null : setConfirmOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>Enviar a fábrica</DialogTitle>
        <DialogContent dividers>
          <p style={{ marginTop: 0 }}>
            Vas a enviar a fábrica el pedido de <strong>{branchLabel}</strong>: {captured.length}{" "}
            {captured.length === 1 ? "producto" : "productos"} ({formatQuantity(counts.bidones)} bidones o garrafas,{" "}
            {formatQuantity(counts.cajas)} cajas, {formatQuantity(counts.piezas)} piezas
            {charges.publicityAmount && !form?.amountsHidden ? (canSeeCosts ? `, publicidad ${formatMoney(charges.publicityAmount)}` : ", publicidad del mes") : ""}
            {charges.shippingAmount ? (canSeeCosts ? `, envío ${formatMoney(charges.shippingAmount)}` : ", envío") : ""})
            {canSeeCosts ? (
              <>
                {" "}por <strong>{formatMoney(grandTotal)}</strong>
              </>
            ) : null}
            .
          </p>
          <p className="page-kicker">
            Al enviarlo se descarga el PDF del pedido para mandárselo a fábrica. Queda <strong>en camino</strong> hasta que
            lo recibas.
          </p>
          <TextField
            label="Nota para fábrica (opcional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            inputProps={{ maxLength: 500 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={saving}>
            Seguir revisando
          </Button>
          <Button variant="contained" startIcon={<Send size={15} />} onClick={() => void submit()} disabled={saving}>
            {saving ? "Enviando…" : "Enviar"}
          </Button>
        </DialogActions>
      </Dialog>

    </div>
  );
}
