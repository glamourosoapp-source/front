"use client";

import { type CSSProperties, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Boxes,
  Check,
  CircleCheck,
  ClipboardCheck,
  Droplets,
  EyeOff,
  FlaskConical,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { INVENTORY_COUNT_ITEM_STATUS, INVENTORY_COUNT_STATUS } from "@glamouroso/shared/constants";
import { countedQuantity, type InventoryCount, type InventoryCountItem } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatDateTime, unitLabel } from "@/components/pos-admin/pos-labels";
import { formatQuantity } from "@/lib/format-money";
import { usePermissions } from "@/lib/permissions";
import {
  accuracyPercent,
  COUNT_GROUPS,
  countGroupOf,
  finalCountedQty,
  formatCountQty,
  formatVariance,
  inputValue,
  isCountItemDone,
  parseCountInput,
  pendingRecount,
  type CountGroupKey,
} from "./supervisor-counts";
import { CountDialog } from "./CountDialog";

const GROUP_ICONS: Record<CountGroupKey, LucideIcon> = {
  liquids: Droplets,
  packs: Package,
  pieces: Boxes,
  containers: FlaskConical,
};

/** Atajos del motivo de cancelación (se pueden editar después de tocarlos). */
const CANCEL_REASONS = ["Estaba llegando surtido", "Mucha gente en la tienda", "Lo inicié por error"];

function byName(a: InventoryCountItem, b: InventoryCountItem): number {
  return a.name.localeCompare(b.name);
}

/** Diferencia en unidades redondeada a centésimos (0 si no hay). */
function roundedVariance(item: InventoryCountItem): number {
  return Math.round(Number(item.varianceQty ?? 0) * 100) / 100;
}

/** Lo que se lleva escrito en un renglón, antes de guardarlo. */
interface Draft {
  packs: string;
  loose: string;
}

type ListFilter = "all" | "todo" | "recount";

interface FieldSpec {
  key: keyof Draft;
  label: string;
  step: number;
  decimal: boolean;
}

/**
 * Los campos de cada renglón, según cómo se cuenta en la tienda:
 * líquidos = envases llenos + litros del abierto (de ½ en ½); cajas = cajas
 * + piezas sueltas; piezas = piezas.
 */
function fieldsFor(item: InventoryCountItem): FieldSpec[] {
  const packSize = Number(item.packSize) || 1;
  const group = countGroupOf(item);
  if (group === "liquids") {
    if (packSize <= 1) return [{ key: "loose", label: "Litros", step: 0.5, decimal: true }];
    const pack = unitLabel(2, "bidon", item.packLabel || "bidón");
    return [
      // "Bidones llenos", "Garrafas llenas".
      { key: "packs", label: `${pack.charAt(0).toUpperCase()}${pack.slice(1)} ${pack.endsWith("as") ? "llenas" : "llenos"}`, step: 1, decimal: false },
      { key: "loose", label: "Litros del abierto", step: 0.5, decimal: true },
    ];
  }
  if (group === "packs") {
    const pack = unitLabel(2, "paquete", item.packLabel || "caja");
    return [
      { key: "packs", label: `${pack.charAt(0).toUpperCase()}${pack.slice(1)}`, step: 1, decimal: false },
      { key: "loose", label: "Piezas sueltas", step: 1, decimal: false },
    ];
  }
  return [{ key: "loose", label: "Piezas", step: 1, decimal: false }];
}

/** "Bidón de 20 L", "Caja de 12 pz", "Pieza". */
function packDescription(item: InventoryCountItem): string {
  const packSize = Number(item.packSize) || 1;
  const label = item.packLabel?.trim() || (item.unit === "liters" ? "bidón" : packSize > 1 ? "caja" : "pieza");
  const name = `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  if (packSize <= 1) return item.unit === "liters" ? "Por litro" : name;
  return `${name} de ${formatQuantity(packSize)} ${item.unit === "liters" ? "L" : "pz"}`;
}

/** Lo capturado convertido a litros o piezas; null si no se ha escrito nada. */
function draftQty(item: InventoryCountItem, draft: Draft | undefined): number | null {
  if (!draft || (!draft.packs.trim() && !draft.loose.trim())) return null;
  const hasPacks = fieldsFor(item).some((field) => field.key === "packs");
  return countedQuantity({
    packs: hasPacks ? parseCountInput(draft.packs) : 0,
    packSize: Number(item.packSize) || 1,
    loose: parseCountInput(draft.loose),
  });
}

/** Solo cifras (y un punto decimal en los litros): nada que el servidor no entienda. */
function cleanInput(value: string, decimal: boolean): string {
  if (!decimal) return value.replace(/\D/g, "").slice(0, 6);
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = normalized.split(".");
  return (rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole).slice(0, 9);
}

function Stepper({
  field,
  value,
  onChange,
  onEnter,
  id,
}: {
  field: FieldSpec;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  id: string;
}) {
  const bump = (direction: 1 | -1) => {
    const current = parseCountInput(value) ?? 0;
    const next = Math.max(0, Math.round((current + direction * field.step) / field.step) * field.step);
    onChange(inputValue(next));
  };
  return (
    <div className="supc-field">
      <label htmlFor={id}>{field.label}</label>
      <div className="supc-stepper">
        <button type="button" onClick={() => bump(-1)} aria-label={`Menos ${field.label.toLowerCase()}`}>
          <Minus size={18} />
        </button>
        <input
          id={id}
          type="text"
          inputMode={field.decimal ? "decimal" : "numeric"}
          autoComplete="off"
          enterKeyHint="done"
          value={value}
          placeholder="0"
          onChange={(event) => onChange(cleanInput(event.target.value, field.decimal))}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onEnter();
            }
          }}
        />
        <button type="button" onClick={() => bump(1)} aria-label={`Más ${field.label.toLowerCase()}`}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

function statusChip(item: InventoryCountItem, saving: boolean): { label: string; className: string } {
  if (saving) return { label: "Guardando…", className: "is-saving" };
  if (pendingRecount(item)) return { label: "Recontar", className: "is-recount" };
  if (item.recountQty !== null) return { label: "Recontado", className: "is-done" };
  if (item.countedQty !== null) return { label: "Contado", className: "is-done" };
  return { label: "Por contar", className: "" };
}

/**
 * Un conteo de inventario de una sucursal, en la tienda. Ciego: solo el
 * producto y su empaque, nunca la existencia del sistema. Cada renglón se
 * guarda al salir de él (o con Guardar); si el servidor pide reconteo, se
 * marca "Recontar" y se vuelve a capturar. Al cerrar se ajusta el inventario
 * y se ve la diferencia en unidades (sin montos ni lo esperado).
 */
export function SupervisorCountPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = usePermissions();
  const canCount = can("posCounts", "create");

  const [count, setCount] = useState<InventoryCount | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ListFilter>("all");
  const [search, setSearch] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);

  // Lo último, para los guardados que salen de eventos del documento.
  const itemsRef = useRef<InventoryCountItem[]>([]);
  const draftsRef = useRef<Record<string, Draft>>({});
  const activeRowRef = useRef<string | null>(null);
  useEffect(() => {
    itemsRef.current = count?.items ?? [];
    draftsRef.current = drafts;
  }, [count, drafts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await httpClient.get<InventoryCount>(`/pos/counts/${id}`);
      setCount(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, "No se pudo abrir el conteo"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchItem = useCallback((item: InventoryCountItem) => {
    setCount((prev) =>
      prev ? { ...prev, items: (prev.items ?? []).map((row) => (row.id === item.id ? item : row)) } : prev
    );
  }, []);

  const saveItem = useCallback(
    async (itemId: string, qty: number): Promise<InventoryCountItem | null> => {
      const item = itemsRef.current.find((row) => row.id === itemId);
      if (!item) return null;
      const previousDraft = draftsRef.current[itemId];
      // Ya no está pendiente: que otro "salir del renglón" o Cerrar no lo guarde dos veces.
      const { [itemId]: _taken, ...remaining } = draftsRef.current;
      draftsRef.current = remaining;
      // Si se pidió reconteo (o ya se recontó y se corrige), lo que se guarda es el reconteo.
      const recount = pendingRecount(item) || item.recountQty !== null;
      const now = new Date().toISOString();
      const optimistic: InventoryCountItem = recount
        ? { ...item, recountQty: qty, recountedAt: now, needsRecount: false }
        : { ...item, countedQty: qty, countedAt: now, needsRecount: false };
      patchItem(optimistic);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setEditing((prev) => {
        if (!prev.has(itemId)) return prev;
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      setSaving((prev) => ({ ...prev, [itemId]: true }));
      try {
        const saved = await httpClient.put<InventoryCountItem>(`/pos/counts/${id}/items/${itemId}`, {
          countedQty: qty,
          ...(recount ? { recount: true } : {}),
        });
        // Ciego: aunque llegara, lo esperado no se guarda en pantalla.
        const next: InventoryCountItem = { ...optimistic, ...saved, expectedQty: null, varianceQty: null, varianceAmount: null };
        patchItem(next);
        if (!recount && pendingRecount(next)) {
          toast.warning(`Vuelve a contar: ${item.name}`, {
            description: "La cifra no cuadró. Cuéntalo otra vez con calma; si se puede, que lo cuente otra persona.",
          });
        }
        return next;
      } catch (error) {
        patchItem(item);
        if (previousDraft) setDrafts((prev) => ({ ...prev, [itemId]: previousDraft }));
        if (item.countedQty !== null && !pendingRecount(item)) setEditing((prev) => new Set(prev).add(itemId));
        toast.error(getApiErrorMessage(error, `No se guardó ${item.name}`));
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 409 || status === 404) void load();
        return null;
      } finally {
        setSaving((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }
    },
    [id, load, patchItem]
  );

  /** Guarda lo escrito en un renglón, si hay algo. */
  const flush = useCallback(
    (itemId: string) => {
      const item = itemsRef.current.find((row) => row.id === itemId);
      if (!item) return Promise.resolve(null);
      const qty = draftQty(item, draftsRef.current[itemId]);
      if (qty === null) return Promise.resolve(null);
      return saveItem(itemId, qty);
    },
    [saveItem]
  );

  // "Al salir del renglón": tocar o enfocar cualquier cosa fuera del renglón
  // en el que se escribía lo guarda. Se escucha el documento (y no el blur del
  // campo) porque en iPhone tocar − / + no enfoca el botón.
  useEffect(() => {
    const onInteract = (event: Event) => {
      const target = event.target as Element | null;
      const rowId = target?.closest?.("[data-count-row]")?.getAttribute("data-count-row") ?? null;
      const prev = activeRowRef.current;
      if (prev && prev !== rowId) void flush(prev);
      activeRowRef.current = rowId;
    };
    document.addEventListener("pointerdown", onInteract, true);
    document.addEventListener("focusin", onInteract, true);
    return () => {
      document.removeEventListener("pointerdown", onInteract, true);
      document.removeEventListener("focusin", onInteract, true);
    };
  }, [flush]);

  const items = useMemo(() => count?.items ?? [], [count]);
  const inProgress = count?.status === INVENTORY_COUNT_STATUS.IN_PROGRESS;
  const done = items.filter(isCountItemDone).length;
  const toRecount = items.filter(pendingRecount).length;
  const withDraft = items.filter((item) => !isCountItemDone(item) && draftQty(item, drafts[item.id]) !== null).length;
  const anySaving = Object.keys(saving).length > 0;
  // Lo escrito sin guardar también cuenta: Cerrar lo guarda primero.
  const readyToClose = items.length > 0 && done + withDraft === items.length && !anySaving;

  const setDraft = (itemId: string, key: keyof Draft, value: string) => {
    activeRowRef.current = itemId;
    setDrafts((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? { packs: "", loose: "" }), [key]: value } }));
  };

  const startClose = async () => {
    // Lo escrito sin guardar se guarda primero; si algo pide reconteo o falla, no se cierra.
    const latest = new Map(itemsRef.current.map((item) => [item.id, item]));
    const results = await Promise.all(Object.keys(draftsRef.current).map((itemId) => flush(itemId)));
    for (const saved of results) if (saved) latest.set(saved.id, saved);
    const rows = [...latest.values()];
    if (!rows.length || !rows.every(isCountItemDone)) {
      toast.error(rows.some(pendingRecount) ? "Hay renglones por recontar" : "Falta contar algún renglón");
      return;
    }
    setConfirmClose(true);
  };

  const close = async () => {
    setClosing(true);
    try {
      const closed = await httpClient.post<InventoryCount>(`/pos/counts/${id}/close`, {});
      setConfirmClose(false);
      setSearch("");
      setFilter("all");
      if (closed?.items?.length) setCount(closed);
      else await load();
      window.scrollTo({ top: 0 });
      toast.success("Conteo cerrado: el inventario quedó ajustado");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cerrar el conteo"));
      void load();
    } finally {
      setClosing(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await httpClient.post(`/pos/counts/${id}/cancel`, { reason: cancelReason.trim() });
      toast.success("Conteo cancelado; el inventario no cambió");
      router.push("/supervisor/conteos");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cancelar el conteo"));
      setCancelling(false);
    }
  };

  const branchName = count?.branch?.name ?? "Sucursal";
  const branchTitle = (
    <>
      {count?.branch?.code ? <span className="supd-code">{count.branch.code}</span> : null}
      {branchName}
    </>
  );

  const back = (
    <Link href="/supervisor/conteos" className="supc-back">
      <ArrowLeft size={16} />
      Conteos
    </Link>
  );

  if (loading && !count) return <p className="page-kicker">Abriendo el conteo…</p>;
  if (!count) {
    return (
      <div className="sup-page">
        {back}
        <p className="sup-empty">
          <AlertTriangle size={18} />
          {loadError ?? "No se encontró el conteo."}
        </p>
      </div>
    );
  }

  const term = search.trim().toLowerCase();
  const grouped = (rows: InventoryCountItem[], keep: (item: InventoryCountItem) => boolean, order = byName) =>
    COUNT_GROUPS.map((group) => ({
      ...group,
      all: rows.filter((item) => countGroupOf(item) === group.key),
    }))
      .map((group) => ({
        ...group,
        shown: group.all
          .filter((item) => !term || `${item.name} ${item.sku ?? ""}`.toLowerCase().includes(term))
          .filter(keep)
          .sort(order),
      }))
      .filter((group) => group.all.length);

  // ---------- Conteo cerrado o cancelado: solo la diferencia en unidades ----------
  if (!inProgress) {
    const cancelled = count.status === INVENTORY_COUNT_STATUS.CANCELLED;
    const withDiff = items.filter((item) => roundedVariance(item) !== 0).length;
    const accuracy = accuracyPercent(count.accuracy);
    // Primero lo que tuvo diferencia (de mayor a menor), luego por nombre.
    const byDiff = (a: InventoryCountItem, b: InventoryCountItem) =>
      Math.abs(roundedVariance(b)) - Math.abs(roundedVariance(a)) || byName(a, b);
    const resultGroups = grouped(items, (item) => !onlyDiff || roundedVariance(item) !== 0, byDiff);

    return (
      <div className="sup-page supc-page">
        {back}
        <section className={`supc-hero supc-result-hero${cancelled ? " is-cancelled" : ""}`}>
          <span className="supc-result-icon" aria-hidden>
            {cancelled ? <Ban size={26} /> : <CircleCheck size={26} />}
          </span>
          <div className="supc-hero-title">
            <h1>{cancelled ? "Conteo cancelado" : "Conteo cerrado"}</h1>
            <p className="supc-hero-branch">{branchTitle}</p>
            <p>{formatDateTime(cancelled ? count.cancelledAt ?? count.closedAt : count.closedAt)}</p>
          </div>
        </section>

        {cancelled ? (
          <p className="supc-notice is-muted">
            <Ban size={16} />
            Se descartó lo contado y el inventario no cambió.
          </p>
        ) : (
          <>
            <div className={`supc-result-summary${accuracy !== null ? " is-three" : ""}`}>
              <div className="is-ok">
                <b>{items.length - withDiff}</b>
                <span>Sin diferencia</span>
              </div>
              <div className={withDiff ? "is-diff" : "is-ok"}>
                <b>{withDiff}</b>
                <span>Con diferencia</span>
              </div>
              {accuracy !== null ? (
                <div className={accuracy >= 95 ? "is-ok" : "is-diff"}>
                  <b>{accuracy} %</b>
                  <span>Exactitud</span>
                </div>
              ) : null}
            </div>
            <p className="supc-notice">
              <Check size={16} />
              El inventario de la sucursal quedó ajustado con lo que contaste. La oficina revisa cada ajuste.
            </p>
            {count.pendingSync ? (
              <p className="supc-notice is-warning">
                <AlertTriangle size={16} />
                La caja tenía ventas sin subir: la oficina revisará la diferencia cuando se sincronice.
              </p>
            ) : null}

            {withDiff ? (
              <div className="supc-segmented" role="tablist" aria-label="Filtrar renglones">
                <button type="button" role="tab" aria-selected={!onlyDiff} className={!onlyDiff ? "is-active" : ""} onClick={() => setOnlyDiff(false)}>
                  Todos <b>{items.length}</b>
                </button>
                <button type="button" role="tab" aria-selected={onlyDiff} className={onlyDiff ? "is-active" : ""} onClick={() => setOnlyDiff(true)}>
                  Con diferencia <b>{withDiff}</b>
                </button>
              </div>
            ) : null}

            {resultGroups.map((group) => {
              const GroupIcon = GROUP_ICONS[group.key];
              return group.shown.length ? (
                <section key={group.key} className="supc-group">
                  <header className="supc-group-head">
                    <span className="supc-group-icon" aria-hidden>
                      <GroupIcon size={18} />
                    </span>
                    <div>
                      <h2>{group.label}</h2>
                    </div>
                  </header>
                  <ul className="supc-result-list">
                    {group.shown.map((item) => {
                      const variance = roundedVariance(item);
                      const reverted = item.status === INVENTORY_COUNT_ITEM_STATUS.REVERTED;
                      return (
                        <li key={item.id} className={variance && !reverted ? "has-diff" : undefined}>
                          <div className="supc-row-name">
                            <strong>{item.name}</strong>
                            <small>{reverted ? "La oficina revirtió este ajuste" : packDescription(item)}</small>
                          </div>
                          <span
                            className={`supc-variance ${reverted ? "is-muted" : variance > 0 ? "is-plus" : variance < 0 ? "is-minus" : "is-zero"}`}
                          >
                            {formatVariance(variance, item.unit)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null;
            })}
          </>
        )}
        <Link href="/supervisor/conteos" className="supc-wide-btn">
          Volver a conteos
        </Link>
      </div>
    );
  }

  // ---------- Conteo en curso ----------
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;
  const recounted = items.filter((item) => item.recountQty !== null).length;
  const filters: Array<{ key: ListFilter; label: string; value: number }> = [
    { key: "all", label: "Todos", value: items.length },
    { key: "todo", label: "Por contar", value: items.length - done },
    { key: "recount", label: "Recontar", value: toRecount },
  ];
  const groups = grouped(items, (item) =>
    filter === "todo" ? !isCountItemDone(item) : filter === "recount" ? pendingRecount(item) : true
  );

  return (
    <div className="sup-page supc-page">
      {back}

      <section className="supc-hero">
        <div className="supc-hero-head">
          <div className="supc-hero-title">
            <h1 className="supc-hero-branch">{branchTitle}</h1>
            <p>
              Empezó {formatDateTime(count.startedAt)}
              {count.startedByUser?.name ? ` · ${count.startedByUser.name}` : ""}
            </p>
          </div>
          <button type="button" className="sup-icon-button" onClick={() => void load()} disabled={loading} aria-label="Actualizar">
            <RefreshCw size={18} className={loading ? "sup-spin" : undefined} />
          </button>
        </div>

        <div className="supc-hero-progress" aria-label={`${done} de ${items.length} contados`}>
          <span
            className={`supc-ring${done === items.length && items.length ? " is-complete" : ""}`}
            style={{ "--p": percent } as CSSProperties}
          >
            <b>{done}</b>
            <small>de {items.length}</small>
          </span>
          <div className="supc-hero-stats">
            <strong>
              {done === items.length && items.length
                ? "Todo contado"
                : `Faltan ${items.length - done} ${items.length - done === 1 ? "renglón" : "renglones"}`}
            </strong>
            {toRecount ? (
              <span className="is-recount">
                <AlertTriangle size={14} />
                {toRecount} por recontar
              </span>
            ) : (
              <span>{percent} % del conteo</span>
            )}
          </div>
        </div>

        <p className="supc-hero-blind">
          <EyeOff size={16} />
          Conteo ciego: cuenta lo que hay en el anaquel y la bodega.
        </p>
      </section>

      <div className="supc-segmented" role="tablist" aria-label="Filtrar renglones">
        {filters.map(({ key, label, value }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`${filter === key ? "is-active" : ""}${key === "recount" && value ? " is-recount" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label} <b>{value}</b>
          </button>
        ))}
      </div>

      <label className="sup-search">
        <Search size={16} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar producto"
          aria-label="Buscar producto"
        />
      </label>

      {groups.every((group) => !group.shown.length) ? (
        <p className="sup-empty">
          <ClipboardCheck size={18} />
          {filter === "recount" ? "Nada por recontar." : filter === "todo" ? "Todo contado." : "Ningún producto con esa búsqueda."}
        </p>
      ) : null}

      {groups.map((group) => {
        if (!group.shown.length) return null;
        const GroupIcon = GROUP_ICONS[group.key];
        const groupDone = group.all.filter(isCountItemDone).length;
        return (
          <section key={group.key} className="supc-group">
            <header className="supc-group-head">
              <span className="supc-group-icon" aria-hidden>
                <GroupIcon size={18} />
              </span>
              <div>
                <h2>{group.label}</h2>
                <small>{group.hint}</small>
              </div>
              <span className={`supc-group-count${groupDone === group.all.length ? " is-done" : ""}`}>
                {groupDone === group.all.length ? <Check size={13} /> : null}
                {groupDone}/{group.all.length}
              </span>
            </header>
            <div className="supc-list">
              {group.shown.map((item) => (
                <CountRow
                  key={item.id}
                  item={item}
                  group={group.key}
                  draft={drafts[item.id]}
                  saving={Boolean(saving[item.id])}
                  editing={editing.has(item.id)}
                  canCount={canCount}
                  onDraft={(key, value) => setDraft(item.id, key, value)}
                  onSave={() => void flush(item.id)}
                  onZero={() => void saveItem(item.id, 0)}
                  onEdit={() => {
                    activeRowRef.current = item.id;
                    setEditing((prev) => new Set(prev).add(item.id));
                  }}
                  onCancelEdit={() => {
                    setEditing((prev) => {
                      const next = new Set(prev);
                      next.delete(item.id);
                      return next;
                    });
                    setDrafts((prev) => {
                      const next = { ...prev };
                      delete next[item.id];
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}

      {canCount ? (
        <button type="button" className="supc-cancel-link" onClick={() => setCancelOpen(true)}>
          <Ban size={16} />
          Cancelar conteo
        </button>
      ) : null}

      {canCount ? (
        <div className={`msf-savebar supc-closebar${readyToClose ? " is-ready" : ""}`}>
          <div className="supc-closebar-info">
            <span>
              {readyToClose ? (
                <>
                  <CircleCheck size={16} />
                  Todo contado: ya puedes cerrar
                </>
              ) : (
                <>
                  <b>{done}</b> de {items.length} contados
                  {toRecount ? <em> · {toRecount} por recontar</em> : null}
                </>
              )}
            </span>
            <span className="supc-progress-bar" aria-hidden>
              <span style={{ width: `${percent}%` }} />
            </span>
          </div>
          <button
            type="button"
            className="supc-close-btn"
            disabled={!readyToClose || closing}
            onClick={() => void startClose()}
          >
            <ClipboardCheck size={18} />
            Cerrar conteo
          </button>
        </div>
      ) : null}

      <CountDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        busy={closing}
        tone="success"
        icon={ClipboardCheck}
        title="Cerrar conteo"
        subtitle={branchTitle}
        actions={
          <>
            <button type="button" className="supd-btn" onClick={() => setConfirmClose(false)} disabled={closing}>
              Seguir contando
            </button>
            <button type="button" className="supd-btn is-primary" onClick={() => void close()} disabled={closing}>
              <Check size={18} />
              {closing ? "Cerrando…" : "Cerrar y ajustar"}
            </button>
          </>
        }
      >
        <div className="supd-stats">
          <div>
            <b>{items.length}</b>
            <span>Contados</span>
          </div>
          <div>
            <b>{recounted}</b>
            <span>Recontados</span>
          </div>
        </div>
        <p>
          El inventario de la sucursal se ajusta con lo que contaste y verás la diferencia de cada renglón.
        </p>
        <p className="supd-note is-warning">
          <AlertTriangle size={16} />
          No se puede deshacer desde aquí; la oficina revisa cada ajuste.
        </p>
      </CountDialog>

      <CountDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        busy={cancelling}
        tone="danger"
        icon={Ban}
        title="Cancelar conteo"
        subtitle={branchTitle}
        actions={
          <>
            <button type="button" className="supd-btn" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Seguir contando
            </button>
            <button
              type="button"
              className="supd-btn is-primary"
              onClick={() => void cancel()}
              disabled={cancelling || cancelReason.trim().length < 3}
            >
              {cancelling ? "Cancelando…" : "Cancelar conteo"}
            </button>
          </>
        }
      >
        <p>Se descarta lo contado ({done} de {items.length}) y el inventario no cambia.</p>
        <div className="supd-field">
          <label htmlFor="count-cancel-reason">¿Por qué se cancela?</label>
          <div className="supd-chips">
            {CANCEL_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                className={cancelReason === reason ? "is-active" : undefined}
                onClick={() => setCancelReason(reason)}
              >
                {reason}
              </button>
            ))}
          </div>
          <textarea
            id="count-cancel-reason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value.slice(0, 300))}
            placeholder="Escribe el motivo"
            rows={2}
          />
        </div>
      </CountDialog>
    </div>
  );
}

function CountRow({
  item,
  group,
  draft,
  saving,
  editing,
  canCount,
  onDraft,
  onSave,
  onZero,
  onEdit,
  onCancelEdit,
}: {
  item: InventoryCountItem;
  group: CountGroupKey;
  draft: Draft | undefined;
  saving: boolean;
  editing: boolean;
  canCount: boolean;
  onDraft: (key: keyof Draft, value: string) => void;
  onSave: () => void;
  onZero: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
}) {
  const recount = pendingRecount(item);
  const counted = item.countedQty !== null;
  const capturing = canCount && (!counted || recount || editing);
  const chip = statusChip(item, saving);
  const fields = fieldsFor(item);
  const preview = draftQty(item, draft);
  const final = finalCountedQty(item);

  // Ya contado: un renglón compacto con lo que se contó y Corregir.
  if (!capturing && counted) {
    return (
      <article className={`supc-row is-${group} is-compact is-done`} data-count-row={item.id}>
        <span className="supc-row-check" aria-hidden>
          <Check size={16} />
        </span>
        <div className="supc-row-name">
          <strong>{item.name}</strong>
          <small>
            {item.recountQty !== null ? "Recontaste" : "Contaste"} <b>{formatCountQty(final, item.unit)}</b>
            {" · "}
            {packDescription(item)}
          </small>
        </div>
        {saving ? (
          <span className="supc-chip is-saving">Guardando…</span>
        ) : canCount ? (
          <button type="button" className="supc-btn is-ghost" onClick={onEdit}>
            Corregir
          </button>
        ) : null}
      </article>
    );
  }

  return (
    <article className={`supc-row is-${group}${recount ? " is-recount" : ""}${editing ? " is-editing" : ""}`} data-count-row={item.id}>
      <div className="supc-row-head">
        <div className="supc-row-name">
          <strong>{item.name}</strong>
          <small>{[packDescription(item), item.sku].filter(Boolean).join(" · ")}</small>
        </div>
        <span className={`supc-chip ${editing && !saving ? "is-editing" : chip.className}`}>
          {editing && !saving ? "Corrigiendo" : chip.label}
        </span>
      </div>

      {recount ? (
        <p className="supc-recount-note">
          <AlertTriangle size={14} />
          No cuadró: vuélvelo a contar con calma (si se puede, que lo cuente otra persona).
        </p>
      ) : null}

      {capturing ? (
        <>
          <div className={`supc-fields${fields.length > 1 ? " is-two" : ""}`}>
            {fields.map((field) => (
              <Stepper
                key={field.key}
                id={`count-${item.id}-${field.key}`}
                field={field}
                value={draft?.[field.key] ?? ""}
                onChange={(value) => onDraft(field.key, value)}
                onEnter={onSave}
              />
            ))}
          </div>
          <div className="supc-row-actions">
            {(fields.length > 1 || group === "liquids") && preview !== null ? (
              <span className="supc-preview">= {formatCountQty(preview, item.unit)}</span>
            ) : (
              <span className="supc-preview is-empty" />
            )}
            {editing ? (
              <button type="button" className="supc-btn is-ghost" onClick={onCancelEdit}>
                Cancelar
              </button>
            ) : null}
            <button type="button" className="supc-btn" onClick={onZero} disabled={saving}>
              No hay
            </button>
            <button type="button" className="supc-btn is-primary" onClick={onSave} disabled={saving || preview === null}>
              <Check size={16} />
              Guardar
            </button>
          </div>
        </>
      ) : null}
    </article>
  );
}
