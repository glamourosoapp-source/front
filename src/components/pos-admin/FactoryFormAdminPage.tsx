"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { FileSpreadsheet, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import type { FactoryFormAdmin, FactoryFormAdminRow, FactoryFormTarget } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { exportFactoryFormXlsx } from "@/lib/export-factory-form-xlsx";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import type { Branch, ListResponse } from "@/types";
import { PAGE_HINTS } from "./FactoryFormSheet";
import { UnlinkedProductsTab } from "./UnlinkedProductsTab";

type Kind = "product" | "section" | "blank";

/** Qué se está editando: un renglón existente o uno nuevo debajo de `afterRow`. */
type Editing =
  | { mode: "edit"; row: FactoryFormAdminRow }
  | { mode: "create"; page: number; block: number; afterRow: number };

interface Draft {
  kind: Kind;
  label: string;
  target: FactoryFormTarget | null;
  packSize: string;
  unitPrice: string;
  bidon: "" | "transparent" | "color";
  blueBox: boolean;
}

const EMPTY_DRAFT: Draft = { kind: "product", label: "", target: null, packSize: "1", unitPrice: "", bidon: "", blueBox: false };

/**
 * El formato de pedido a tiendas (Punto de venta → Formato de pedido): la
 * lista de renglones que usan la hoja de mínimos, la entrada de surtido y el
 * PDF, con su producto ligado, empaque, precio a tienda, bidón y caja azul.
 * Aquí se agregan, editan y quitan renglones, y se descarga el Excel en blanco
 * con las reglas bloqueadas.
 */
export function FactoryFormAdminPage() {
  const { can } = usePermissions();
  const canView = can("posRestock", "view");
  const canEdit = can("posRestock", "update");

  const [form, setForm] = useState<FactoryFormAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [targets, setTargets] = useState<FactoryFormTarget[]>([]);
  const debouncedSearch = useDebounce(search, 250);
  // "Productos no ligados" vivía en Faltantes y surtido, pero ligar un producto
  // es editar el formato: ahora es una vista de esta pantalla (`?vista=no-ligados`).
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("vista") === "no-ligados" ? "no-ligados" : "renglones";
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    if (!canView || view !== "no-ligados" || branches.length) return;
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200, isActive: "true" })
      .then((res) => setBranches(res.items))
      .catch(() => setBranches([]));
  }, [canView, view, branches.length]);

  function selectView(next: string) {
    router.replace(next === "no-ligados" ? "/dashboard/pos/formato?vista=no-ligados" : "/dashboard/pos/formato");
  }

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      setForm(await httpClient.get<FactoryFormAdmin>("/pos/factory-form/rows"));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el formato"));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editing || draft.kind !== "product" || !canEdit) return;
    httpClient
      .get<FactoryFormTarget[]>("/pos/factory-form/targets", { search: debouncedSearch })
      .then(setTargets)
      .catch(() => setTargets([]));
  }, [debouncedSearch, editing, draft.kind, canEdit]);

  const pages = useMemo(() => [...new Set((form?.rows ?? []).map((row) => row.page))].sort((a, b) => a - b), [form]);
  const blocks = useMemo(() => {
    const rows = (form?.rows ?? []).filter((row) => row.page === page);
    const ids = [...new Set(rows.map((row) => row.block))].sort((a, b) => a - b);
    return ids.map((block) => ({ block, rows: rows.filter((row) => row.block === block).sort((a, b) => a.row - b.row) }));
  }, [form, page]);

  function openCreate(pageNumber: number, block: number, afterRow: number) {
    setDraft(EMPTY_DRAFT);
    setSearch("");
    setEditing({ mode: "create", page: pageNumber, block, afterRow });
  }

  function openEdit(row: FactoryFormAdminRow) {
    setDraft({
      kind: row.kind,
      label: row.label,
      target: row.lineId || row.productId
        ? {
            type: row.lineId ? "line" : "product",
            id: (row.lineId ?? row.productId)!,
            name: row.targetName ?? row.label,
            packSize: row.packSize,
            cost: 0,
            inForm: true,
          }
        : null,
      packSize: String(row.packSize),
      unitPrice: row.unitPrice == null ? "" : String(row.unitPrice),
      bidon: row.bidon ?? "",
      blueBox: row.blueBox,
    });
    setSearch("");
    setEditing({ mode: "edit", row });
  }

  async function save() {
    if (!editing) return;
    const isLine = draft.target?.type === "line";
    const body: Record<string, unknown> = {
      label: draft.label.trim(),
      lineId: isLine ? draft.target!.id : null,
      productId: draft.target && !isLine ? draft.target.id : null,
      packSize: isLine ? undefined : Math.max(1, Math.round(Number(draft.packSize) || 1)),
      unitPrice: draft.unitPrice === "" ? null : Number(draft.unitPrice),
      bidon: draft.bidon || null,
      blueBox: draft.blueBox,
    };
    setSaving(true);
    try {
      if (editing.mode === "create") {
        await httpClient.post("/pos/factory-form/rows", {
          page: editing.page,
          block: editing.block,
          afterRow: editing.afterRow,
          kind: draft.kind,
          ...(draft.kind === "product" ? body : { label: draft.label.trim() }),
        });
        toast.success("Renglón agregado");
      } else {
        await httpClient.put(`/pos/factory-form/rows/${editing.row.id}`, draft.kind === "product" ? body : { label: draft.label.trim() });
        toast.success("Renglón guardado");
      }
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar el renglón"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: FactoryFormAdminRow) {
    const what = row.kind === "blank" ? "este renglón en blanco" : `"${row.label}"`;
    if (!window.confirm(`¿Quitar ${what} del formato? Los renglones de abajo suben un lugar.`)) return;
    try {
      await httpClient.delete(`/pos/factory-form/rows/${row.id}`);
      toast.success("Renglón quitado");
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo quitar el renglón"));
    }
  }

  async function download() {
    if (!form) return;
    setExporting(true);
    try {
      await exportFactoryFormXlsx(form);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo generar el Excel"));
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
              El formato de pedido necesita el permiso de Faltantes y surtido del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const suggestion =
    draft.target && draft.target.cost > 0
      ? draft.target.type === "line"
        ? draft.target.cost
        : Math.round(draft.target.cost / Math.max(1, draft.target.packSize) * Math.max(1, Number(draft.packSize) || 1) * 100) / 100
      : null;

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Formato de pedido</h1>
          <p className="page-kicker">
            La hoja que usan las tiendas para pedir, capturar mínimos y registrar entradas. Aquí se agregan, cambian
            o quitan renglones. El Excel sale en blanco y con las reglas bloqueadas: solo se escriben fecha, nombre y
            cantidades.
          </p>
        </div>
        <Button
          variant="contained"
          startIcon={<FileSpreadsheet size={16} />}
          onClick={() => void download()}
          disabled={!form || exporting}
        >
          {exporting ? "Generando…" : "Descargar Excel en blanco"}
        </Button>
      </div>

      {form ? (
        <p className="page-kicker" style={{ margin: 0 }}>
          Pie del formato: bidón transparente {formatMoney(form.charges.bidonTransparent)}, bidón de color{" "}
          {formatMoney(form.charges.bidonColor)}, caja azul {formatMoney(form.charges.blueBox)}, publicidad{" "}
          {formatMoney(form.charges.publicity)}.
        </p>
      ) : null}

      <Tabs value={view} onChange={(_e, value) => selectView(value as string)} sx={{ borderBottom: "1px solid var(--border)" }}>
        <Tab value="renglones" label="Renglones del formato" />
        <Tab value="no-ligados" label="Productos no ligados" />
      </Tabs>

      {view === "no-ligados" ? <UnlinkedProductsTab branches={branches} /> : null}

      {view === "renglones" ? (
      <>
      <Tabs value={pages.includes(page) ? page : (pages[0] ?? 1)} onChange={(_e, value) => setPage(value as number)} variant="scrollable" allowScrollButtonsMobile>
        {pages.map((p) => (
          <Tab
            key={p}
            value={p}
            label={
              <span className="msf-tab">
                <strong>Hoja {p}</strong>
                <span>{PAGE_HINTS[p] ?? ""}</span>
              </span>
            }
          />
        ))}
      </Tabs>

      {loading && !form ? <p className="page-kicker">Cargando formato...</p> : null}

      <div className="msf-sheet ffa-sheet">
        {blocks.map(({ block, rows }) => (
          <div className="msf-block" key={block}>
            <div className="ffa-head">
              <span>Bloque {block + 1}</span>
              {canEdit ? (
                <Button size="small" startIcon={<Plus size={14} />} onClick={() => openCreate(page, block, -1)}>
                  Al inicio
                </Button>
              ) : null}
            </div>
            {rows.map((row) => (
              <div key={row.id} className={`ffa-row ffa-row--${row.kind}`}>
                <div className="ffa-main">
                  {row.kind === "blank" ? (
                    <span className="ffa-muted">(renglón en blanco)</span>
                  ) : (
                    <strong>{row.label}</strong>
                  )}
                  {row.kind === "product" ? (
                    <span className="ffa-meta">
                      {row.targetName ?? <em className="ffa-warn">sin ligar</em>} ·{" "}
                      {row.lineId ? `${row.packLabel} ${formatQuantity(row.packSize)} L` : row.packSize > 1 ? `${row.packLabel} ×${row.packSize}` : "pieza"}
                      {row.unitPrice != null ? ` · ${formatMoney(row.unitPrice)}` : ""}
                      {row.bidon ? (
                        <Chip size="small" label={row.bidon === "color" ? "bidón color" : "bidón"} sx={{ ml: 0.5, height: 16, fontSize: 10 }} />
                      ) : null}
                      {row.blueBox ? <Chip size="small" color="info" label="caja azul" sx={{ ml: 0.5, height: 16, fontSize: 10 }} /> : null}
                    </span>
                  ) : null}
                </div>
                {canEdit ? (
                  <span className="ffa-actions">
                    {row.kind !== "blank" ? (
                      <button type="button" title="Editar" aria-label={`Editar ${row.label}`} onClick={() => openEdit(row)}>
                        <Pencil size={14} />
                      </button>
                    ) : null}
                    <button type="button" title="Agregar debajo" aria-label={`Agregar debajo de ${row.label || "renglón en blanco"}`} onClick={() => openCreate(row.page, row.block, row.row)}>
                      <Plus size={14} />
                    </button>
                    <button type="button" title="Quitar" aria-label={`Quitar ${row.label || "renglón en blanco"}`} onClick={() => void remove(row)}>
                      <Trash2 size={14} />
                    </button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      </>
      ) : null}

      <Dialog open={Boolean(editing)} onClose={() => (saving ? null : setEditing(null))} fullWidth maxWidth="sm">
        <DialogTitle>{editing?.mode === "create" ? "Agregar renglón" : "Editar renglón"}</DialogTitle>
        <DialogContent dividers className="form-grid">
          {editing?.mode === "create" ? (
            <ToggleButtonGroup
              exclusive
              size="small"
              value={draft.kind}
              onChange={(_e, value) => value && setDraft((d) => ({ ...d, kind: value as Kind }))}
            >
              <ToggleButton value="product">Producto</ToggleButton>
              <ToggleButton value="section">Título de sección</ToggleButton>
              <ToggleButton value="blank">Renglón en blanco</ToggleButton>
            </ToggleButtonGroup>
          ) : null}
          {draft.kind !== "blank" ? (
            <TextField
              label={draft.kind === "section" ? "Título" : "Nombre en la hoja"}
              value={draft.label}
              onChange={(event) => setDraft((d) => ({ ...d, label: event.target.value.toUpperCase() }))}
              inputProps={{ maxLength: 120 }}
              helperText={draft.kind === "product" ? "Como aparece en el formato impreso, p. ej. GUANTE CONFORT CAJA CON 100 PIEZAS" : undefined}
              fullWidth
            />
          ) : null}
          {draft.kind === "product" ? (
            <>
              <Autocomplete
                options={targets}
                value={draft.target}
                onChange={(_e, value) =>
                  setDraft((d) => ({
                    ...d,
                    target: value,
                    label: d.label || (value?.name ?? "").toUpperCase(),
                    packSize: value ? String(value.packSize) : d.packSize,
                  }))
                }
                onInputChange={(_e, value, reason) => reason === "input" && setSearch(value)}
                getOptionLabel={(option) => `${option.name}${option.type === "line" ? " (línea)" : ""}`}
                getOptionDisabled={(option) => option.inForm && option.id !== (editing?.mode === "edit" ? editing.row.lineId ?? editing.row.productId : "")}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                filterOptions={(options) => options}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <span style={{ display: "flex", flexDirection: "column" }}>
                      <span>
                        {option.name}
                        {option.type === "line" ? " · línea" : ""}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        {option.type === "line" ? `bidón de ${option.packSize} L` : option.packSize > 1 ? `empaque de ${option.packSize}` : "pieza"}
                        {option.inForm ? " · ya está en el formato" : ""}
                      </span>
                    </span>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField {...params} label="Producto o línea del catálogo" placeholder="Escribe para buscar" helperText="Sin ligar, el renglón se ve en gris y no lleva cantidad." />
                )}
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <TextField
                  label={draft.target?.type === "line" ? "Litros por bidón" : "Piezas por empaque"}
                  type="number"
                  value={draft.target?.type === "line" ? String(draft.target.packSize) : draft.packSize}
                  onChange={(event) => setDraft((d) => ({ ...d, packSize: event.target.value }))}
                  disabled={draft.target?.type === "line"}
                  inputProps={{ min: 1, step: 1 }}
                  helperText={draft.target?.type === "line" ? "Lo pone la línea" : "1 = pieza suelta"}
                />
                <TextField
                  label="Precio a tienda por empaque"
                  type="number"
                  value={draft.unitPrice}
                  onChange={(event) => setDraft((d) => ({ ...d, unitPrice: event.target.value }))}
                  inputProps={{ min: 0, step: "any" }}
                  helperText={suggestion != null ? `Costo del catálogo: ${formatMoney(suggestion)}` : "Vacío = costo del catálogo"}
                />
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <TextField
                  select
                  size="small"
                  label="Bidón vacío"
                  value={draft.bidon}
                  onChange={(event) => setDraft((d) => ({ ...d, bidon: event.target.value as Draft["bidon"] }))}
                  InputLabelProps={{ shrink: true }}
                  SelectProps={{ displayEmpty: true }}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">No lleva</MenuItem>
                  <MenuItem value="transparent">Transparente</MenuItem>
                  <MenuItem value="color">De color</MenuItem>
                </TextField>
                <FormControlLabel
                  control={<Checkbox checked={draft.blueBox} onChange={(event) => setDraft((d) => ({ ...d, blueBox: event.target.checked }))} />}
                  label="Lleva caja azul"
                />
              </div>
            </>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={saving || (draft.kind !== "blank" && !draft.label.trim())}
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
