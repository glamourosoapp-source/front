"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from "@mui/material";
import { FileSpreadsheet, Pencil, Plus, RotateCcw, Save, ShieldAlert, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { formatMoney } from "@/lib/format-money";
import { ListPagination } from "@/components/ui/ListPagination";
import { FilterBar, FilterMeta, FilterSearch } from "@/components/pos-admin/FilterBar";
import { PriceListImportDialog } from "@/components/pos-admin/PriceListImportDialog";
import type { PriceList, PriceListDetail, PriceListProductRow } from "@/types";

type RowFilter = "" | "list" | "general";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** "46" → 46; vacío → null; texto inválido → NaN (no se guarda). */
function parsePrice(value: string): number | null {
  const clean = value.replace(/[$,\s]/g, "");
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

const priceText = (value: number | null) => (value === null ? "" : String(value));

interface Draft {
  price: string;
  wholesalePrice: string;
}

/**
 * Precios por ciudad (Configuración del POS).
 *
 * Tepic y Tapachula venden los mismos productos que Guadalajara a otro precio.
 * Cada ciudad es una lista; la sucursal elige la suya en Editar datos. La tabla
 * muestra todo el catálogo: el precio general y, si la lista lo trae, el de la
 * ciudad. Lo que la lista no trae se cobra al precio general.
 */
export function PriceListsPage() {
  const { can } = usePermissions();
  const canView = can("products", "view");
  const canManage = can("products", "update");

  const [lists, setLists] = useState<PriceList[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PriceListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RowFilter>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<{ mode: "create" | "rename"; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const loadLists = useCallback(async () => {
    try {
      const res = await httpClient.get<PriceList[]>("/pos/price-lists");
      setLists(res);
      setSelectedId((current) => (current && res.some((l) => l.id === current) ? current : res[0]?.id ?? null));
      if (!res.length) setDetail(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar las listas de precios"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await httpClient.get<PriceListDetail>(`/pos/price-lists/${id}`));
      setDrafts({});
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar la lista"));
    }
  }, []);

  useEffect(() => {
    if (canView) void loadLists();
  }, [canView, loadLists]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const rows = useMemo(() => {
    if (!detail) return [];
    const needle = normalize(search.trim());
    return detail.products.filter((row) => {
      if (filter === "list" && row.listPrice === null) return false;
      if (filter === "general" && row.listPrice !== null) return false;
      if (!needle) return true;
      return normalize(row.name).includes(needle) || normalize(row.sku ?? "").includes(needle);
    });
  }, [detail, search, filter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const pageRows = rows.slice((page - 1) * limit, page * limit);
  const selected = lists.find((list) => list.id === selectedId) ?? null;
  const withList = detail?.products.filter((row) => row.listPrice !== null).length ?? 0;

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              Los precios por ciudad necesitan el permiso de Catálogo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  function draftFor(row: PriceListProductRow): Draft {
    return (
      drafts[row.productId] ?? {
        price: priceText(row.listPrice),
        wholesalePrice: priceText(row.listWholesalePrice),
      }
    );
  }

  function isDirty(row: PriceListProductRow) {
    const draft = drafts[row.productId];
    if (!draft) return false;
    return draft.price !== priceText(row.listPrice) || draft.wholesalePrice !== priceText(row.listWholesalePrice);
  }

  async function saveRow(row: PriceListProductRow) {
    if (!selectedId) return;
    const draft = draftFor(row);
    const price = parsePrice(draft.price);
    const wholesalePrice = parsePrice(draft.wholesalePrice);
    if (price === null || Number.isNaN(price) || price <= 0) {
      toast.error("Escribe el precio de venta (o usa Quitar para cobrar el precio general)");
      return;
    }
    if (Number.isNaN(wholesalePrice)) {
      toast.error("El mayoreo no es un número válido");
      return;
    }
    setSavingId(row.productId);
    try {
      await httpClient.put(`/pos/price-lists/${selectedId}/items`, {
        items: [{ productId: row.productId, price, wholesalePrice }],
      });
      toast.success(`${row.name}: ${formatMoney(price)} en ${selected?.name}`);
      await loadDetail(selectedId);
      await loadLists();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar el precio"));
    } finally {
      setSavingId(null);
    }
  }

  async function removeRow(row: PriceListProductRow) {
    if (!selectedId) return;
    setSavingId(row.productId);
    try {
      await httpClient.delete(`/pos/price-lists/${selectedId}/items/${row.productId}`);
      toast.success(`${row.name} vuelve al precio general (${formatMoney(row.basePrice)})`);
      await loadDetail(selectedId);
      await loadLists();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo quitar el precio"));
    } finally {
      setSavingId(null);
    }
  }

  async function saveName() {
    if (!nameDialog) return;
    const name = nameDialog.name.trim();
    if (name.length < 2) {
      toast.error("Escribe el nombre de la ciudad");
      return;
    }
    try {
      if (nameDialog.mode === "create") {
        const created = await httpClient.post<PriceList>("/pos/price-lists", { name });
        toast.success(`Lista ${name} creada`);
        setSelectedId(created.id);
      } else if (selectedId) {
        await httpClient.patch(`/pos/price-lists/${selectedId}`, { name });
        toast.success("Lista renombrada");
      }
      setNameDialog(null);
      await loadLists();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar la lista"));
    }
  }

  async function removeList() {
    if (!selectedId) return;
    try {
      await httpClient.delete(`/pos/price-lists/${selectedId}`);
      toast.success("Lista borrada");
      setConfirmDelete(false);
      setSelectedId(null);
      await loadLists();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo borrar la lista"));
      setConfirmDelete(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Precios por ciudad</h1>
          <p className="page-kicker">
            Cada ciudad tiene su lista. La sucursal la elige en Editar datos; lo que la lista no
            trae se cobra al precio general del catálogo.
          </p>
        </div>
        {canManage ? (
          <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => setNameDialog({ mode: "create", name: "" })}>
            Nueva lista
          </Button>
        ) : null}
      </div>

      {loading ? <p className="page-kicker">Cargando...</p> : null}

      {!loading && !lists.length ? (
        <div className="panel p-5">
          <h2 style={{ marginTop: 0 }}>Aún no hay listas</h2>
          <p className="page-kicker">
            Todas las sucursales cobran el precio general. Crea una lista por ciudad (por ejemplo
            Tepic) e importa su Excel de eleventa.
          </p>
        </div>
      ) : null}

      {lists.length ? (
        <Tabs
          value={selectedId ?? false}
          onChange={(_e, value: string) => {
            setSelectedId(value);
            setPage(1);
          }}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          {lists.map((list) => (
            <Tab key={list.id} value={list.id} label={list.name} />
          ))}
        </Tabs>
      ) : null}

      {selected && detail ? (
        <>
          <section className="panel p-5">
            <div className="toolbar" style={{ marginBottom: 0, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Tags size={18} style={{ color: "var(--glam-blue)" }} />
                  <h2 style={{ margin: 0 }}>{selected.name}</h2>
                  <Chip size="small" label={`${withList} de ${detail.products.length} productos con precio propio`} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span className="page-kicker" style={{ margin: 0 }}>Sucursales:</span>
                  {selected.branches?.length ? (
                    selected.branches.map((branch) => (
                      <Chip key={branch.id} size="small" variant="outlined" label={`${branch.code} · ${branch.name}`} />
                    ))
                  ) : (
                    <span className="pill-warning">Ninguna: asígnala en Editar datos de la sucursal</span>
                  )}
                </div>
              </div>
              {canManage ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="contained" startIcon={<FileSpreadsheet size={16} />} onClick={() => setImportOpen(true)}>
                    Importar Excel de eleventa
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Pencil size={14} />}
                    onClick={() => setNameDialog({ mode: "rename", name: selected.name })}
                  >
                    Renombrar
                  </Button>
                  <Button variant="outlined" color="error" startIcon={<Trash2 size={14} />} onClick={() => setConfirmDelete(true)}>
                    Borrar
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

          <FilterBar>
            <FilterSearch
              value={search}
              placeholder="Buscar producto por nombre o código"
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
            <TextField
              select
              size="small"
              label="Precio"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as RowFilter);
                setPage(1);
              }}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="">Todo el catálogo</MenuItem>
              <MenuItem value="list">Con precio de {selected.name}</MenuItem>
              <MenuItem value="general">Cobran el precio general</MenuItem>
            </TextField>
            <FilterMeta>
              <strong>{rows.length}</strong> productos
            </FilterMeta>
          </FilterBar>

          <div className="table-container-premium">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: "right", width: 150 }}>General</th>
                  <th style={{ width: 130 }}>{selected.name}</th>
                  <th style={{ width: 130 }}>Mayoreo {selected.name}</th>
                  <th style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const draft = draftFor(row);
                  const dirty = isDirty(row);
                  const busy = savingId === row.productId;
                  return (
                    <tr key={row.productId}>
                      <td>
                        <strong>{row.name}</strong>
                        <div className="page-kicker" style={{ margin: 0 }}>
                          {[row.sku ? `Código ${row.sku}` : null, row.categoryName].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {formatMoney(row.basePrice)}
                        <div className="page-kicker" style={{ margin: 0 }}>
                          May. {row.baseWholesalePrice ? formatMoney(row.baseWholesalePrice) : "—"}
                        </div>
                      </td>
                      <td>
                        <TextField
                          size="small"
                          value={draft.price}
                          placeholder={String(row.basePrice)}
                          disabled={!canManage || busy}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [row.productId]: { ...draft, price: e.target.value } }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && dirty) void saveRow(row);
                          }}
                          inputProps={{ inputMode: "decimal", "aria-label": `Precio ${selected.name} de ${row.name}` }}
                        />
                      </td>
                      <td>
                        <TextField
                          size="small"
                          value={draft.wholesalePrice}
                          placeholder={row.baseWholesalePrice ? String(row.baseWholesalePrice) : ""}
                          disabled={!canManage || busy}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.productId]: { ...draft, wholesalePrice: e.target.value },
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && dirty) void saveRow(row);
                          }}
                          inputProps={{ inputMode: "decimal", "aria-label": `Mayoreo ${selected.name} de ${row.name}` }}
                        />
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {canManage && dirty ? (
                          <Button size="small" variant="contained" startIcon={<Save size={14} />} disabled={busy} onClick={() => void saveRow(row)}>
                            Guardar
                          </Button>
                        ) : null}
                        {canManage && !dirty && row.listPrice !== null ? (
                          <Tooltip title="Quitar de la lista: cobra el precio general">
                            <span>
                              <IconButton size="small" disabled={busy} onClick={() => void removeRow(row)}>
                                <RotateCcw size={16} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : null}
                        {!dirty && row.listPrice === null ? <span className="pill-muted">General</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ListPagination
            page={page}
            totalPages={totalPages}
            limit={limit}
            total={rows.length}
            onPageChange={setPage}
            onLimitChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
          />
        </>
      ) : null}

      <Dialog open={Boolean(nameDialog)} onClose={() => setNameDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{nameDialog?.mode === "create" ? "Nueva lista de precios" : "Renombrar lista"}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Ciudad"
            placeholder="Tepic"
            value={nameDialog?.name ?? ""}
            onChange={(e) => setNameDialog((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveName();
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNameDialog(null)}>Cancelar</Button>
          <Button variant="contained" onClick={() => void saveName()}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>¿Borrar la lista {selected?.name}?</DialogTitle>
        <DialogContent>
          <p className="page-kicker">
            Se borran sus {selected?.itemsCount ?? 0} precios. Solo se puede si ninguna sucursal la
            usa.
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={() => void removeList()}>
            Borrar
          </Button>
        </DialogActions>
      </Dialog>

      {selected && detail && importOpen ? (
        <PriceListImportDialog
          open={importOpen}
          list={selected}
          catalog={detail.products}
          onClose={() => setImportOpen(false)}
          onSaved={async () => {
            setImportOpen(false);
            await loadDetail(selected.id);
            await loadLists();
          }}
        />
      ) : null}
    </div>
  );
}
