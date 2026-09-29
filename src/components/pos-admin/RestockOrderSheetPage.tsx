"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
} from "@mui/material";
import { ArrowLeft, Download, Pencil, RotateCcw, Save, Send, ShieldAlert, Truck } from "lucide-react";
import { toast } from "sonner";
import type { FactoryForm, FactoryFormRow } from "@glamouroso/shared";
import { BRANCH_TYPES, RESTOCK_ORDER_STATUS, RESTOCK_ORIGIN } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { exportFactoryFormPdf, RESTOCK_ENTRY_FORM_OPTIONS } from "@/lib/export-factory-form";
import type { RestockOrder, RestockOrderItem } from "@/types";
import {
  FactoryFormSheet,
  allRows,
  packsOf,
  round2,
  sameValue,
  sheetPages,
  targetKey,
  uniqueTargets,
  unitOf,
  type SheetValues,
} from "./FactoryFormSheet";
import { capturedRows, capturedTotals, formWithValues, initialValues, sheetCharges } from "./factory-form-values";
import {
  RESTOCK_ORIGIN_LABELS,
  RESTOCK_STATUS_COLORS,
  RESTOCK_STATUS_LABELS,
  formatDateTime,
  restockOrderSheetHref,
  unitLabel,
} from "./pos-labels";
import { RestockSendDialog } from "./RestockSendDialog";

function itemKey(item: RestockOrderItem): string {
  return item.lineId ? `line:${item.lineId}` : `product:${item.productId}`;
}

/** Un renglón cambiado contra cómo estaba el pedido. */
interface Change {
  row: FactoryFormRow;
  before: number;
  after: number;
  item: RestockOrderItem | null;
}

/**
 * La hoja del formato de un pedido de surtido: cómo quedó (lo que se envía, o
 * lo pedido si nadie lo ha tocado) y, con `?modo=editar`, la misma captura que
 * la entrada de surtido para corregir lo que sale de fábrica. Antes de enviar
 * solo cambia el pedido; ya enviado, la diferencia entra o sale del inventario
 * de la sucursal. El total del pedido se recalcula con lo que se envía.
 */
export function RestockOrderSheetPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const editing = searchParams.get("modo") === "editar";
  const { can } = usePermissions();
  const canView = can("posRestock", "view");
  const canSeeCosts = can("productCosts", "view");

  const [order, setOrder] = useState<RestockOrder | null>(null);
  const [form, setForm] = useState<FactoryForm | null>(null);
  const [values, setValues] = useState<SheetValues>({});
  const [baseline, setBaseline] = useState<SheetValues>({});
  const [page, setPage] = useState(1);
  const [onlyFilled, setOnlyFilled] = useState(!editing);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [dispatchNote, setDispatchNote] = useState("");

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const [orderData, formData] = await Promise.all([
        httpClient.get<RestockOrder>(`/pos/restock/orders/${orderId}`),
        httpClient.get<FactoryForm>(`/pos/restock/orders/${orderId}/form`),
      ]);
      const initial = initialValues(formData);
      setOrder(orderData);
      setForm(formData);
      setValues(initial);
      setBaseline(initial);
      setReasons({});
      setDispatchNote(orderData.dispatchNotes ?? "");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el pedido"));
    } finally {
      setLoading(false);
    }
  }, [canView, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOnlyFilled(!editing);
  }, [editing]);

  const isFranchise = order?.origin === RESTOCK_ORIGIN.FRANCHISE || order?.branch?.type === BRANCH_TYPES.FRANCHISE;
  const isCancelled = order?.status === RESTOCK_ORDER_STATUS.CANCELLED;
  const alreadySent =
    order?.status === RESTOCK_ORDER_STATUS.SENT || order?.status === RESTOCK_ORDER_STATUS.RECEIVED;
  const isOpen = Boolean(order) && !alreadySent && !isCancelled;
  const canDispatch =
    can("posRestock", "update") && can("posInventory", "update") && !isFranchise && !isCancelled;
  const canEdit = editing && canDispatch;

  const rows = useMemo(() => (form ? uniqueTargets(allRows(form)) : []), [form]);
  const pages = useMemo(() => (form ? sheetPages(form) : []), [form]);
  const captured = useMemo(() => capturedRows(rows, values), [rows, values]);
  const totals = useMemo(() => capturedTotals(captured), [captured]);
  const charges = useMemo(
    () => sheetCharges(captured, form?.charges, form?.publicity?.qty ?? 0),
    [captured, form?.charges, form?.publicity?.qty]
  );
  const estimatedTotal = round2(totals.amount + charges.total);

  const itemsByKey = useMemo(() => {
    const map = new Map<string, RestockOrderItem>();
    for (const item of order?.items ?? []) if (!map.has(itemKey(item))) map.set(itemKey(item), item);
    return map;
  }, [order?.items]);

  const changes: Change[] = useMemo(
    () =>
      rows
        .filter((row) => !sameValue(values[targetKey(row)], baseline[targetKey(row)]))
        .map((row) => ({
          row,
          before: packsOf(baseline[targetKey(row)]),
          after: packsOf(values[targetKey(row)]),
          item: itemsByKey.get(targetKey(row)) ?? null,
        })),
    [rows, values, baseline, itemsByKey]
  );

  // Con cambios sin guardar, salir de la pestaña pide confirmación.
  useEffect(() => {
    if (!changes.length || saving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length, saving]);

  async function save(thenSend: boolean) {
    if (!order) return;
    setSaving(true);
    try {
      if (changes.length) {
        await httpClient.put<RestockOrder>(`/pos/restock/orders/${order.id}/dispatch`, {
          items: changes.map(({ row, after, item }) => ({
            ...(item
              ? { itemId: item.id }
              : row.lineId
                ? { lineId: row.lineId }
                : { productId: row.productId }),
            dispatchedQty: after,
            ...(reasons[targetKey(row)]?.trim() ? { notes: reasons[targetKey(row)]!.trim() } : {}),
          })),
          notes: dispatchNote.trim() || null,
        });
      }
      if (thenSend) {
        await httpClient.post(`/pos/restock/orders/${order.id}/send`, {});
        toast.success(`Pedido enviado a ${order.branch?.name ?? "la sucursal"}: subió al inventario`);
      } else {
        toast.success(
          alreadySent ? "Envío corregido y el inventario de la sucursal ajustado" : "Envío actualizado"
        );
      }
      setConfirmOpen(false);
      router.replace(restockOrderSheetHref(order.id));
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar el envío"));
    } finally {
      setSaving(false);
    }
  }

  async function exportPdf() {
    if (!form) return;
    setExporting(true);
    try {
      await exportFactoryFormPdf(formWithValues(form, values, charges, canSeeCosts), {
        ...RESTOCK_ENTRY_FORM_OPTIONS,
        footers: true,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo generar el PDF"));
    } finally {
      setExporting(false);
    }
  }

  function leave() {
    if (changes.length && !window.confirm("Hay cambios sin guardar. ¿Salir sin guardarlos?")) return;
    if (window.history.length > 1) router.back();
    else router.push("/dashboard/pos/surtido");
  }

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              La hoja del pedido necesita el permiso de Faltantes y surtido del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const shownTotal = changes.length ? estimatedTotal : (order?.total ?? form?.grandTotal ?? null);

  return (
    <div className="page-stack msf-page">
      <div className="toolbar">
        <div>
          <button
            type="button"
            onClick={leave}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            Volver a los pedidos
          </button>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Truck size={22} style={{ color: "var(--glam-blue)" }} />
            {canEdit ? "Editar envío" : "Pedido a fábrica"}
            {order?.branch ? ` · ${order.branch.code} · ${order.branch.name}` : ""}
          </h1>
          {order ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Chip
                size="small"
                label={RESTOCK_STATUS_LABELS[order.status] ?? order.status}
                color={RESTOCK_STATUS_COLORS[order.status] ?? "default"}
              />
              <Chip size="small" variant="outlined" label={RESTOCK_ORIGIN_LABELS[order.origin] ?? order.origin} />
              <span className="page-kicker" style={{ margin: 0 }}>
                Pedido {formatDateTime(order.createdAt)}
                {order.sentAt ? ` · enviado ${formatDateTime(order.sentAt)}` : ""}
                {order.receivedAt ? ` · recibido ${formatDateTime(order.receivedAt)}` : ""}
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {shownTotal != null && !isFranchise ? (
            <div style={{ textAlign: "right", marginRight: 8 }}>
              <div className="page-kicker" style={{ margin: 0 }}>
                {changes.length ? "Total estimado con los cambios" : "Total del pedido"}
              </div>
              <strong style={{ fontSize: 22 }}>{formatMoney(shownTotal)}</strong>
              {changes.length && order?.total != null ? (
                <div className="page-kicker" style={{ margin: 0 }}>
                  antes {formatMoney(order.total)}
                </div>
              ) : null}
            </div>
          ) : null}
          <Button
            variant="outlined"
            startIcon={<Download size={16} />}
            onClick={() => void exportPdf()}
            disabled={!form || exporting}
          >
            {exporting ? "Generando…" : "Descargar PDF"}
          </Button>
          {!editing && canDispatch ? (
            <Button
              variant="outlined"
              startIcon={<Pencil size={16} />}
              component={Link}
              href={restockOrderSheetHref(orderId, true)}
            >
              Editar envío
            </Button>
          ) : null}
          {!editing && canDispatch && isOpen ? (
            <Button variant="contained" startIcon={<Send size={16} />} onClick={() => setSendOpen(true)}>
              Enviado a sucursal
            </Button>
          ) : null}
        </div>
      </div>

      {order ? (
        canEdit ? (
          <Alert severity={alreadySent ? "warning" : "info"}>
            {alreadySent
              ? "Este pedido ya se envió: al guardar, lo que bajes sale del inventario de la sucursal y lo que subas o agregues entra."
              : "Todavía no se envía: corrige lo que de verdad sale de fábrica (lo que no hay, déjalo vacío). El inventario sube cuando lo marques como enviado."}{" "}
            Se captura en empaques, como en el papel: <strong>2</strong> en un bidón son 40 L. Enter baja al siguiente
            renglón.
          </Alert>
        ) : (
          <p className="page-kicker" style={{ margin: 0 }}>
            {alreadySent
              ? "Cómo salió de fábrica: lo que se envió a la sucursal."
              : isCancelled
                ? "Pedido cancelado: así estaba cuando se canceló."
                : "Cómo va el pedido: lo que se va a enviar (lo pedido, o lo que ya se corrigió)."}
            {order.dispatchNotes ? ` Nota del envío: ${order.dispatchNotes}` : ""}
          </p>
        )
      ) : null}

      {editing && !canDispatch && order ? (
        <Alert severity="warning">
          {isCancelled
            ? "Un pedido cancelado no se edita."
            : isFranchise
              ? "Los pedidos de franquicia no se editan aquí."
              : "Editar el envío pide los permisos de Faltantes y surtido y de Inventario (editar)."}
        </Alert>
      ) : null}

      {loading && !form ? <p className="page-kicker">Cargando hoja...</p> : null}

      {form ? (
        <FormControlLabel
          control={<Switch checked={onlyFilled} onChange={(event) => setOnlyFilled(event.target.checked)} />}
          label="Solo renglones con cantidad"
          sx={{ m: 0 }}
        />
      ) : null}

      <FactoryFormSheet
        pages={pages}
        page={page}
        onPageChange={setPage}
        values={values}
        baseline={baseline}
        onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        disabled={!canEdit || saving}
        readOnly={!canEdit}
        onlyFilled={onlyFilled}
        qtyHeader="Cant"
        inputLabel="Cantidad de"
      />

      {form ? (
        <div className={`msf-savebar${canEdit && changes.length ? " msf-savebar--active" : ""}`}>
          <span>
            {captured.length} {captured.length === 1 ? "renglón" : "renglones"} · {formatQuantity(totals.liters)} L ·{" "}
            {formatQuantity(totals.pieces)} pz
            {canEdit && changes.length
              ? ` · ${changes.length} cambiado${changes.length === 1 ? "" : "s"}`
              : ""}
          </span>
          {canEdit ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                color="inherit"
                startIcon={<RotateCcw size={15} />}
                disabled={!changes.length || saving}
                onClick={() => setValues(baseline)}
              >
                Volver a como estaba
              </Button>
              <Button color="inherit" onClick={leave} disabled={saving}>
                Cancelar
              </Button>
              <Button
                variant="contained"
                startIcon={<Save size={15} />}
                disabled={!changes.length || saving}
                onClick={() => setConfirmOpen(true)}
              >
                Guardar cambios
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={confirmOpen} onClose={() => (saving ? null : setConfirmOpen(false))} fullWidth maxWidth="md">
        <DialogTitle>{alreadySent ? "Corregir lo que se envió" : "Guardar lo que se envía"}</DialogTitle>
        <DialogContent dividers>
          <p className="page-kicker" style={{ marginTop: 0 }}>
            {alreadySent
              ? `El pedido ya se envió: la diferencia entra o sale del inventario de ${order?.branch?.name ?? "la sucursal"}.`
              : "Todavía no se envía: el inventario no se mueve hasta marcarlo como enviado."}
          </p>
          <div className="table-container-premium" style={{ maxHeight: 340, overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>Antes</th>
                  <th style={{ textAlign: "right" }}>Ahora</th>
                  {alreadySent ? <th style={{ textAlign: "right" }}>Inventario</th> : null}
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {changes.map(({ row, before, after, item }) => {
                  const delta = round2((after - before) * Math.max(1, row.packSize));
                  const pack = (qty: number) =>
                    `${formatQuantity(qty)} ${unitLabel(qty, row.lineId ? "bidon" : "pieza", row.packLabel)}`;
                  return (
                    <tr key={targetKey(row)}>
                      <td>
                        {row.label}
                        {!item ? (
                          <div className="page-kicker" style={{ margin: 0 }}>
                            no venía en el pedido: se agrega
                          </div>
                        ) : null}
                      </td>
                      <td style={{ textAlign: "right" }}>{pack(before)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{pack(after)}</td>
                      {alreadySent ? (
                        <td style={{ textAlign: "right", color: delta < 0 ? "#b91c1c" : "#15803d" }}>
                          {delta > 0 ? "+" : ""}
                          {formatQuantity(delta)} {unitOf(row)}
                        </td>
                      ) : null}
                      <td>
                        <TextField
                          size="small"
                          placeholder={after < before ? "No hay en fábrica" : "Motivo"}
                          value={reasons[targetKey(row)] ?? ""}
                          onChange={(event) =>
                            setReasons((prev) => ({ ...prev, [targetKey(row)]: event.target.value }))
                          }
                          inputProps={{ maxLength: 500, "aria-label": `Motivo de ${row.label}` }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!isFranchise && order?.total != null ? (
            <p style={{ marginBottom: 0 }}>
              Total del pedido: {formatMoney(order.total)} → <strong>{formatMoney(estimatedTotal)}</strong>{" "}
              <span className="page-kicker">(estimado; al guardar se recalcula con el formato)</span>
            </p>
          ) : null}
          <TextField
            label="Nota del envío (opcional)"
            value={dispatchNote}
            onChange={(event) => setDispatchNote(event.target.value)}
            fullWidth
            size="small"
            sx={{ mt: 2 }}
            inputProps={{ maxLength: 500 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={saving}>
            Seguir editando
          </Button>
          {isOpen ? (
            <Button variant="outlined" onClick={() => void save(true)} disabled={saving}>
              Guardar y marcar enviado
            </Button>
          ) : null}
          <Button variant="contained" onClick={() => void save(false)} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogActions>
      </Dialog>

      {sendOpen && order ? (
        <RestockSendDialog
          order={order}
          editHref={restockOrderSheetHref(order.id, true)}
          onClose={() => setSendOpen(false)}
          onSent={() => {
            setSendOpen(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
