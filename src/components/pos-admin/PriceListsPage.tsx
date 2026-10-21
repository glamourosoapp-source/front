"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
} from "@mui/material";
import {
  BookOpen,
  Check,
  FileSpreadsheet,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  Store,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { formatMoney } from "@/lib/format-money";
import { ListPagination } from "@/components/ui/ListPagination";
import { FilterBar, FilterMeta, FilterSearch } from "@/components/pos-admin/FilterBar";
import { PriceListImportDialog } from "@/components/pos-admin/PriceListImportDialog";
import { PriceListBranchesDialog } from "@/components/pos-admin/PriceListBranchesDialog";
import type { PriceList, PriceListComparison, PriceListProductRow } from "@/types";

type RowFilter = "" | "different" | "missing";
type ComparisonRow = PriceListComparison["products"][number];
type BranchRef = PriceListComparison["branches"][number];

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

/** "+10 %" contra el precio general; nada si es igual. */
function deltaLabel(base: number, price: number): string | null {
  if (!(base > 0) || Math.abs(price - base) < 0.005) return null;
  const pct = Math.round(((price - base) / base) * 100);
  return pct === 0 ? (price > base ? "+<1 %" : "−<1 %") : `${pct > 0 ? "+" : "−"}${Math.abs(pct)} %`;
}

/** Chips de sucursales: las primeras y "+N" para no romper la tarjeta. */
function BranchChips({ branches, empty }: { branches: BranchRef[]; empty: string }) {
  if (!branches.length) return <span className="price-card-empty">{empty}</span>;
  const shown = branches.slice(0, 6);
  return (
    <div className="price-card-branches">
      {shown.map((b) => (
        <Tooltip key={b.id} title={b.name}>
          <span className="price-card-branch">{b.code}</span>
        </Tooltip>
      ))}
      {branches.length > shown.length ? (
        <Tooltip title={branches.slice(6).map((b) => b.code).join(", ")}>
          <span className="price-card-branch is-more">+{branches.length - shown.length}</span>
        </Tooltip>
      ) : null}
    </div>
  );
}

interface Editing {
  productId: string;
  listId: string;
  price: string;
  wholesalePrice: string;
}

/**
 * Precios por ciudad (Configuración del POS).
 *
 * Las listas lado a lado: el precio general del catálogo y una columna por
 * ciudad. Cada tarjeta dice qué sucursales cobran con esa lista y desde ahí se
 * asignan o se cambian. El precio general se edita en Catálogo; aquí solo se
 * editan los de cada ciudad (clic en la celda). Lo que una ciudad no trae se
 * cobra al precio general.
 */
export function PriceListsPage() {
  const { can } = usePermissions();
  const canView = can("products", "view");
  const canManage = can("products", "update");
  const canAssign = can("posBranches", "update");

  const [data, setData] = useState<PriceListComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RowFilter>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameDialog, setNameDialog] = useState<{ mode: "create" | "rename"; list?: PriceList; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PriceList | null>(null);
  const [importList, setImportList] = useState<PriceList | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ list: PriceList | null } | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; list: PriceList } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await httpClient.get<PriceListComparison>("/pos/price-lists/compare"));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los precios"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const lists = data?.lists ?? [];
  const branchesOf = (listId: string | null) => (data?.branches ?? []).filter((b) => b.priceListId === listId);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = normalize(search.trim());
    return data.products.filter((row) => {
      if (filter === "different" && !lists.some((l) => row.prices[l.id] && Math.abs(row.prices[l.id]!.price - row.basePrice) >= 0.005)) {
        return false;
      }
      if (filter === "missing" && lists.every((l) => row.prices[l.id])) return false;
      if (!needle) return true;
      return normalize(row.name).includes(needle) || normalize(row.sku ?? "").includes(needle);
    });
  }, [data, lists, search, filter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const pageRows = rows.slice((page - 1) * limit, page * limit);

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

  /** Lo que el diálogo de importar necesita: el catálogo visto desde una lista. */
  function catalogFor(list: PriceList): PriceListProductRow[] {
    return (data?.products ?? []).map((row) => ({
      productId: row.productId,
      name: row.name,
      sku: row.sku,
      categoryName: row.categoryName,
      basePrice: row.basePrice,
      baseWholesalePrice: row.baseWholesalePrice,
      listPrice: row.prices[list.id]?.price ?? null,
      listWholesalePrice: row.prices[list.id]?.wholesalePrice ?? null,
      updatedAt: null,
    }));
  }

  function startEdit(row: ComparisonRow, list: PriceList) {
    const current = row.prices[list.id];
    setEditing({
      productId: row.productId,
      listId: list.id,
      price: String(current?.price ?? row.basePrice),
      wholesalePrice: String(current?.wholesalePrice ?? row.baseWholesalePrice ?? ""),
    });
  }

  async function saveEdit(row: ComparisonRow) {
    if (!editing) return;
    const list = lists.find((l) => l.id === editing.listId);
    const price = parsePrice(editing.price);
    const wholesalePrice = parsePrice(editing.wholesalePrice);
    if (price === null || Number.isNaN(price) || price <= 0) {
      toast.error("Escribe el precio de venta");
      return;
    }
    if (Number.isNaN(wholesalePrice)) {
      toast.error("El mayoreo no es un número válido");
      return;
    }
    setSaving(true);
    try {
      await httpClient.put(`/pos/price-lists/${editing.listId}/items`, {
        items: [{ productId: row.productId, price, wholesalePrice }],
      });
      toast.success(`${row.name}: ${formatMoney(price)} en ${list?.name}`);
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar el precio"));
    } finally {
      setSaving(false);
    }
  }

  async function useGeneral(row: ComparisonRow, list: PriceList) {
    setSaving(true);
    try {
      await httpClient.delete(`/pos/price-lists/${list.id}/items/${row.productId}`);
      toast.success(`${row.name} en ${list.name} vuelve al precio general (${formatMoney(row.basePrice)})`);
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo quitar el precio"));
    } finally {
      setSaving(false);
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
        await httpClient.post("/pos/price-lists", { name });
        toast.success(`Lista ${name} creada`);
      } else if (nameDialog.list) {
        await httpClient.patch(`/pos/price-lists/${nameDialog.list.id}`, { name });
        toast.success("Lista renombrada");
      }
      setNameDialog(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar la lista"));
    }
  }

  async function removeList(list: PriceList) {
    try {
      await httpClient.delete(`/pos/price-lists/${list.id}`);
      toast.success(`Lista ${list.name} borrada`);
      setConfirmDelete(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo borrar la lista"));
      setConfirmDelete(null);
    }
  }

  const totalProducts = data?.products.length ?? 0;
  const generalBranches = branchesOf(null);

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Precios por ciudad</h1>
          <p className="page-kicker">
            Cada sucursal cobra con una lista. La de su ciudad si tiene; si no, el precio general del
            catálogo. Lo que una ciudad no trae también va al precio general.
          </p>
        </div>
        {canManage ? (
          <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => setNameDialog({ mode: "create", name: "" })}>
            Nueva lista
          </Button>
        ) : null}
      </div>

      {loading ? <p className="page-kicker">Cargando...</p> : null}

      {data ? (
        <div className="price-card-grid">
          <section className="price-card is-general">
            <header className="price-card-head">
              <span className="price-card-icon">
                <BookOpen size={18} />
              </span>
              <div>
                <h2 className="price-card-title">Precio general</h2>
                <p className="price-card-sub">Catálogo · {totalProducts} productos</p>
              </div>
            </header>
            <div className="price-card-label">
              <Store size={13} /> {generalBranches.length} {generalBranches.length === 1 ? "sucursal" : "sucursales"}
            </div>
            <BranchChips branches={generalBranches} empty="Ninguna: todas cobran con una ciudad" />
            <footer className="price-card-actions">
              {canAssign ? (
                <Button size="small" variant="outlined" onClick={() => setAssignTarget({ list: null })}>
                  Sucursales
                </Button>
              ) : null}
              <Button size="small" href="/dashboard/products">
                Editar en Catálogo
              </Button>
            </footer>
          </section>

          {lists.map((list) => {
            const branches = branchesOf(list.id);
            const count = list.itemsCount ?? 0;
            return (
              <section key={list.id} className="price-card">
                <header className="price-card-head">
                  <span className="price-card-icon">
                    <Tags size={18} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 className="price-card-title">{list.name}</h2>
                    <p className="price-card-sub">
                      {count} de {totalProducts} con precio propio
                    </p>
                  </div>
                  {canManage ? (
                    <IconButton size="small" aria-label={`Más opciones de ${list.name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, list })}>
                      <MoreVertical size={16} />
                    </IconButton>
                  ) : null}
                </header>
                <div className="price-card-bar" aria-hidden>
                  <span style={{ width: `${totalProducts ? Math.round((count / totalProducts) * 100) : 0}%` }} />
                </div>
                <div className="price-card-label">
                  <Store size={13} /> {branches.length} {branches.length === 1 ? "sucursal" : "sucursales"}
                </div>
                <BranchChips branches={branches} empty="Ninguna sucursal cobra con esta lista" />
                <footer className="price-card-actions">
                  {canAssign ? (
                    <Button size="small" variant="outlined" onClick={() => setAssignTarget({ list })}>
                      Sucursales
                    </Button>
                  ) : null}
                  {canManage ? (
                    <Button size="small" startIcon={<FileSpreadsheet size={14} />} onClick={() => setImportList(list)}>
                      Importar Excel
                    </Button>
                  ) : null}
                </footer>
              </section>
            );
          })}

          {canManage ? (
            <button type="button" className="price-card is-new" onClick={() => setNameDialog({ mode: "create", name: "" })}>
              <Plus size={20} />
              <span>Nueva lista de ciudad</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {data ? (
        <>
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
              label="Mostrar"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as RowFilter);
                setPage(1);
              }}
              InputLabelProps={{ shrink: true }}
              SelectProps={{ displayEmpty: true }}
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="">Todo el catálogo</MenuItem>
              <MenuItem value="different">Con precio distinto al general</MenuItem>
              <MenuItem value="missing">Sin precio en alguna ciudad</MenuItem>
            </TextField>
            <FilterMeta>
              <strong>{rows.length}</strong> productos
            </FilterMeta>
          </FilterBar>

          <div className="table-container-premium price-compare-wrap">
            <table className="table price-compare-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="price-col">General</th>
                  {lists.map((list) => (
                    <th key={list.id} className="price-col">
                      {list.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.productId}>
                    <td>
                      <strong>{row.name}</strong>
                      <div className="page-kicker" style={{ margin: 0 }}>
                        {[row.sku ? `Código ${row.sku}` : null, row.categoryName].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="price-col">
                      <div className="price-cell">
                        <span className="price-main">{formatMoney(row.basePrice)}</span>
                        <span className="price-sub">May. {row.baseWholesalePrice ? formatMoney(row.baseWholesalePrice) : "—"}</span>
                      </div>
                    </td>
                    {lists.map((list) => {
                      const own = row.prices[list.id];
                      const isEditing = editing?.productId === row.productId && editing.listId === list.id;
                      if (isEditing && editing) {
                        return (
                          <td key={list.id} className="price-col is-editing">
                            <div className="price-edit">
                              <TextField
                                size="small"
                                autoFocus
                                label="Venta"
                                value={editing.price}
                                onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void saveEdit(row);
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                inputProps={{ inputMode: "decimal" }}
                              />
                              <TextField
                                size="small"
                                label="Mayoreo"
                                value={editing.wholesalePrice}
                                onChange={(e) => setEditing({ ...editing, wholesalePrice: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void saveEdit(row);
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                inputProps={{ inputMode: "decimal" }}
                              />
                              <div className="price-edit-actions">
                                <Tooltip title="Guardar (Enter)">
                                  <span>
                                    <IconButton size="small" color="primary" disabled={saving} onClick={() => void saveEdit(row)}>
                                      <Check size={16} />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                {own ? (
                                  <Tooltip title="Usar el precio general">
                                    <span>
                                      <IconButton size="small" disabled={saving} onClick={() => void useGeneral(row, list)}>
                                        <RotateCcw size={15} />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                ) : null}
                                <Tooltip title="Cancelar (Esc)">
                                  <IconButton size="small" disabled={saving} onClick={() => setEditing(null)}>
                                    <X size={16} />
                                  </IconButton>
                                </Tooltip>
                              </div>
                            </div>
                          </td>
                        );
                      }
                      const delta = own ? deltaLabel(row.basePrice, own.price) : null;
                      const content = own ? (
                        <div className="price-cell">
                          <span className="price-main">
                            {formatMoney(own.price)}
                            {delta ? (
                              <span className={`price-delta ${own.price > row.basePrice ? "is-up" : "is-down"}`}>{delta}</span>
                            ) : null}
                          </span>
                          <span className="price-sub">
                            May. {own.wholesalePrice ? formatMoney(own.wholesalePrice) : row.baseWholesalePrice ? formatMoney(row.baseWholesalePrice) : "—"}
                          </span>
                        </div>
                      ) : (
                        <div className="price-cell is-general">
                          <span className="price-main">{formatMoney(row.basePrice)}</span>
                          <span className="price-sub">Precio general</span>
                        </div>
                      );
                      return (
                        <td key={list.id} className="price-col">
                          {canManage ? (
                            <button
                              type="button"
                              className="price-cell-button"
                              onClick={() => startEdit(row, list)}
                              aria-label={`Editar precio de ${row.name} en ${list.name}`}
                            >
                              {content}
                              <Pencil size={13} className="price-cell-pencil" />
                            </button>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!pageRows.length ? (
                  <tr>
                    <td colSpan={2 + lists.length} className="page-kicker">
                      Ningún producto coincide.
                    </td>
                  </tr>
                ) : null}
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

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            if (menu) setNameDialog({ mode: "rename", list: menu.list, name: menu.list.name });
            setMenu(null);
          }}
        >
          <Pencil size={14} style={{ marginRight: 8 }} /> Renombrar
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setConfirmDelete(menu.list);
            setMenu(null);
          }}
          sx={{ color: "error.main" }}
        >
          <Trash2 size={14} style={{ marginRight: 8 }} /> Borrar lista
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(nameDialog)} onClose={() => setNameDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{nameDialog?.mode === "create" ? "Nueva lista de ciudad" : "Renombrar lista"}</DialogTitle>
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

      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>¿Borrar la lista {confirmDelete?.name}?</DialogTitle>
        <DialogContent>
          <p className="page-kicker">
            Se borran sus {confirmDelete?.itemsCount ?? 0} precios. Solo se puede si ninguna sucursal la
            usa: muévelas antes desde Sucursales.
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={() => confirmDelete && void removeList(confirmDelete)}>
            Borrar
          </Button>
        </DialogActions>
      </Dialog>

      {importList ? (
        <PriceListImportDialog
          open
          list={importList}
          catalog={catalogFor(importList)}
          onClose={() => setImportList(null)}
          onSaved={async () => {
            setImportList(null);
            await load();
          }}
        />
      ) : null}

      {data && assignTarget ? (
        <PriceListBranchesDialog
          open
          target={assignTarget.list}
          lists={lists}
          branches={data.branches}
          onClose={() => setAssignTarget(null)}
          onSaved={async () => {
            setAssignTarget(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
