"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, MenuItem, TextField } from "@mui/material";
import { ArrowLeft, ClipboardList, Download, RotateCcw, Save, ShieldAlert } from "lucide-react";
import type { FactoryForm, FactoryFormRow } from "@glamouroso/shared";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { exportFactoryFormPdf, MIN_STOCK_FORM_OPTIONS } from "@/lib/export-factory-form";
import type { Branch, ListResponse } from "@/types";
import { toast } from "sonner";
import {
  FactoryFormSheet,
  allRows,
  isLinked,
  packsOf,
  round2,
  rowKey,
  sameValue,
  sheetPages,
  targetKey,
  toBase,
  uniqueTargets,
  unlinkedCount,
  type SheetValues,
} from "./FactoryFormSheet";

/** Mínimo en unidad base → texto en empaques para el input ("" cuando es 0). */
function packsText(minStock: number | null | undefined, packSize: number): string {
  if (!minStock) return "";
  return String(round2(minStock / Math.max(1, packSize)));
}

/**
 * Captura del stock mínimo de una sucursal **en el orden del formato de pedido
 * a fábrica**: las mismas 4 hojas y los mismos renglones que la hoja impresa
 * con la que la sucursal ya trabaja, para transcribir de corrido en vez de
 * buscar producto por producto. Se captura en empaques, como en el papel (2 =
 * dos bidones = 40 L; 1 = una caja de 24 pz), y se guarda en litros o piezas.
 *
 * Solo se manda lo que cambió, en un solo PUT todo-o-nada.
 */
export function BranchMinStockFormPage() {
  const params = useParams<{ id: string }>();
  const branchId = params.id;
  const { can } = usePermissions();
  const canView = can("posInventory", "view");
  const canEdit = can("posInventory", "update");

  const [form, setForm] = useState<FactoryForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<SheetValues>({});
  const [baseline, setBaseline] = useState<SheetValues>({});
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [copying, setCopying] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** Un renglón por línea o producto: los valores se capturan por producto, no por posición. */
  const rowsByKey = useMemo(() => {
    const map = new Map<string, FactoryFormRow>();
    if (form) for (const row of uniqueTargets(allRows(form))) map.set(targetKey(row), row);
    return map;
  }, [form]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const data = await httpClient.get<FactoryForm>(`/pos/branches/${branchId}/min-stock-form`);
      const initial: SheetValues = {};
      for (const row of uniqueTargets(allRows(data))) {
        initial[targetKey(row)] = packsText(row.minStock, row.packSize);
      }
      setForm(data);
      setValues(initial);
      setBaseline(initial);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el formato de mínimos"));
    } finally {
      setLoading(false);
    }
  }, [branchId, canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canEdit) return;
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200, isActive: "true" })
      .then((res) =>
        setBranches(res.items.filter((b) => b.type !== BRANCH_TYPES.FRANCHISE && b.id !== branchId))
      )
      .catch(() => setBranches([]));
  }, [branchId, canEdit]);

  const dirtyKeys = useMemo(
    () => Object.keys(values).filter((key) => !sameValue(values[key], baseline[key])),
    [values, baseline]
  );

  // Cerrar la pestaña con cambios sin guardar tira media hora de captura.
  useEffect(() => {
    if (!dirtyKeys.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyKeys.length]);

  const pages = useMemo(() => (form ? sheetPages(form) : []), [form]);
  const unlinked = useMemo(() => (form ? unlinkedCount(form) : 0), [form]);

  async function save() {
    if (!form || !dirtyKeys.length) return;
    const rows = dirtyKeys
      .map((key) => {
        const row = rowsByKey.get(key);
        if (!row) return null;
        return {
          ...(row.lineId ? { lineId: row.lineId } : { productId: row.productId }),
          minStock: toBase(values[key], row.packSize),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    setSaving(true);
    try {
      await httpClient.put(`/pos/branches/${branchId}/min-stock`, { rows });
      toast.success(`${rows.length} mínimo${rows.length === 1 ? "" : "s"} guardado${rows.length === 1 ? "" : "s"}`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron guardar los mínimos"));
    } finally {
      setSaving(false);
    }
  }

  /** Trae los mínimos de otra sucursal como punto de partida; no guarda nada hasta "Guardar". */
  async function copyFrom(otherId: string) {
    if (!otherId || !form) return;
    setCopying(true);
    try {
      const other = await httpClient.get<FactoryForm>(`/pos/branches/${otherId}/min-stock-form`);
      const byTarget = new Map<string, number>();
      for (const row of allRows(other)) {
        if (isLinked(row) && row.minStock) byTarget.set(targetKey(row), row.minStock);
      }
      let copied = 0;
      const next = { ...values };
      for (const [key, row] of rowsByKey) {
        const minStock = byTarget.get(key);
        if (minStock == null) continue;
        next[key] = packsText(minStock, row.packSize);
        copied += 1;
      }
      setValues(next);
      const name = branches.find((b) => b.id === otherId)?.name ?? "la otra sucursal";
      toast.success(`Se copiaron ${copied} mínimos de ${name}. Revísalos y guarda.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron copiar los mínimos"));
    } finally {
      setCopying(false);
    }
  }

  /** PDF de la hoja con lo que hay en pantalla (incluido lo no guardado), para revisar en papel. */
  async function exportPdf() {
    if (!form) return;
    setExporting(true);
    try {
      // Un producto repetido en el formato lleva su cantidad solo en el primer renglón.
      const firstRows = new Set(uniqueTargets(allRows(form)).map(rowKey));
      const withValues = (row: FactoryFormRow): FactoryFormRow => {
        if (!isLinked(row)) return row;
        if (!firstRows.has(rowKey(row))) return { ...row, qty: null, amount: null };
        const packs = packsOf(values[targetKey(row)]);
        return { ...row, qty: packs > 0 ? round2(packs) : null, amount: null, unitCost: null };
      };
      await exportFactoryFormPdf(
        {
          ...form,
          pages: form.pages.map((p) => ({ ...p, total: 0, blocks: p.blocks.map((block) => block.map(withValues)) })),
          extras: form.extras.map(withValues),
        },
        MIN_STOCK_FORM_OPTIONS
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
              La captura de mínimos necesita el permiso de Inventario del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const backHref = `/dashboard/pos/sucursales/${branchId}?tab=inventario`;

  return (
    <div className="page-stack msf-page">
      <div className="toolbar">
        <div>
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            Volver al inventario
          </Link>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <ClipboardList size={22} style={{ color: "var(--glam-blue)" }} />
            Stock mínimo{form ? ` · ${form.code ? `${form.code} · ` : ""}${form.name}` : ""}
          </h1>
          <p className="page-kicker">
            Mismo orden que la hoja de pedido a fábrica. Se captura en empaques, como en el papel:{" "}
            <strong>2</strong> en un bidón son 40 L, <strong>1</strong> en una caja de 24 son 24 pz. Enter baja al
            siguiente renglón. Vacío o 0 = sin mínimo.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {canEdit && branches.length ? (
            <TextField
              select
              size="small"
              label="Copiar mínimos de"
              value=""
              onChange={(event) => void copyFrom(event.target.value)}
              disabled={copying || loading}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="" disabled>
                Elige una sucursal…
              </MenuItem>
              {branches.map((branch) => (
                <MenuItem key={branch.id} value={branch.id}>
                  {branch.code} · {branch.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <Button
            variant="outlined"
            startIcon={<Download size={16} />}
            onClick={() => void exportPdf()}
            disabled={!form || exporting}
          >
            {exporting ? "Generando…" : "Descargar PDF"}
          </Button>
        </div>
      </div>

      {unlinked ? (
        <p className="page-kicker" style={{ margin: 0 }}>
          {unlinked} renglones del formato no están ligados al catálogo y se muestran en gris; su
          mínimo se captura desde <Link href={backHref}>Inventario y mínimos</Link>.
        </p>
      ) : null}

      {loading && !form ? <p className="page-kicker">Cargando formato...</p> : null}

      <FactoryFormSheet
        pages={pages}
        page={page}
        onPageChange={setPage}
        values={values}
        baseline={baseline}
        onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
        disabled={!canEdit}
        qtyHeader="Mín"
        inputLabel="Mínimo de"
      />

      {canEdit ? (
        <div className={`msf-savebar${dirtyKeys.length ? " msf-savebar--active" : ""}`}>
          <span>
            {dirtyKeys.length
              ? `${dirtyKeys.length} cambio${dirtyKeys.length === 1 ? "" : "s"} sin guardar`
              : "Sin cambios pendientes"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              color="inherit"
              startIcon={<RotateCcw size={15} />}
              disabled={!dirtyKeys.length || saving}
              onClick={() => setValues(baseline)}
            >
              Descartar
            </Button>
            <Button
              variant="contained"
              startIcon={<Save size={15} />}
              disabled={!dirtyKeys.length || saving}
              onClick={() => void save()}
            >
              {saving ? "Guardando…" : "Guardar mínimos"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
