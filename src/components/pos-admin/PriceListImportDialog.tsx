"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  TextField,
} from "@mui/material";
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { normalizePriceListName } from "@glamouroso/shared/pos-price-lists";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { parseProductImportFile } from "@/lib/parse-product-import-xlsx";
import { formatMoney } from "@/lib/format-money";
import { ListPagination } from "@/components/ui/ListPagination";
import type { PriceList, PriceListImportPreview, PriceListImportPreviewRow, PriceListProductRow } from "@/types";

type View = "warnings" | "unmatched" | "changed" | "new" | "same" | "missing";

interface RowState {
  include: boolean;
  productId: string | null;
  price: string;
  wholesalePrice: string;
}

function parsePrice(value: string): number | null {
  const clean = value.replace(/[$,\s]/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

const tokens = (name: string) => new Set(normalizePriceListName(name).split(" ").filter((t) => t.length > 1));

/** Parecido entre dos nombres (palabras en común): ordena las sugerencias. */
function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  ta.forEach((t) => {
    if (tb.has(t)) common += 1;
  });
  return common / (ta.size + tb.size - common);
}

/** Con código: hay nombres repetidos en el catálogo (dos CLORO 1 LITRO). */
const optionLabel = (option: PriceListProductRow) =>
  option.sku ? `${option.name} · código ${option.sku}` : option.name;

/** Ya vienen ordenadas por parecido; filtra por lo que se escribe y corta en 50. */
function filterProducts(options: PriceListProductRow[], state: { inputValue: string }) {
  const needle = normalizePriceListName(state.inputValue);
  const found = needle ? options.filter((o) => normalizePriceListName(optionLabel(o)).includes(needle)) : options;
  return found.slice(0, 50);
}

/**
 * Importar el Excel de eleventa de una ciudad a su lista de precios.
 *
 * Empata por nombre (el Back), muestra lo que cambia, lo que no empató y los
 * precios raros, y guarda solo lo marcado. El precio y el mayoreo se pueden
 * corregir aquí antes de guardar. Nunca toca el catálogo general.
 */
export function PriceListImportDialog({
  open,
  list,
  catalog,
  onClose,
  onSaved,
}: {
  open: boolean;
  list: PriceList;
  catalog: PriceListProductRow[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PriceListImportPreview | null>(null);
  const [state, setState] = useState<RowState[]>([]);
  const [view, setView] = useState<View>("warnings");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [saving, setSaving] = useState(false);

  const productById = useMemo(() => new Map(catalog.map((p) => [p.productId, p])), [catalog]);

  async function pickFile(file: File) {
    setLoading(true);
    setFileName(file.name);
    try {
      const parsed = await parseProductImportFile(file);
      if (parsed.missingColumns.length) {
        toast.error(`Al Excel le faltan las columnas: ${parsed.missingColumns.join(", ")}`);
        return;
      }
      if (!parsed.rows.length) {
        toast.error("El Excel no trae productos");
        return;
      }
      const result = await httpClient.post<PriceListImportPreview>(`/pos/price-lists/${list.id}/import/preview`, {
        rows: parsed.rows.map((row) => ({
          row: Number.parseInt(row.posId, 10) || undefined,
          posId: row.posId,
          name: row.name,
          price: row.price,
          wholesalePrice: row.wholesalePrice && row.wholesalePrice > 0 ? row.wholesalePrice : null,
        })),
      });
      setPreview(result);
      setState(
        result.rows.map((row) => ({
          // Lo igual no hace falta guardarlo; lo que no empató espera a que lo ligues.
          include: row.suggestInclude,
          productId: row.product?.id ?? null,
          price: String(row.price),
          wholesalePrice: row.wholesalePrice === null ? "" : String(row.wholesalePrice),
        }))
      );
      const firstView: View = result.summary.warnings
        ? "warnings"
        : result.summary.unmatched
          ? "unmatched"
          : result.summary.changed
            ? "changed"
            : "new";
      setView(firstView);
      setPage(1);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo leer el Excel"));
    } finally {
      setLoading(false);
    }
  }

  const indexed = useMemo(
    () => (preview ? preview.rows.map((row, index) => ({ row, index })) : []),
    [preview]
  );

  const inView = useMemo(() => {
    return indexed.filter(({ row }) => {
      if (view === "warnings") return row.warnings.length > 0;
      if (view === "unmatched") return row.status === "unmatched";
      return row.status === view;
    });
  }, [indexed, view]);

  const selectedItems = state
    .map((s, index) => ({ s, row: preview?.rows[index] }))
    .filter(({ s }) => s.include && s.productId);

  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    selectedItems.forEach(({ s }) => seen.set(s.productId!, (seen.get(s.productId!) ?? 0) + 1));
    return Array.from(seen.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => productById.get(id)?.name ?? id);
  }, [selectedItems, productById]);

  function patch(index: number, next: Partial<RowState>) {
    setState((prev) => prev.map((s, i) => (i === index ? { ...s, ...next } : s)));
  }

  function suggestionsFor(row: PriceListImportPreviewRow) {
    return [...catalog]
      .map((product) => ({ product, score: similarity(row.name, product.name) }))
      .sort((a, b) => b.score - a.score)
      .map(({ product }) => product);
  }

  async function save() {
    if (duplicates.length) {
      toast.error(`Un producto quedó ligado a dos renglones: ${duplicates.join(", ")}`);
      return;
    }
    const items = [];
    for (const { s, row } of selectedItems) {
      const price = parsePrice(s.price);
      const wholesalePrice = parsePrice(s.wholesalePrice);
      if (price === null || Number.isNaN(price) || price <= 0 || Number.isNaN(wholesalePrice)) {
        toast.error(`Revisa el precio de ${row?.name}`);
        return;
      }
      items.push({ productId: s.productId!, price, wholesalePrice });
    }
    if (!items.length) {
      toast.error("No hay precios marcados para guardar");
      return;
    }
    setSaving(true);
    try {
      await httpClient.put(`/pos/price-lists/${list.id}/items`, { items });
      toast.success(`${items.length} precios guardados en ${list.name}`);
      await onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron guardar los precios"));
    } finally {
      setSaving(false);
    }
  }

  const summary = preview?.summary;
  const totalPages = Math.max(1, Math.ceil((view === "missing" ? preview?.notInSheet.length ?? 0 : inView.length) / limit));
  const pageRows = inView.slice((page - 1) * limit, page * limit);

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Importar precios de {list.name}</DialogTitle>
      <DialogContent dividers>
        {!preview ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <p className="page-kicker" style={{ margin: 0 }}>
              Sube el Excel que exporta eleventa en la sucursal (columnas Descripción, Precio Venta
              y Precio Mayoreo). Se empata por nombre con el catálogo; el costo y el inventario del
              Excel no se usan.
            </p>
            <Button component="label" variant="contained" startIcon={<Upload size={16} />} disabled={loading}>
              {loading ? "Leyendo…" : "Elegir Excel"}
              <input
                hidden
                type="file"
                accept=".xls,.xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void pickFile(file);
                  e.target.value = "";
                }}
              />
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <FileSpreadsheet size={16} />
              <strong>{fileName}</strong>
              <Chip size="small" label={`${summary!.total} renglones`} />
              <Chip size="small" color="primary" label={`${summary!.matched} empatados`} />
              {summary!.unmatched ? <Chip size="small" color="warning" label={`${summary!.unmatched} sin empatar`} /> : null}
              <Chip size="small" variant="outlined" label={`${selectedItems.length} por guardar`} />
            </div>

            {duplicates.length ? (
              <Alert severity="error">Un producto quedó ligado a dos renglones: {duplicates.join(", ")}.</Alert>
            ) : null}

            <Tabs
              value={view}
              onChange={(_e, value: View) => {
                setView(value);
                setPage(1);
              }}
              variant="scrollable"
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              <Tab value="warnings" label={`Revisar (${summary!.warnings})`} />
              <Tab value="unmatched" label={`Sin empatar (${summary!.unmatched})`} />
              <Tab value="changed" label={`Cambian (${summary!.changed})`} />
              <Tab value="new" label={`Nuevos en la lista (${summary!.newItems})`} />
              <Tab value="same" label={`Iguales (${summary!.same})`} />
              <Tab value="missing" label={`No vienen en el Excel (${preview.notInSheet.length})`} />
            </Tabs>

            {view === "missing" ? (
              <>
                <p className="page-kicker" style={{ margin: 0 }}>
                  Estos productos del catálogo no están en el Excel: en {list.name} se cobran al
                  precio general (o al que ya tengan en la lista).
                </p>
                <div className="table-container-premium">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th style={{ textAlign: "right", width: 140 }}>Precio general</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.notInSheet.slice((page - 1) * limit, page * limit).map((product) => (
                        <tr key={product.id}>
                          <td>{product.name}</td>
                          <td style={{ textAlign: "right" }}>{formatMoney(product.basePrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="table-container-premium">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}></th>
                      <th>Renglón del Excel</th>
                      <th>Producto del catálogo</th>
                      <th style={{ textAlign: "right", width: 110 }}>General</th>
                      <th style={{ textAlign: "right", width: 110 }}>Hoy en {list.name}</th>
                      <th style={{ width: 110 }}>Venta</th>
                      <th style={{ width: 110 }}>Mayoreo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(({ row, index }) => {
                      const s = state[index]!;
                      const linked = s.productId ? productById.get(s.productId) ?? null : null;
                      return (
                        <tr key={index} style={row.warnings.length ? { background: "#fff7ed" } : undefined}>
                          <td>
                            <Checkbox
                              size="small"
                              checked={s.include}
                              disabled={!s.productId}
                              onChange={(e) => patch(index, { include: e.target.checked })}
                              inputProps={{ "aria-label": `Guardar ${row.name}` }}
                            />
                          </td>
                          <td>
                            <strong>{row.name}</strong>
                            {row.row ? <div className="page-kicker" style={{ margin: 0 }}>#{row.row}</div> : null}
                            {row.warnings.map((warning) => (
                              <div key={warning} style={{ display: "flex", gap: 4, alignItems: "center", color: "#b45309", fontSize: 13 }}>
                                <AlertTriangle size={13} /> {warning}
                              </div>
                            ))}
                          </td>
                          <td style={{ minWidth: 320 }}>
                            {row.status === "unmatched" || row.warnings.length > 0 ? (
                              <Autocomplete
                                size="small"
                                options={suggestionsFor(row)}
                                value={linked}
                                onChange={(_e, next) =>
                                  patch(index, { productId: next?.productId ?? null, include: Boolean(next) })
                                }
                                getOptionLabel={optionLabel}
                                isOptionEqualToValue={(option, value) => option.productId === value.productId}
                                filterOptions={filterProducts}
                                renderOption={(props, option) => (
                                  <li {...props} key={option.productId}>
                                    {optionLabel(option)}
                                  </li>
                                )}
                                renderInput={(params) => (
                                  <TextField {...params} placeholder="Ligar a un producto" />
                                )}
                              />
                            ) : (
                              row.product?.name
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>{linked ? formatMoney(linked.basePrice) : "—"}</td>
                          <td style={{ textAlign: "right" }}>
                            {row.currentPrice === null ? <span className="pill-muted">General</span> : formatMoney(row.currentPrice)}
                          </td>
                          <td>
                            <TextField
                              size="small"
                              value={s.price}
                              onChange={(e) => patch(index, { price: e.target.value })}
                              inputProps={{ inputMode: "decimal", "aria-label": `Venta de ${row.name}` }}
                            />
                          </td>
                          <td>
                            <TextField
                              size="small"
                              value={s.wholesalePrice}
                              onChange={(e) => patch(index, { wholesalePrice: e.target.value })}
                              inputProps={{ inputMode: "decimal", "aria-label": `Mayoreo de ${row.name}` }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {!pageRows.length ? (
                      <tr>
                        <td colSpan={7} className="page-kicker">
                          Nada en esta pestaña.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}

            <ListPagination
              page={page}
              totalPages={totalPages}
              limit={limit}
              total={view === "missing" ? preview.notInSheet.length : inView.length}
              onPageChange={setPage}
              onLimitChange={(value) => {
                setLimit(value);
                setPage(1);
              }}
            />
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        {preview ? (
          <Button variant="contained" onClick={() => void save()} disabled={saving || !selectedItems.length}>
            {saving ? "Guardando…" : `Guardar ${selectedItems.length} precios`}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
