"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";
import { ArrowLeft, Download, PackagePlus, RotateCcw, ShieldAlert, Truck } from "lucide-react";
import type { FactoryForm } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { exportFactoryFormPdf, RESTOCK_ENTRY_FORM_OPTIONS } from "@/lib/export-factory-form";
import { toast } from "sonner";
import {
  FactoryFormSheet,
  allRows,
  round2,
  rowKey,
  sameValue,
  sheetPages,
  unitOf,
  unlinkedCount,
  type SheetValues,
} from "./FactoryFormSheet";
import {
  capturedRows,
  capturedTargets,
  capturedTotals,
  formWithValues,
  initialValues,
  sheetCharges,
} from "./factory-form-values";
import { RESTOCK_ORIGIN_LABELS, RESTOCK_STATUS_LABELS, formatDate, unitLabel } from "./pos-labels";

/** `order:<id>` | `shortages` | `blank`: con qué se precarga la hoja. */
type BasisKey = string;

function basisParams(key: BasisKey | null): Record<string, string> {
  if (!key) return { basis: "latest" };
  if (key.startsWith("order:")) return { basis: "order", orderId: key.slice(6) };
  return { basis: key };
}

function basisKeyOf(form: FactoryForm): BasisKey {
  const entry = form.entry;
  if (entry?.kind === "order" && entry.orderId) return `order:${entry.orderId}`;
  return entry?.kind ?? "blank";
}

/**
 * Entrada de surtido con el formato de fábrica: la hoja viene precargada con
 * el último pedido que se calculó para la sucursal (o el faltante de hoy, o
 * en blanco) y quien recibe corrige o llena lo que de verdad llegó, en
 * empaques como en el papel. Al registrar, el inventario de la sucursal sube
 * por kardex y el pedido queda recibido.
 *
 * Es la forma de meter producto a las tiendas mientras el módulo de fábrica
 * está apagado.
 */
export function BranchRestockEntryPage() {
  const params = useParams<{ id: string }>();
  const branchId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canView = can("posRestock", "view");
  const canRegister = can("posRestock", "update") && can("posInventory", "update");
  const canSeeCosts = can("productCosts", "view");

  const [form, setForm] = useState<FactoryForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<SheetValues>({});
  const [prefill, setPrefill] = useState<SheetValues>({});
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notes, setNotes] = useState("");
  /** Publicidad que llega con la entrada (pie del formato, precio en `form.charges`). */
  const [publicity, setPublicity] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(
    async (key: BasisKey | null) => {
      if (!canView) return;
      setLoading(true);
      try {
        const data = await httpClient.get<FactoryForm>(
          `/pos/restock/branches/${branchId}/entry-form`,
          basisParams(key)
        );
        // El Back ya reparte la cantidad entre los renglones de un mismo producto.
        const initial = initialValues(data);
        setForm(data);
        setValues(initial);
        setPrefill(initial);
        setPublicity(data.publicity?.qty ? String(data.publicity.qty) : "");
      } catch (error) {
        toast.error(getApiErrorMessage(error, "No se pudo cargar la hoja de entrada"));
      } finally {
        setLoading(false);
      }
    },
    [branchId, canView]
  );

  // La base va en la URL (`?order=<id>` o `?basis=shortages|blank`) para poder
  // enlazar la hoja desde la tarjeta de un pedido; sin nada, el último pedido abierto.
  const orderParam = searchParams.get("order");
  const basisParam = searchParams.get("basis");
  useEffect(() => {
    const key = orderParam
      ? `order:${orderParam}`
      : basisParam === "shortages" || basisParam === "blank"
        ? basisParam
        : null;
    void load(key);
  }, [load, orderParam, basisParam]);

  const rows = useMemo(() => (form ? allRows(form) : []), [form]);
  const pages = useMemo(() => (form ? sheetPages(form) : []), [form]);
  const unlinked = useMemo(() => (form ? unlinkedCount(form) : 0), [form]);

  /** Lo capturado, renglón por renglón (un producto repartido sale en cada renglón que lo lleva). */
  const captured = useMemo(() => capturedRows(rows, values), [rows, values]);
  /** Lo que se registra: la suma por línea o producto. */
  const targets = useMemo(() => capturedTargets(rows, values), [rows, values]);
  const totals = useMemo(() => capturedTotals(captured), [captured]);

  /** Cargos del pie con lo capturado: bidones vacíos, cajas azules y publicidad (reglas del formato de tiendas). */
  const charges = useMemo(() => sheetCharges(captured, form?.charges, publicity), [captured, form?.charges, publicity]);

  const changedFromPrefill = useMemo(
    () => Object.keys(values).filter((key) => !sameValue(values[key], prefill[key])).length,
    [values, prefill]
  );

  // Con algo capturado, cerrar la pestaña pide confirmación.
  const hasWork = changedFromPrefill > 0;
  useEffect(() => {
    if (!hasWork || saving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasWork, saving]);

  const basedOn = form?.entry?.kind === "order"
    ? form.entry.openOrders.find((order) => order.id === form.entry?.orderId) ?? null
    : null;

  function changeBasis(key: BasisKey) {
    if (hasWork && !window.confirm("Se perderá lo que ya capturaste en la hoja. ¿Precargar de nuevo?")) return;
    const query = key.startsWith("order:") ? `order=${key.slice(6)}` : `basis=${key}`;
    router.replace(`/dashboard/pos/sucursales/${branchId}/entrada?${query}`);
  }

  async function register() {
    if (!form || !captured.length) return;
    setSaving(true);
    try {
      await httpClient.post(`/pos/restock/branches/${branchId}/entry`, {
        orderId: form.entry?.kind === "order" ? form.entry.orderId : null,
        items: targets.map(({ lineId, productId, packs }) =>
          lineId ? { lineId, qty: packs } : { productId, qty: packs }
        ),
        notes: notes.trim() || null,
        publicityQty: charges.publicityQty,
      });
      toast.success(
        `Llegada registrada: ${captured.length} ${captured.length === 1 ? "renglón" : "renglones"} al inventario`
      );
      setConfirmOpen(false);
      router.push(`/dashboard/pos/sucursales/${branchId}?tab=pedidos`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo registrar la entrada"));
      setSaving(false);
    }
  }

  /** PDF de la hoja con lo capturado en pantalla: sirve de remisión en papel. */
  async function exportPdf() {
    if (!form) return;
    setExporting(true);
    try {
      await exportFactoryFormPdf(
        formWithValues(form, values, charges, canSeeCosts),
        { ...RESTOCK_ENTRY_FORM_OPTIONS, footers: true }
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo generar el PDF"));
    } finally {
      setExporting(false);
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
              La llegada de surtido necesita el permiso de Faltantes y surtido del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const backHref = `/dashboard/pos/sucursales/${branchId}?tab=pedidos`;
  const selectValue = form ? basisKeyOf(form) : "";

  return (
    <div className="page-stack msf-page">
      <div className="toolbar">
        <div>
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            Volver a pedidos a fábrica
          </Link>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Truck size={22} style={{ color: "var(--glam-blue)", flex: "0 0 auto" }} />
            <span>
              Llegada de surtido{form ? ` · ${form.code ? `${form.code} · ` : ""}${form.name}` : ""}
            </span>
          </h1>
          <p className="page-kicker">
            La hoja viene precargada; corrige o llena lo que de verdad llegó. Se captura en empaques, como en
            el papel: <strong>2</strong> en un bidón son 40 L, <strong>1</strong> en una caja de 24 son 24 pz.
            Enter baja al siguiente renglón.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            select
            size="small"
            label="Precargar con"
            value={selectValue}
            onChange={(event) => changeBasis(event.target.value)}
            disabled={loading || !form}
            InputLabelProps={{ shrink: true }}
            SelectProps={{ displayEmpty: true }}
            sx={{ minWidth: 300 }}
          >
            {(form?.entry?.openOrders ?? []).map((order) => (
              <MenuItem key={order.id} value={`order:${order.id}`}>
                Pedido del {formatDate(order.createdAt)} · {RESTOCK_ORIGIN_LABELS[order.origin] ?? order.origin} ·{" "}
                {RESTOCK_STATUS_LABELS[order.status] ?? order.status} · {order.itemsCount} partidas
              </MenuItem>
            ))}
            <MenuItem value="shortages">Faltante calculado hoy</MenuItem>
            <MenuItem value="blank">En blanco</MenuItem>
          </TextField>
          <Button
            variant="outlined"
            startIcon={<Download size={16} />}
            onClick={() => void exportPdf()}
            disabled={!form || exporting}
          >
            {exporting ? "Generando…" : "Descargar formato"}
          </Button>
        </div>
      </div>

      {form ? (
        <p className="page-kicker" style={{ margin: 0 }}>
          {basedOn
            ? `Precargada con el pedido del ${formatDate(basedOn.createdAt)} (${
                RESTOCK_ORIGIN_LABELS[basedOn.origin] ?? basedOn.origin
              }). Al registrar, ese pedido queda como recibido con lo que captures; sus partidas que dejes vacías quedan en 0.`
            : form.entry?.kind === "shortages"
              ? "La sucursal no tiene pedidos abiertos: la hoja trae el faltante calculado hoy contra su stock. Al registrar se crea una entrada manual."
              : "Hoja en blanco. Al registrar se crea una entrada manual con lo que captures."}
          {unlinked ? ` ${unlinked} renglones sin ligar al catálogo se ven en gris y no se capturan.` : ""}
        </p>
      ) : null}

      {loading && !form ? <p className="page-kicker">Cargando hoja...</p> : null}

      <FactoryFormSheet
        pages={pages}
        page={page}
        onPageChange={setPage}
        values={values}
        baseline={prefill}
        onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        disabled={!canRegister || saving}
        qtyHeader="Cant"
        inputLabel="Cantidad de"
      />

      {canRegister ? (
        <div className={`msf-savebar${captured.length ? " msf-savebar--active" : ""}`}>
          <span>
            {captured.length
              ? `${captured.length} ${captured.length === 1 ? "renglón" : "renglones"} · ${formatQuantity(totals.liters)} L · ${formatQuantity(totals.pieces)} pz${
                  canSeeCosts ? ` · ${formatMoney(totals.amount)}` : ""
                }${changedFromPrefill ? ` · ${changedFromPrefill} cambiado${changedFromPrefill === 1 ? "" : "s"} contra lo precargado` : ""}`
              : "Sin cantidades capturadas"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              color="inherit"
              startIcon={<RotateCcw size={15} />}
              disabled={!changedFromPrefill || saving}
              onClick={() => setValues(prefill)}
            >
              Volver a lo precargado
            </Button>
            <Button
              variant="contained"
              startIcon={<PackagePlus size={15} />}
              disabled={!captured.length || saving}
              onClick={() => setConfirmOpen(true)}
            >
              Registrar llegada
            </Button>
          </div>
        </div>
      ) : (
        <p className="page-kicker">
          Registrar la llegada pide los permisos de Faltantes y surtido y de Inventario (editar).
        </p>
      )}

      <Dialog open={confirmOpen} onClose={() => (saving ? null : setConfirmOpen(false))} fullWidth maxWidth="md">
        <DialogTitle>Registrar llegada de surtido</DialogTitle>
        <DialogContent dividers>
          <p className="page-kicker" style={{ marginTop: 0 }}>
            Sube el inventario de {form?.name} con {captured.length} {captured.length === 1 ? "renglón" : "renglones"}:{" "}
            <strong>{formatQuantity(totals.liters)} L</strong> y <strong>{formatQuantity(totals.pieces)} pz</strong>
            {canSeeCosts ? (
              <>
                {" "}
                por <strong>{formatMoney(totals.amount)}</strong> a costo
              </>
            ) : null}
            .{" "}
            {basedOn
              ? `El pedido del ${formatDate(basedOn.createdAt)} queda como recibido.`
              : "Se guarda como entrada manual en el historial de pedidos."}
          </p>
          <div className="table-container-premium" style={{ maxHeight: 320, overflow: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>Cantidad</th>
                  <th style={{ textAlign: "right" }}>Entra al inventario</th>
                  {canSeeCosts ? <th style={{ textAlign: "right" }}>Importe</th> : null}
                </tr>
              </thead>
              <tbody>
                {captured.map(({ row, packs, base, amount }) => (
                  <tr key={rowKey(row)}>
                    <td>{row.label}</td>
                    <td style={{ textAlign: "right" }}>
                      {formatQuantity(packs)} {unitLabel(packs, row.lineId ? "bidon" : "pieza", row.packLabel)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {formatQuantity(base)} {unitOf(row)}
                    </td>
                    {canSeeCosts ? <td style={{ textAlign: "right" }}>{formatMoney(amount)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px", marginTop: 12, fontSize: 14 }}>
            <span>
              Bidones vacíos: {formatQuantity(charges.transparent)} transparentes y {formatQuantity(charges.color)} de color
            </span>
            <strong>{canSeeCosts ? formatMoney(charges.bidones) : ""}</strong>
            <span>Cajas azules: {formatQuantity(charges.blue)}</span>
            <strong>{canSeeCosts ? formatMoney(charges.blueAmount) : ""}</strong>
            <span>Publicidad: {formatQuantity(charges.publicityQty)}</span>
            <strong>{canSeeCosts ? formatMoney(charges.publicityAmount) : ""}</strong>
            {canSeeCosts ? (
              <>
                <span style={{ fontWeight: 700 }}>Total con cargos</span>
                <strong>{formatMoney(round2(totals.amount + charges.total))}</strong>
              </>
            ) : null}
          </div>
          <TextField
            label="Publicidad (piezas)"
            type="number"
            value={publicity}
            onChange={(event) => setPublicity(event.target.value)}
            inputProps={{ min: 0, step: 1 }}
            helperText={form?.charges ? `${formatMoney(form.charges.publicity)} cada una` : undefined}
            sx={{ mt: 2, mr: 2, width: 200 }}
          />
          <TextField
            label="Nota (opcional)"
            placeholder="Quién lo trajo, remisión, algo que llegó dañado…"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            inputProps={{ maxLength: 500 }}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={saving}>
            Seguir capturando
          </Button>
          <Button variant="contained" onClick={() => void register()} disabled={saving}>
            {saving ? "Registrando…" : "Registrar llegada"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
