"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { AlertTriangle, Boxes, ClipboardList, Download, MinusCircle, Wallet } from "lucide-react";
import { countedQuantity, type FactoryForm, type FactoryFormRow } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatMoney, formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { exportFactoryFormPdf, factoryFormFileName, INVENTORY_FORM_OPTIONS } from "@/lib/export-factory-form";
import type { InventoryMovement, ListResponse } from "@/types";
import { toast } from "sonner";
import { FilterBar, FilterMeta, FilterSearch } from "../FilterBar";
import { formatDateTime, unitLabel } from "../pos-labels";
import { BranchStockSheet } from "../BranchMinStockFormPage";
import { StatTile } from "../StatTile";
import { cleanInput } from "@/components/supervisor/count-fields";
import type { InventoryOverview } from "../BranchesInventoryMatrix";
import {
  PAGE_HINTS,
  allRows,
  isLinked,
  packDescription,
  round2,
  rowKey,
  sheetPages,
  targetKey,
  unitOf,
  type SheetPage,
} from "../FactoryFormSheet";

type View = "inventario" | "stock";

const MOVEMENT_LABELS: Record<string, string> = {
  sale: "Venta",
  sale_void: "Anulación",
  factory_return: "Devolución a fábrica",
  customer_return: "Devolución de cliente",
  restock_in: "Surtido recibido",
  adjustment: "Ajuste",
  initial: "Carga inicial",
  count_adjustment: "Conteo",
};

/** Existencia y stock de una línea o producto (litros o piezas), con su nombre en el catálogo. */
interface TargetStock {
  name: string;
  stock: number;
  minStock: number;
  /** Costo de compra por litro o pieza; null sin costo capturado o sin permiso de ver costos. */
  unitCost: number | null;
}

/** Lo que el diálogo de un renglón necesita para ver el kardex, ajustar y cambiar el stock. */
interface Target {
  kind: "line" | "product";
  id: string;
  name: string;
  label: string;
  unit: string;
  packSize: number;
  /** "bidón", "garrafa", "caja", "pieza": cómo se cuenta en la tienda. */
  packLabel: string;
  stock: number;
  minStock: number;
  unitCost: number | null;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Inventario y stock de la sucursal, los dos como la hoja de pedido a fábrica:
 * las mismas 4 hojas, en el mismo orden de renglones que el papel con el que
 * trabaja la sucursal.
 *
 * - **Inventario**: la existencia de cada renglón (de consulta). Clic en un
 *   renglón = su kardex, ajustar existencia o cambiar su stock.
 * - **Stock**: lo que la sucursal debe tener siempre, capturable de corrido
 *   (la misma hoja de `/minimos`).
 *
 * La vista va en la URL (`?hoja=stock`) para poder enlazarla.
 */
export function BranchInventoryTab({
  branchId,
  initialBelowMin = false,
}: {
  branchId: string;
  /** Abre ya filtrada a lo que está bajo su stock (el link de la señal de salud). */
  initialBelowMin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canView = can("posInventory", "view");
  const view: View = searchParams.get("hoja") === "stock" ? "stock" : "inventario";
  const stockDirty = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    stockDirty.current = dirty;
  }, []);

  function selectView(next: View | null) {
    if (!next || next === view) return;
    if (
      stockDirty.current &&
      !window.confirm("Tienes cambios de stock sin guardar. ¿Salir de la hoja de stock y perderlos?")
    ) {
      return;
    }
    stockDirty.current = false;
    const query = new URLSearchParams(searchParams.toString());
    query.delete("bajo");
    if (next === "inventario") query.delete("hoja");
    else query.set("hoja", next);
    router.replace(`${pathname}?${query.toString()}`);
  }

  if (!canView) {
    return (
      <div className="panel p-5" style={{ color: "var(--muted)" }}>
        El inventario necesita el permiso de Inventario del punto de venta.
      </div>
    );
  }

  return (
    <div className="page-stack">
      <ToggleButtonGroup
        exclusive
        value={view}
        onChange={(_e, next: View | null) => selectView(next)}
        size="small"
        color="primary"
        className="inv-view-toggle"
        aria-label="Vista del inventario"
      >
        <ToggleButton value="inventario">
          <Boxes size={16} /> Inventario
        </ToggleButton>
        <ToggleButton value="stock">
          <ClipboardList size={16} /> Stock
        </ToggleButton>
      </ToggleButtonGroup>

      {view === "inventario" ? (
        <BranchInventorySheet branchId={branchId} initialBelowMin={initialBelowMin} />
      ) : (
        <BranchStockSheet branchId={branchId} embedded onDirtyChange={onDirtyChange} />
      )}
    </div>
  );
}

/** Renglón de la hoja de inventario con lo que se pinta en él. */
interface InvRow {
  row: FactoryFormRow;
  key: string;
  target: string | null;
  /** Primer renglón de su línea/producto: es el que lleva la existencia. */
  first: boolean;
  firstLabel: string;
  info: TargetStock | null;
}

function BranchInventorySheet({ branchId, initialBelowMin }: { branchId: string; initialBelowMin: boolean }) {
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const canEdit = can("posInventory", "update");
  const withCost = can("productCosts", "view");

  const [form, setForm] = useState<FactoryForm | null>(null);
  const [stocks, setStocks] = useState<Map<string, TargetStock>>(new Map());
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"" | "low" | "negative">(initialBelowMin ? "low" : "");
  const [selected, setSelected] = useState<Target | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sheet, inventory] = await Promise.all([
        httpClient.get<FactoryForm>(`/pos/branches/${branchId}/min-stock-form`),
        httpClient.get<InventoryOverview>("/pos/inventory", { branchIds: branchId }),
      ]);
      const map = new Map<string, TargetStock>();
      for (const line of inventory.lines) {
        const cell = line.byBranch[branchId];
        map.set(`line:${line.lineId}`, {
          name: line.name,
          stock: cell?.stock ?? 0,
          minStock: cell?.minStock ?? 0,
          unitCost: line.unitCost ?? null,
        });
      }
      for (const product of inventory.products) {
        const cell = product.byBranch[branchId];
        map.set(`product:${product.productId}`, {
          name: product.name,
          stock: cell?.stock ?? 0,
          minStock: cell?.minStock ?? 0,
          unitCost: product.unitCost ?? null,
        });
      }
      setForm(sheet);
      setOverview(inventory);
      setStocks(map);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar el inventario"));
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe((event) => {
      if (
        (event.type === "pos_sales_changed" || event.type === "restock_orders_changed") &&
        event.branchId === branchId
      ) {
        void load();
      }
    });
  }, [subscribe, branchId, load]);

  const query = normalize(search.trim());

  /**
   * Las hojas del formato más "Otros": lo que no está en el formato pero tiene
   * stock o existencia en esta sucursal y, al buscar, cualquier línea o
   * producto del catálogo que coincida (para poder fijarle su stock).
   */
  const pages = useMemo<SheetPage[]>(() => {
    if (!form) return [];
    const covered = new Set(allRows(form).filter(isLinked).map(targetKey));
    const extras: FactoryFormRow[] = [...form.extras];
    const extraRow = (
      kind: "line" | "product",
      id: string,
      name: string,
      packSize: number,
      packLabel: string
    ): FactoryFormRow => ({
      page: 0,
      block: 0,
      row: 0,
      kind: "product",
      label: name.toUpperCase(),
      packSize,
      packLabel,
      lineId: kind === "line" ? id : null,
      productId: kind === "product" ? id : null,
      qty: null,
      unitCost: null,
      amount: null,
      minStock: stocks.get(`${kind}:${id}`)?.minStock ?? 0,
    });
    const wanted = (key: string, name: string) => {
      if (covered.has(key)) return false;
      const info = stocks.get(key);
      return (info && (info.stock !== 0 || info.minStock !== 0)) || (query && normalize(name).includes(query));
    };
    for (const line of overview?.lines ?? []) {
      const key = `line:${line.lineId}`;
      if (!wanted(key, line.name)) continue;
      covered.add(key);
      extras.push(extraRow("line", line.lineId, line.name, line.litersPerBidon || 20, line.litersPerBidon >= 20 ? "bidón" : "garrafa"));
    }
    for (const product of overview?.products ?? []) {
      const key = `product:${product.productId}`;
      if (!wanted(key, `${product.name} ${product.sku ?? ""}`)) continue;
      covered.add(key);
      extras.push(extraRow("product", product.productId, product.name, 1, "pieza"));
    }
    extras.sort((a, b) => a.label.localeCompare(b.label, "es"));
    extras.forEach((row, index) => {
      row.row = index;
    });
    return sheetPages({ ...form, extras });
  }, [form, overview, stocks, query]);

  /** Cada renglón con su existencia; los renglones que reparten un producto la muestran solo en el primero. */
  const rowsByPage = useMemo(() => {
    const firstOf = new Map<string, FactoryFormRow>();
    const result = new Map<number, InvRow[][]>();
    for (const p of pages) {
      result.set(
        p.page,
        p.blocks.map((block) =>
          block.map((row) => {
            const target = isLinked(row) ? targetKey(row) : null;
            let first = false;
            if (target && !firstOf.has(target)) {
              firstOf.set(target, row);
              first = true;
            }
            return {
              row,
              key: rowKey(row),
              target,
              first,
              firstLabel: target ? (firstOf.get(target)?.label ?? row.label) : row.label,
              info: target ? (stocks.get(target) ?? null) : null,
            };
          })
        )
      );
    }
    return result;
  }, [pages, stocks]);

  const isLow = (info: TargetStock | null) => Boolean(info && info.minStock > 0 && info.stock < info.minStock);
  const isNegative = (info: TargetStock | null) => Boolean(info && info.stock < 0);

  const filtering = Boolean(query) || filter !== "";
  const matches = useCallback(
    (item: InvRow) => {
      if (!item.target) return false;
      if (filter === "low" && !(item.first && isLow(item.info))) return false;
      if (filter === "negative" && !(item.first && isNegative(item.info))) return false;
      if (query) {
        const text = normalize(`${item.row.label} ${item.info?.name ?? ""}`);
        if (!text.includes(query)) return false;
      }
      return true;
    },
    [filter, query]
  );

  /**
   * Lo que vale la sucursal a costo de compra, igual que la pantalla Inventario:
   * la existencia (lo negativo vale 0), su Stock y lo que falta para completarlo.
   * Toda la sucursal, no solo lo que se ve con los filtros.
   */
  const money = useMemo(() => {
    if (!withCost) return null;
    let existence = 0;
    let stock = 0;
    let missing = 0;
    let withoutCost = 0;
    for (const info of stocks.values()) {
      if (!info.stock && !info.minStock) continue;
      if (info.unitCost == null) {
        withoutCost += 1;
        continue;
      }
      existence += Math.max(0, info.stock) * info.unitCost;
      stock += info.minStock * info.unitCost;
      missing += Math.max(0, info.minStock - info.stock) * info.unitCost;
    }
    return { existence: round2(existence), stock: round2(stock), missing: round2(missing), withoutCost };
  }, [stocks, withCost]);

  const counts = useMemo(() => {
    const seen = new Set<string>();
    let low = 0;
    let negative = 0;
    for (const blocks of rowsByPage.values()) {
      for (const item of blocks.flat()) {
        if (!item.target || seen.has(item.target)) continue;
        seen.add(item.target);
        if (isLow(item.info)) low += 1;
        if (isNegative(item.info)) negative += 1;
      }
    }
    return { low, negative, items: seen.size };
  }, [rowsByPage]);

  const matchCount = useCallback(
    (pageNumber: number) => (rowsByPage.get(pageNumber) ?? []).flat().filter(matches).length,
    [rowsByPage, matches]
  );

  // Al buscar o filtrar, saltar a la primera hoja que tenga algo.
  useEffect(() => {
    if (!filtering || !pages.length) return;
    if (matchCount(page) > 0) return;
    const firstWith = pages.find((p) => matchCount(p.page) > 0);
    if (firstWith) setPage(firstWith.page);
    // Solo cuando cambia el filtro, no al cambiar de hoja a mano.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter, pages.length]);

  const current = pages.find((p) => p.page === page) ?? pages[0];
  const blocks = current ? (rowsByPage.get(current.page) ?? []) : [];

  function open(item: InvRow) {
    const row = item.row;
    if (!item.target) return;
    const [kind, id] = item.target.split(":") as ["line" | "product", string];
    setSelected({
      kind,
      id,
      name: item.info?.name ?? row.label,
      label: item.firstLabel,
      unit: unitOf(row),
      packSize: Math.max(1, row.packSize),
      packLabel: row.packLabel || (row.lineId ? "bidón" : "pieza"),
      stock: item.info?.stock ?? 0,
      minStock: item.info?.minStock ?? 0,
      unitCost: item.info?.unitCost ?? null,
    });
  }

  /** PDF de la hoja con la existencia en empaques (como el papel), para contar o revisar. */
  async function exportPdf() {
    if (!form) return;
    setExporting(true);
    try {
      const seen = new Set<string>();
      const withStock = (row: FactoryFormRow): FactoryFormRow => {
        if (!isLinked(row)) return row;
        const target = targetKey(row);
        const info = stocks.get(target);
        const firstTime = !seen.has(target);
        seen.add(target);
        const packs = firstTime && info && info.stock !== 0 ? round2(info.stock / Math.max(1, row.packSize)) : null;
        return { ...row, qty: packs, amount: null, unitCost: null };
      };
      await exportFactoryFormPdf(
        {
          ...form,
          pages: form.pages.map((p) => ({ ...p, total: 0, blocks: p.blocks.map((block) => block.map(withStock)) })),
          extras: (pages.find((p) => p.page === 0)?.blocks[0] ?? []).map(withStock),
        },
        INVENTORY_FORM_OPTIONS,
        factoryFormFileName(form).replace(/^stock-sucursal/, "inventario-sucursal")
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo generar el PDF"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page-stack msf-page">
      <div className="toolbar">
        <p className="page-kicker" style={{ margin: 0, maxWidth: 560 }}>
          La existencia de hoy en el orden de la hoja de pedido, en empaques como en el papel (junto a cada
          empaque, su equivalencia en litros o piezas). Da clic en un renglón para ver su kardex o ajustarlo.
        </p>
        <Button
          variant="outlined"
          startIcon={<Download size={16} />}
          onClick={() => void exportPdf()}
          disabled={!form || exporting}
        >
          {exporting ? "Generando…" : "Descargar PDF"}
        </Button>
      </div>

      {money ? (
        <div className="stat-tiles cols-3">
          <StatTile
            icon={Wallet}
            label="Existencia a costo"
            value={formatMoney(money.existence)}
            hint={
              money.withoutCost
                ? `Sin contar ${money.withoutCost} producto${money.withoutCost === 1 ? "" : "s"} sin costo capturado`
                : "Lo que hay hoy en la sucursal"
            }
          />
          <StatTile icon={ClipboardList} label="Stock a costo" value={formatMoney(money.stock)} hint="Lo que la sucursal debe tener siempre" />
          <StatTile
            icon={AlertTriangle}
            label="Para completar el stock"
            value={formatMoney(money.missing)}
            hint="Lo que falta, a costo"
            tone={money.missing > 0 ? "warning" : undefined}
          />
        </div>
      ) : null}

      <FilterBar>
        <FilterSearch value={search} onChange={setSearch} placeholder="Buscar en la hoja o en el catálogo" />
        <Button
          variant={filter === "low" ? "contained" : "outlined"}
          color={filter === "low" ? "warning" : "inherit"}
          startIcon={<AlertTriangle size={15} />}
          onClick={() => setFilter((value) => (value === "low" ? "" : "low"))}
          sx={{ whiteSpace: "nowrap", height: 40 }}
        >
          Bajo su stock ({counts.low})
        </Button>
        <Button
          variant={filter === "negative" ? "contained" : "outlined"}
          color={filter === "negative" ? "error" : "inherit"}
          startIcon={<MinusCircle size={15} />}
          onClick={() => setFilter((value) => (value === "negative" ? "" : "negative"))}
          sx={{ whiteSpace: "nowrap", height: 40 }}
        >
          En negativo ({counts.negative})
        </Button>
        <FilterMeta>
          <strong>{counts.items}</strong> renglones
        </FilterMeta>
      </FilterBar>

      {loading && !form ? <p className="page-kicker">Cargando inventario...</p> : null}

      {pages.length ? (
        <Tabs
          value={current?.page ?? 1}
          onChange={(_e, value) => setPage(value as number)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {pages.map((p) => (
            <Tab
              key={p.page}
              value={p.page}
              label={
                <span className="msf-tab">
                  <strong>
                    {p.page === 0 ? "Otros" : `Hoja ${p.page}`}
                    {filtering ? ` · ${matchCount(p.page)}` : ""}
                  </strong>
                  <span>{PAGE_HINTS[p.page] ?? ""}</span>
                </span>
              }
            />
          ))}
        </Tabs>
      ) : null}

      {current ? (
        <div className="msf-sheet msf-sheet--inv" key={current.page}>
          {filtering && !blocks.flat().some(matches) ? (
            <p className="page-kicker" style={{ margin: 0 }}>
              Nada en esta hoja con estos filtros.
            </p>
          ) : null}
          {blocks.map((block, blockIndex) => {
            const visible = filtering ? block.filter(matches) : block;
            if (!visible.length) return null;
            return (
              <div className="msf-block" key={blockIndex}>
                <div className="msf-head">
                  <span>Producto</span>
                  <span>Empaque</span>
                  <span>Exist.</span>
                  <span>Stock</span>
                </div>
                {visible.map((item) => {
                  const { row } = item;
                  if (row.kind === "blank") return null;
                  if (row.kind === "section") {
                    return (
                      <div className="msf-section" key={item.key}>
                        {row.label}
                      </div>
                    );
                  }
                  if (!item.target) {
                    return (
                      <div className="msf-row msf-row--unlinked" key={item.key} title="Sin ligar al catálogo">
                        <span className="msf-label">{row.label}</span>
                        <span className="msf-pack">sin ligar</span>
                        <span />
                        <span />
                      </div>
                    );
                  }
                  const packSize = Math.max(1, row.packSize);
                  const info = item.info;
                  const stock = info?.stock ?? 0;
                  const low = item.first && isLow(info);
                  const negative = item.first && isNegative(info);
                  const minPacks = (row.minStock ?? 0) > 0 ? round2((row.minStock ?? 0) / packSize) : 0;
                  return (
                    <button
                      type="button"
                      className={`msf-row msf-row--btn${negative ? " msf-row--neg" : low ? " msf-row--low" : ""}`}
                      key={item.key}
                      onClick={() => open(item)}
                      title={item.first ? `Ver kardex de ${info?.name ?? row.label}` : `Se cuenta junto con «${item.firstLabel}»`}
                    >
                      <span className="msf-label">{row.label}</span>
                      <span className="msf-pack">
                        {packDescription(row)}
                        {item.first && packSize > 1 && stock !== 0 ? (
                          <em>
                            = {formatQuantity(stock)} {unitOf(row)}
                          </em>
                        ) : null}
                        {!item.first ? <em className="msf-pack--muted">junto con «{item.firstLabel}»</em> : null}
                      </span>
                      <span className={`msf-num msf-num--stock${item.first && stock === 0 ? " msf-num--zero" : ""}`}>
                        {!item.first ? "↑" : stock !== 0 ? formatQuantity(round2(stock / packSize)) : "0"}
                      </span>
                      <span className="msf-num msf-num--min">{minPacks ? formatQuantity(minPacks) : ""}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}

      <InventoryRowDialog
        branchId={branchId}
        target={selected}
        canEdit={canEdit}
        onClose={() => setSelected(null)}
        onSaved={async (next) => {
          await load();
          setSelected(next);
        }}
      />
    </div>
  );
}

/**
 * Detalle de un renglón: existencia, stock y faltante, su kardex, y (con
 * permiso) ajustar la existencia o cambiar el stock. Ambos en litros o piezas.
 */
function InventoryRowDialog({
  branchId,
  target,
  canEdit,
  onClose,
  onSaved,
}: {
  branchId: string;
  target: Target | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (next: Target | null) => Promise<void>;
}) {
  const [movements, setMovements] = useState<InventoryMovement[] | null>(null);
  const [mode, setMode] = useState<"" | "adjust" | "min">("");
  // Como el conteo del supervisor: envases llenos + lo suelto (litros del abierto o piezas sueltas).
  const [packsInput, setPacksInput] = useState("");
  const [looseInput, setLooseInput] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const targetId = target?.id;
  const targetKind = target?.kind;
  useEffect(() => {
    setMode("");
    setMovements(null);
    if (!targetId || !targetKind) return;
    let cancelled = false;
    httpClient
      .get<ListResponse<InventoryMovement>>(`/pos/branches/${branchId}/movements`, {
        ...(targetKind === "line" ? { lineId: targetId } : { productId: targetId }),
        limit: 50,
      })
      .then((result) => {
        if (!cancelled) setMovements(result.items);
      })
      .catch((error) => {
        if (!cancelled) toast.error(getApiErrorMessage(error, "No se pudo cargar el kardex"));
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, targetId, targetKind, target?.stock, target?.minStock]);

  if (!target) return null;
  const shortage = Math.max(0, round2(target.minStock - target.stock));
  const isLiquid = target.kind === "line";
  const hasPacks = target.packSize > 1;
  const looseUnit = isLiquid ? "L" : "pz";
  /** "2 bidones + 7 L", "1 caja + 3 pz": como se ve en el anaquel. */
  const breakdown = (base: number) => {
    // Menos de un envase: el desglose solo repetiría la cifra de arriba.
    if (!hasPacks || base < target.packSize) return "";
    const full = Math.floor(base / target.packSize + 1e-9);
    const rest = round2(base - full * target.packSize);
    const parts = [];
    if (full) parts.push(`${formatQuantity(full)} ${unitLabel(full, isLiquid ? "bidon" : "paquete", target.packLabel)}`);
    if (rest || !full) parts.push(`${formatQuantity(rest)} ${looseUnit}`);
    return parts.join(" + ");
  };
  /** Importe a costo de compra de una cantidad en litros o piezas (sin permiso de costos, nada). */
  const value = (base: number) =>
    target.unitCost != null ? <b className="inv-detail-money">{formatMoney(round2(base * target.unitCost))}</b> : null;
  const packOne = unitLabel(1, isLiquid ? "bidon" : "paquete", target.packLabel);
  const packName = unitLabel(2, isLiquid ? "bidon" : "paquete", target.packLabel);
  const packsField = `${packName.charAt(0).toUpperCase()}${packName.slice(1)}${
    isLiquid ? (packName.endsWith("as") ? " llenas" : " llenos") : ""
  }`;
  const looseField = hasPacks ? (isLiquid ? "Litros del abierto" : "Piezas sueltas") : isLiquid ? "Litros" : "Piezas";
  const typed = Boolean(packsInput.trim() || looseInput.trim());
  const total = countedQuantity({
    packs: hasPacks ? Number(packsInput) || 0 : 0,
    packSize: target.packSize,
    loose: Number(looseInput) || 0,
  });

  function start(next: "adjust" | "min") {
    if (!target) return;
    setMode(next);
    const base = Math.max(0, next === "adjust" ? target.stock : target.minStock);
    const full = hasPacks ? Math.floor(base / target.packSize + 1e-9) : 0;
    setPacksInput(hasPacks && full ? String(full) : "");
    const rest = round2(base - full * target.packSize);
    setLooseInput(rest ? String(rest) : "");
    setReason("");
  }

  async function save() {
    if (!target) return;
    const number = total;
    if (mode === "adjust" && !typed) {
      toast.error("Escribe la existencia contada");
      return;
    }
    if (mode === "adjust" && !reason.trim()) {
      toast.error("Escribe el motivo del ajuste");
      return;
    }
    setSaving(true);
    try {
      await httpClient.put(`/pos/branches/${branchId}/inventory`, {
        ...(target.kind === "line" ? { lineId: target.id } : { productId: target.id }),
        ...(mode === "adjust" ? { stock: number, reason: reason.trim() } : { minStock: number, reason: "Stock de la sucursal actualizado" }),
      });
      toast.success(mode === "adjust" ? "Existencia ajustada" : `Stock de ${target.name} guardado`);
      await onSaved(
        mode === "adjust" ? { ...target, stock: number } : { ...target, minStock: number }
      );
      setMode("");
    } catch (error) {
      toast.error(getApiErrorMessage(error, mode === "adjust" ? "No se pudo ajustar la existencia" : "No se pudo guardar el stock"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {target.name}
        {normalize(target.label) !== normalize(target.name) ? (
          <span className="page-kicker" style={{ display: "block", margin: 0 }}>
            En la hoja: {target.label}
          </span>
        ) : null}
      </DialogTitle>
      <DialogContent dividers className="page-stack" sx={{ gap: 2 }}>
        <div className="inv-detail-stats">
          <div>
            <span>Existencia</span>
            <strong style={{ color: target.stock < 0 ? "#dc2626" : undefined }}>
              {formatQuantity(target.stock)} {target.unit}
            </strong>
            <em>{breakdown(target.stock)}</em>
            {value(Math.max(0, target.stock))}
          </div>
          <div>
            <span>Stock</span>
            <strong>{target.minStock ? `${formatQuantity(target.minStock)} ${target.unit}` : "Sin stock definido"}</strong>
            <em>{target.minStock ? breakdown(target.minStock) : ""}</em>
            {target.minStock ? value(target.minStock) : null}
          </div>
          <div>
            <span>Faltante</span>
            <strong style={{ color: shortage > 0 ? "#c2410c" : undefined }}>
              {shortage > 0 ? `${formatQuantity(shortage)} ${target.unit}` : "—"}
            </strong>
            <em>{shortage > 0 ? breakdown(shortage) : ""}</em>
            {shortage > 0 ? value(shortage) : null}
          </div>
        </div>

        {mode ? (
          <form
            className="inv-detail-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {hasPacks ? (
              <TextField
                label={packsField}
                size="small"
                autoFocus
                value={packsInput}
                placeholder="0"
                onChange={(event) => setPacksInput(cleanInput(event.target.value, false))}
                onFocus={(event) => event.currentTarget.select()}
                inputProps={{ inputMode: "numeric" }}
                helperText={`${packOne.charAt(0).toUpperCase()}${packOne.slice(1)} de ${formatQuantity(target.packSize)} ${looseUnit}`}
                sx={{ width: 150 }}
              />
            ) : null}
            <TextField
              label={looseField}
              size="small"
              autoFocus={!hasPacks}
              value={looseInput}
              placeholder="0"
              onChange={(event) => setLooseInput(cleanInput(event.target.value, isLiquid))}
              onFocus={(event) => event.currentTarget.select()}
              inputProps={{ inputMode: isLiquid ? "decimal" : "numeric" }}
              helperText={
                <>
                  {mode === "adjust" ? "Existencia" : "Stock"} = <strong>{formatQuantity(total)} {looseUnit}</strong>
                </>
              }
              sx={{ width: 170 }}
            />
            {mode === "adjust" ? (
              <TextField
                label="Motivo"
                size="small"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Conteo físico, merma, corrección de captura…"
                helperText="Se registra en el kardex la diferencia contra lo que había."
                sx={{ flex: 1, minWidth: 220 }}
              />
            ) : null}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Button onClick={() => setMode("")} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" variant="contained" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        ) : null}

        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Kardex</h3>
          <div className="table-container-premium">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th style={{ textAlign: "right" }}>Cantidad</th>
                  <th style={{ textAlign: "right" }}>Saldo</th>
                  <th>Usuario</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {(movements ?? []).map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatDateTime(movement.createdAt)}</td>
                    <td>{MOVEMENT_LABELS[movement.type] ?? movement.type}</td>
                    <td
                      style={{
                        textAlign: "right",
                        color: Number(movement.quantity) < 0 ? "#c62828" : "#15803d",
                        fontWeight: 700,
                      }}
                    >
                      {Number(movement.quantity) > 0 ? "+" : ""}
                      {formatQuantity(movement.quantity)}
                    </td>
                    <td style={{ textAlign: "right" }}>{formatQuantity(movement.balanceAfter)}</td>
                    <td>{movement.user?.name ?? "—"}</td>
                    <td>{movement.notes ?? "—"}</td>
                  </tr>
                ))}
                {movements && !movements.length ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
                      Sin movimientos todavía.
                    </td>
                  </tr>
                ) : null}
                {!movements ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
                      Cargando kardex…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
        {canEdit && !mode ? (
          <>
            <Button variant="outlined" onClick={() => start("min")}>
              Cambiar stock
            </Button>
            <Button variant="outlined" onClick={() => start("adjust")}>
              Ajustar existencia
            </Button>
          </>
        ) : null}
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
