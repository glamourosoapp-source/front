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
import { capturedRows, capturedTargets, capturedTotals, initialValues, sheetCharges } from "./factory-form-values";
import { RestockSummaryList } from "./RestockSummaryList";
import { RestockSteps } from "./RestockSteps";
import { RestockOrderActions, isAwaitingRestockOrder } from "./RestockOrderActions";
import { RESTOCK_STATUS_LABELS, formatDateTime, relativeDays, restockOrderSheetHref } from "./pos-labels";

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
  const canView = can("posRestock", "view");
  const canCreate = can("posRestock", "create");
  const canUpdate = can("posRestock", "update");
  const canDispatch = canUpdate && can("posInventory", "update");
  const canSeeCosts = can("productCosts", "view");

  const view: View = searchParams.get("vista") === "formato" ? "formato" : "resumen";
  const [form, setForm] = useState<FactoryForm | null>(null);
  const [values, setValues] = useState<SheetValues>({});
  const [suggested, setSuggested] = useState<SheetValues>({});
  const [page, setPage] = useState(1);
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [awaiting, setAwaiting] = useState<RestockOrder[]>([]);
  const [publicityThisMonth, setPublicityThisMonth] = useState<boolean | null>(null);
  const [publicity, setPublicity] = useState("");
  const [showCharges, setShowCharges] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState<RestockOrder | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [data, orders, month] = await Promise.all([
        httpClient.get<FactoryForm>(`/pos/restock/branches/${branchId}/shortages/form`),
        httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", { branchId, limit: 100 }),
        httpClient.get<ListResponse<RestockOrder>>("/pos/restock/orders", { branchId, limit: 100, from: monthStart() }),
      ]);
      const initial = initialValues(data);
      setForm(data);
      setValues(initial);
      setSuggested(initial);
      setAwaiting(orders.items.filter(isAwaitingRestockOrder));
      setPublicityThisMonth(
        month.items.some(
          (order) => order.status !== RESTOCK_ORDER_STATUS.CANCELLED && Number(order.publicityQty ?? 0) > 0
        )
      );
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
  const charges = useMemo(() => sheetCharges(captured, form?.charges, publicity), [captured, form?.charges, publicity]);
  const grandTotal = totals.amount + charges.total;
  const changed = useMemo(
    () => Object.keys(values).filter((key) => !sameValue(values[key], suggested[key])).length,
    [values, suggested]
  );
  const inTransit = awaiting[0] ?? null;
  const branchLabel = form ? `${form.code ? `${form.code} · ` : ""}${form.name}` : "";
  const backHref = `/dashboard/pos/sucursales/${branchId}?tab=pedidos`;

  // Con cambios sin enviar, cerrar la pestaña pide confirmación.
  useEffect(() => {
    if (!changed || saving || sent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed, saving, sent]);

  function selectView(next: View) {
    const query = new URLSearchParams(searchParams.toString());
    if (next === "formato") query.set("vista", "formato");
    else query.delete("vista");
    router.replace(`/dashboard/pos/sucursales/${branchId}/pedido${query.size ? `?${query}` : ""}`);
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
      const order = await httpClient.post<RestockOrder>(`/pos/restock/branches/${branchId}/generate`, {
        items: targets.map(({ lineId, productId, packs }) => (lineId ? { lineId, qty: packs } : { productId, qty: packs })),
        submit: true,
        publicityQty: charges.publicityQty,
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
      charges.publicityQty ? `• Publicidad: ${charges.publicityQty}` : "",
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
          Volver a pedidos a fábrica
        </Link>
        <section className="panel p-5 restock-result">
          <RestockSteps current="transit" />
          <CheckCircle2 size={44} className="restock-result-icon" />
          <h1 className="page-title" style={{ margin: 0 }}>Pedido enviado a fábrica</h1>
          <p className="page-kicker" style={{ margin: 0 }}>
            {branchLabel} · {captured.length} {captured.length === 1 ? "producto" : "productos"}
            {canSeeCosts ? ` · ${formatMoney(grandTotal)}` : ""}. El PDF se descargó: mándaselo a fábrica como siempre.
            Cuando llegue el producto, usa <strong>Recibir</strong> en el pedido.
          </p>
          <div className="restock-result-actions">
            <Button variant="contained" startIcon={<Download size={16} />} disabled={downloading} onClick={() => void downloadPdf(sent.id)}>
              {downloading ? "Generando…" : "Descargar PDF"}
            </Button>
            <Button variant="outlined" startIcon={<ClipboardCopy size={16} />} onClick={() => void copySummary()}>
              Copiar resumen para WhatsApp
            </Button>
            <Button variant="outlined" startIcon={<Eye size={16} />} component={Link} href={restockOrderSheetHref(sent.id)}>
              Ver pedido
            </Button>
            <Button color="inherit" component={Link} href={backHref}>
              Volver a la sucursal
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
        Volver a pedidos a fábrica
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
                Viene con el faltante de hoy. Ajusta lo que quieras pedir y presiona <strong>Enviar a fábrica</strong>.
              </p>
            </div>
          </div>
          <RestockSteps current="review" />
        </div>

        <div className={`restock-review-stats${canSeeCosts ? "" : " is-no-total"}`} aria-label="Totales del pedido">
          <Stat icon={ListChecks} label="Productos" value={formatQuantity(captured.length)} note={changed ? `${changed} cambiado${changed === 1 ? "" : "s"}` : "igual al faltante"} />
          <Stat icon={Droplets} label="Bidones" value={formatQuantity(counts.bidones)} note={`${formatQuantity(counts.liters)} L de líquidos`} />
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
      </section>

      {inTransit ? (
        <Alert
          severity="info"
          action={
            <RestockOrderActions order={inTransit} canUpdate={canUpdate} canDispatch={canDispatch} onChanged={() => void load()} />
          }
        >
          <strong>Ya hay un pedido en camino</strong> ({RESTOCK_STATUS_LABELS[inTransit.status]}, {formatDateTime(inTransit.createdAt)},{" "}
          {relativeDays(inTransit.createdAt)}). Se podrá enviar otro cuando ese se reciba o se cancele.
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
              baselineLabel="Sugerido"
              onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
              canSeeCosts={canSeeCosts}
              disabled={!canCreate || saving}
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
              disabled={!canCreate || saving}
              onlyFilled={onlyFilled}
              qtyHeader="Cant"
              inputLabel="Cantidad de"
            />
          </>
        )
      ) : null}

      {form && canSeeCosts ? (
        <section className="panel p-5">
          <Button size="small" color="inherit" onClick={() => setShowCharges((open) => !open)} aria-expanded={showCharges}>
            {showCharges ? "Ocultar" : "Ver"} cargos de fábrica ({formatMoney(charges.total)})
          </Button>
          {showCharges ? (
            <div className="restock-charges">
              <span>
                Bidones vacíos: {formatQuantity(charges.transparent)} transparentes y {formatQuantity(charges.color)} de color
              </span>
              <strong>{formatMoney(charges.bidones)}</strong>
              <span>Cajas azules: {formatQuantity(charges.blue)}</span>
              <strong>{formatMoney(charges.blueAmount)}</strong>
              <TextField
                label="Publicidad (piezas)"
                type="number"
                size="small"
                value={publicity}
                onChange={(event) => setPublicity(event.target.value)}
                inputProps={{ min: 0, step: 1 }}
                helperText={
                  publicityThisMonth === false
                    ? "Este mes todavía no se ha pedido publicidad para esta sucursal."
                    : publicityThisMonth
                      ? "Este mes ya se pidió publicidad para esta sucursal."
                      : form.charges
                        ? `${formatMoney(form.charges.publicity)} cada una`
                        : undefined
                }
                sx={{ width: 320 }}
              />
              <strong>{formatMoney(charges.publicityAmount)}</strong>
            </div>
          ) : null}
        </section>
      ) : null}

      {canCreate && form ? (
        <div className={`msf-savebar${captured.length ? " msf-savebar--active" : ""}`}>
          <span>
            {captured.length
              ? `${captured.length} ${captured.length === 1 ? "producto" : "productos"} · ${formatQuantity(totals.liters)} L · ${formatQuantity(totals.pieces)} pz${
                  canSeeCosts ? ` · ${formatMoney(grandTotal)}` : ""
                }${changed ? ` · ${changed} cambiado${changed === 1 ? "" : "s"} contra lo sugerido` : ""}`
              : "Sin productos en el pedido"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button color="inherit" startIcon={<RotateCcw size={15} />} disabled={!changed || saving} onClick={() => setValues(suggested)}>
              Volver a lo sugerido
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
            {captured.length === 1 ? "producto" : "productos"} ({formatQuantity(counts.bidones)} bidones,{" "}
            {formatQuantity(counts.cajas)} cajas, {formatQuantity(counts.piezas)} piezas
            {charges.publicityQty ? `, ${charges.publicityQty} de publicidad` : ""})
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
