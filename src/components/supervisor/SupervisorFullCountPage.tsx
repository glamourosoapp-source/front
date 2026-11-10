"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  CloudCheck,
  EyeOff,
  LayoutGrid,
  RefreshCw,
  Search,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { INVENTORY_COUNT_ITEM_STATUS, INVENTORY_COUNT_KINDS, INVENTORY_COUNT_STATUS } from "@glamouroso/shared/constants";
import type { InventoryCount, InventoryCountItem } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatDateTime } from "@/components/pos-admin/pos-labels";
import { usePermissions } from "@/lib/permissions";
import { accuracyPercent, formatCountQty, formatVariance } from "./supervisor-counts";
import { CountDialog } from "./CountDialog";
import { type Draft, draftQty, fieldsFor, packDescription, Stepper } from "./count-fields";
import {
  finalQty,
  FULL_COUNTS_HREF,
  fullCategories,
  fullCategoryOf,
  fullItemState,
  fullProgress,
  percentOf,
  type FullItemState,
} from "./full-count";

type ListFilter = "all" | "todo" | "done";

const CANCEL_REASONS = ["Lo inicié por error", "Se va a repetir otro día", "Estaba llegando surtido"];

const STATE_LABELS: Record<FullItemState, string> = {
  done: "Contado",
  todo: "Por contar",
};

const isDone = (item: InventoryCountItem) => fullItemState(item) === "done";

/** Diferencia en unidades redondeada a centésimos (0 si no hay). */
function roundedVariance(item: InventoryCountItem): number {
  return Math.round(Number(item.varianceQty ?? 0) * 100) / 100;
}

function scrollToRow(itemId: string) {
  requestAnimationFrame(() => {
    const row = document.querySelector(`[data-count-row="${itemId}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

/**
 * Inventario completo de una sucursal, en la tienda: todo lo vivo de la
 * sucursal, agrupado por categoría para recorrer anaqueles y bodega. Cada
 * renglón se pinta de su color (verde contado, gris por contar) y el mapa de
 * arriba muestra el avance de un vistazo. Sin reconteo: contado es contado.
 * Se captura un renglón a la vez: al guardar se abre el siguiente por contar.
 * Cada captura queda registrada al momento en la existencia de la sucursal
 * (el servidor la ajusta por kardex), así que se puede salir y continuar
 * después o repartirlo entre varias personas. Ciego mientras está abierto;
 * cerrar lo da por terminado y cancelar deshace lo registrado.
 */
export function SupervisorFullCountPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = usePermissions();
  const canCount = can("posCounts", "create");

  const [count, setCount] = useState<InventoryCount | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showMap, setShowMap] = useState(true);
  // En el celular el mapa de una sucursal grande (600+ cuadros) empuja la lista
  // muy abajo: empieza cerrado y se abre con su botón. Antes de que llegue el
  // conteo solo se ve "Abriendo…", así que no hay parpadeo.
  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) setShowMap(false);
  }, []);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);

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
      setLoadError(getApiErrorMessage(error, "No se pudo abrir el inventario"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Al volver a la pestaña se recarga: puede que otra persona haya contado su parte.
  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Un conteo cíclico tiene su propia pantalla.
  useEffect(() => {
    if (count && count.kind !== INVENTORY_COUNT_KINDS.FULL) router.replace(`/supervisor/conteos/${count.id}`);
  }, [count, router]);

  useEffect(() => {
    if (!flashId) return;
    const timer = window.setTimeout(() => setFlashId(null), 1600);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  const patchItem = useCallback((item: InventoryCountItem) => {
    setCount((prev) =>
      prev ? { ...prev, items: (prev.items ?? []).map((row) => (row.id === item.id ? { ...row, ...item } : row)) } : prev
    );
  }, []);

  const saveItem = useCallback(
    async (itemId: string, qty: number): Promise<InventoryCountItem | null> => {
      const item = itemsRef.current.find((row) => row.id === itemId);
      if (!item) return null;
      const previousDraft = draftsRef.current[itemId];
      const { [itemId]: _taken, ...remaining } = draftsRef.current;
      draftsRef.current = remaining;
      // Un inventario viejo que ya traía reconteo se corrige sobre el reconteo.
      const recount = item.recountQty !== null;
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
      setSaving((prev) => ({ ...prev, [itemId]: true }));
      try {
        const saved = await httpClient.put<InventoryCountItem>(`/pos/counts/${id}/items/${itemId}`, {
          countedQty: qty,
          ...(recount ? { recount: true } : {}),
        });
        // Ciego: aunque llegara, lo esperado no se guarda en pantalla.
        const next: InventoryCountItem = {
          ...optimistic,
          ...saved,
          category: item.category,
          expectedQty: null,
          varianceQty: null,
          varianceAmount: null,
        };
        patchItem({ ...next, needsRecount: false });
        return next;
      } catch (error) {
        patchItem(item);
        if (previousDraft) setDrafts((prev) => ({ ...prev, [itemId]: previousDraft }));
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

  // Tocar fuera del renglón en el que se escribía lo guarda (como en el conteo cíclico).
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
  const categories = useMemo(() => fullCategories(items), [items]);
  const progress = count ? fullProgress(count) : { done: 0, todo: 0, total: 0 };
  const term = search.trim().toLowerCase();

  /** Lo que se ve en la lista, en el orden del servidor. */
  const visible = useMemo(
    () =>
      items.filter((item) => {
        if (category && fullCategoryOf(item) !== category) return false;
        if (term && !`${item.name} ${item.sku ?? ""}`.toLowerCase().includes(term)) return false;
        if (filter === "todo") return !isDone(item);
        if (filter === "done") return isDone(item);
        return true;
      }),
    [items, category, term, filter]
  );

  /** El siguiente por contar después de `itemId` en la lista visible; si no, el primero. */
  const nextPending = useCallback(
    (itemId: string): string | null => {
      const pending = (item: InventoryCountItem) => item.id !== itemId && !isDone(item);
      const index = visible.findIndex((item) => item.id === itemId);
      const after = visible.slice(index + 1).find(pending);
      return (after ?? visible.find(pending))?.id ?? null;
    },
    [visible]
  );

  const openRow = (itemId: string | null) => {
    if (openId && openId !== itemId) void flush(openId);
    setOpenId(itemId);
    activeRowRef.current = itemId;
    if (itemId) scrollToRow(itemId);
  };

  /** Guardar y pasar al siguiente por contar. */
  const saveAndNext = (itemId: string, qty: number | null) => {
    const item = itemsRef.current.find((row) => row.id === itemId);
    if (!item) return;
    const value = qty ?? draftQty(item, draftsRef.current[itemId]);
    if (value === null) return;
    const next = nextPending(itemId);
    void saveItem(itemId, value);
    setOpenId(next);
    activeRowRef.current = next;
    if (next) scrollToRow(next);
  };

  const setDraft = (itemId: string, key: keyof Draft, value: string) => {
    activeRowRef.current = itemId;
    setDrafts((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? { packs: "", loose: "" }), [key]: value } }));
  };

  /** Desde el mapa: ir al renglón (y abrirlo si falta contarlo). */
  const jumpTo = (item: InventoryCountItem) => {
    setCategory(null);
    setFilter("all");
    setSearch("");
    setFlashId(item.id);
    if (!isDone(item) && canCount) openRow(item.id);
    else scrollToRow(item.id);
  };

  const anySaving = Object.keys(saving).length > 0;
  const withDraft = items.filter((item) => !isDone(item) && draftQty(item, drafts[item.id]) !== null).length;
  const readyToClose = items.length > 0 && progress.done + withDraft === items.length && !anySaving;

  const startClose = async () => {
    const latest = new Map(itemsRef.current.map((item) => [item.id, item]));
    const results = await Promise.all(Object.keys(draftsRef.current).map((itemId) => flush(itemId)));
    for (const saved of results) if (saved) latest.set(saved.id, saved);
    const rows = [...latest.values()];
    if (!rows.length || !rows.every(isDone)) {
      toast.error("Falta contar algún producto");
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
      setCategory(null);
      setOpenId(null);
      // La respuesta del cierre no trae categorías: se vuelve a leer.
      if (closed) setCount((prev) => ({ ...closed, items: closed.items ?? prev?.items }));
      await load();
      window.scrollTo({ top: 0 });
      toast.success("Inventario cerrado");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cerrar el inventario"));
      void load();
    } finally {
      setClosing(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await httpClient.post(`/pos/counts/${id}/cancel`, { reason: cancelReason.trim() });
      toast.success("Inventario cancelado; la existencia regresó a como estaba");
      router.push(FULL_COUNTS_HREF);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cancelar el inventario"));
      setCancelling(false);
    }
  };

  const back = (
    <Link href={FULL_COUNTS_HREF} className="supc-back">
      <ArrowLeft size={16} />
      Inventarios
    </Link>
  );

  if (loading && !count) return <p className="page-kicker">Abriendo el inventario…</p>;
  if (!count) {
    return (
      <div className="sup-page">
        {back}
        <p className="sup-empty">
          <AlertTriangle size={18} />
          {loadError ?? "No se encontró el inventario."}
        </p>
      </div>
    );
  }

  const branchTitle = (
    <>
      {count.branch?.code ? <span className="supd-code">{count.branch.code}</span> : null}
      {count.branch?.name ?? "Sucursal"}
    </>
  );

  // ---------- Cerrado o cancelado: la diferencia en unidades por categoría ----------
  if (count.status !== INVENTORY_COUNT_STATUS.IN_PROGRESS) {
    const cancelled = count.status === INVENTORY_COUNT_STATUS.CANCELLED;
    const withDiff = items.filter((item) => roundedVariance(item) !== 0).length;
    const accuracy = accuracyPercent(count.accuracy);
    const resultGroups = categories
      .map((group) => ({
        ...group,
        shown: group.items
          .filter((item) => !onlyDiff || roundedVariance(item) !== 0)
          .filter((item) => !term || `${item.name} ${item.sku ?? ""}`.toLowerCase().includes(term))
          .sort(
            (a, b) => Math.abs(roundedVariance(b)) - Math.abs(roundedVariance(a)) || a.name.localeCompare(b.name)
          ),
      }))
      .filter((group) => group.shown.length);

    return (
      <div className="sup-page supc-page">
        {back}
        <section className={`supc-hero supc-result-hero${cancelled ? " is-cancelled" : ""}`}>
          <span className="supc-result-icon" aria-hidden>
            {cancelled ? <Ban size={26} /> : <CircleCheck size={26} />}
          </span>
          <div className="supc-hero-title">
            <h1>{cancelled ? "Inventario cancelado" : "Inventario cerrado"}</h1>
            <p className="supc-hero-branch">{branchTitle}</p>
            <p>
              {formatDateTime(cancelled ? (count.cancelledAt ?? count.closedAt) : count.closedAt)} · {items.length}{" "}
              productos
            </p>
          </div>
        </section>

        {cancelled ? (
          <p className="supc-notice is-muted">
            <Ban size={16} />
            Se deshizo lo registrado y la existencia regresó a como estaba.
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
              La existencia de la sucursal quedó ajustada con lo que contaste. La oficina revisa cada ajuste.
            </p>
            {count.pendingSync ? (
              <p className="supc-notice is-warning">
                <AlertTriangle size={16} />
                La caja tenía ventas sin subir: la oficina revisará la diferencia cuando se sincronice.
              </p>
            ) : null}

            {withDiff ? (
              <div className="supc-segmented" role="tablist" aria-label="Filtrar productos">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!onlyDiff}
                  className={!onlyDiff ? "is-active" : ""}
                  onClick={() => setOnlyDiff(false)}
                >
                  Todos <b>{items.length}</b>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={onlyDiff}
                  className={onlyDiff ? "is-active" : ""}
                  onClick={() => setOnlyDiff(true)}
                >
                  Con diferencia <b>{withDiff}</b>
                </button>
              </div>
            ) : null}

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

            {resultGroups.map((group) => (
              <section key={group.name} className="supc-group">
                <header className="supi-group-head">
                  <h2>{group.name}</h2>
                  <span>{group.items.length}</span>
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
            ))}
          </>
        )}
        <Link href={FULL_COUNTS_HREF} className="supc-wide-btn">
          Volver a inventarios
        </Link>
      </div>
    );
  }

  // ---------- En curso ----------
  const percent = percentOf(progress.done, progress.total);
  const filters: Array<{ key: ListFilter; label: string; value: number; className?: string }> = [
    { key: "all", label: "Todos", value: progress.total },
    { key: "todo", label: "Por contar", value: progress.todo },
    { key: "done", label: "Contados", value: progress.done, className: "is-done" },
  ];
  const groups = categories
    .map((group) => ({ ...group, shown: visible.filter((item) => fullCategoryOf(item) === group.name) }))
    .filter((group) => group.shown.length);

  return (
    <div className="sup-page supc-page supi-page">
      {back}

      <section className="supc-hero supi-hero">
        <div className="supc-hero-head">
          <div className="supc-hero-title">
            <span className="supi-kicker">
              <Warehouse size={14} />
              Inventario completo
            </span>
            <h1 className="supc-hero-branch">{branchTitle}</h1>
            <p>
              Empezó {formatDateTime(count.startedAt)}
              {count.startedByUser?.name ? ` · ${count.startedByUser.name}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="sup-icon-button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Actualizar"
          >
            <RefreshCw size={18} className={loading ? "sup-spin" : undefined} />
          </button>
        </div>

        <div className="supi-progress" aria-label={`${progress.done} de ${progress.total} contados`}>
          <div className="supi-progress-numbers">
            <strong>
              {progress.done}
              <small> de {progress.total}</small>
            </strong>
            <span>{percent} %</span>
          </div>
          <div className="supi-bar" aria-hidden>
            <span className="is-done" style={{ width: `${percentOf(progress.done, progress.total)}%` }} />
          </div>
          <ul className="supi-legend">
            <li className="is-done">
              <i /> {progress.done} contados
            </li>
            <li className="is-todo">
              <i /> {progress.todo} por contar
            </li>
          </ul>
        </div>

        <div className="supi-map-head">
          <button type="button" className="supi-map-toggle" onClick={() => setShowMap((value) => !value)} aria-expanded={showMap}>
            <LayoutGrid size={15} />
            Mapa de avance
            <ChevronDown size={15} className={showMap ? "is-open" : undefined} />
          </button>
          {showMap ? <span>Toca un cuadro para ir al producto</span> : null}
        </div>
        {showMap ? (
          <div className="supi-map" role="list" aria-label="Avance por producto">
            {items.map((item) => {
              const state = fullItemState(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  className={`supi-cell is-${state}${openId === item.id ? " is-open" : ""}`}
                  title={`${item.name} · ${STATE_LABELS[state]}`}
                  aria-label={`${item.name}: ${STATE_LABELS[state]}`}
                  onClick={() => jumpTo(item)}
                />
              );
            })}
          </div>
        ) : null}

        <p className="supc-hero-blind">
          <EyeOff size={16} />
          Conteo ciego: cuenta lo que hay en el anaquel y la bodega.
        </p>
        <p className="supi-saved">
          <CloudCheck size={16} />
          Cada producto que cuentas queda registrado al momento en el inventario de la sucursal. Puedes salir y
          continuar después, o repartirlo entre varias personas.
        </p>
      </section>

      <div className="supi-cats" role="tablist" aria-label="Categorías">
        <button
          type="button"
          role="tab"
          aria-selected={category === null}
          className={`supi-cat${category === null ? " is-active" : ""}${progress.done === progress.total ? " is-complete" : ""}`}
          onClick={() => setCategory(null)}
        >
          <span className="supi-cat-name">Todas</span>
          <span className="supi-cat-count">
            {progress.done}/{progress.total}
          </span>
          <span className="supi-cat-bar" aria-hidden>
            <span style={{ width: `${percent}%` }} />
          </span>
        </button>
        {categories.map((group) => {
          const complete = group.done === group.items.length;
          return (
            <button
              key={group.name}
              type="button"
              role="tab"
              aria-selected={category === group.name}
              className={`supi-cat${category === group.name ? " is-active" : ""}${complete ? " is-complete" : ""}`}
              onClick={() => setCategory(category === group.name ? null : group.name)}
            >
              <span className="supi-cat-name">
                {complete ? <Check size={13} /> : null}
                {group.name}
              </span>
              <span className="supi-cat-count">
                {group.done}/{group.items.length}
              </span>
              <span className="supi-cat-bar" aria-hidden>
                <span style={{ width: `${percentOf(group.done, group.items.length)}%` }} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="supc-segmented supi-filters" role="tablist" aria-label="Filtrar productos">
        {filters.map(({ key, label, value, className }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`${filter === key ? "is-active" : ""} ${className ?? ""}`.trim()}
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
          placeholder="Buscar producto o clave"
          aria-label="Buscar producto"
        />
      </label>

      {!groups.length ? (
        <p className="sup-empty">
          <ClipboardCheck size={18} />
          {filter === "todo"
              ? category
                ? "Esta categoría ya está contada."
                : "Todo contado."
              : filter === "done"
                ? "Todavía no hay productos contados aquí."
                : "Ningún producto con esa búsqueda."}
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.name} className="supi-group">
          <header className="supi-group-head">
            <h2>{group.name}</h2>
            <span className={group.done === group.items.length ? "is-complete" : undefined}>
              {group.done === group.items.length ? <Check size={13} /> : null}
              {group.done}/{group.items.length}
            </span>
          </header>
          <div className="supi-list">
            {group.shown.map((item) => (
              <FullCountRow
                key={item.id}
                item={item}
                open={openId === item.id}
                flash={flashId === item.id}
                draft={drafts[item.id]}
                saving={Boolean(saving[item.id])}
                canCount={canCount}
                onOpen={() => openRow(item.id)}
                onClose={() => {
                  setOpenId(null);
                  setDrafts((prev) => {
                    const next = { ...prev };
                    delete next[item.id];
                    return next;
                  });
                }}
                onDraft={(key, value) => setDraft(item.id, key, value)}
                onSave={() => saveAndNext(item.id, null)}
                onZero={() => saveAndNext(item.id, 0)}
              />
            ))}
          </div>
        </section>
      ))}

      {canCount ? (
        <button type="button" className="supc-cancel-link" onClick={() => setCancelOpen(true)}>
          <Ban size={16} />
          Cancelar inventario
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
                  <b>{progress.done}</b> de {progress.total} contados
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
            Cerrar inventario
          </button>
        </div>
      ) : null}

      <CountDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        busy={closing}
        tone="success"
        icon={ClipboardCheck}
        title="Cerrar inventario"
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
            <b>{categories.length}</b>
            <span>Categorías</span>
          </div>
        </div>
        <p>
          Lo que contaste ya quedó registrado en el inventario de la sucursal. Al cerrar lo das por terminado y verás
          la diferencia de cada producto.
        </p>
        <p className="supd-note is-warning">
          <AlertTriangle size={16} />
          Ya no se podrá corregir desde aquí; la oficina revisa cada ajuste.
        </p>
      </CountDialog>

      <CountDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        busy={cancelling}
        tone="danger"
        icon={Ban}
        title="Cancelar inventario"
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
              {cancelling ? "Cancelando…" : "Cancelar inventario"}
            </button>
          </>
        }
      >
        <p>
          Se deshace lo que ya se registró ({progress.done} de {progress.total} productos) y la existencia regresa a
          como estaba.
        </p>
        <div className="supd-field">
          <label htmlFor="full-cancel-reason">¿Por qué se cancela?</label>
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
            id="full-cancel-reason"
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

/**
 * Un producto del inventario: cerrado es un renglón de su color (gris por
 * contar, verde contado con la cifra); abierto trae los − / + para capturar.
 * Solo uno abierto a la vez.
 */
function FullCountRow({
  item,
  open,
  flash,
  draft,
  saving,
  canCount,
  onOpen,
  onClose,
  onDraft,
  onSave,
  onZero,
}: {
  item: InventoryCountItem;
  open: boolean;
  flash: boolean;
  draft: Draft | undefined;
  saving: boolean;
  canCount: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDraft: (key: keyof Draft, value: string) => void;
  onSave: () => void;
  onZero: () => void;
}) {
  const state = fullItemState(item);
  const final = finalQty(item);
  const fields = fieldsFor(item);
  const preview = draftQty(item, draft);
  const firstInput = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const input = firstInput.current?.querySelector("input");
    // Sin teclado en el celular hasta que lo toquen; en compu y tablet con teclado se escribe de una.
    if (input && window.matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true });
  }, [open]);

  const className = `supi-row is-${state}${open ? " is-open" : ""}${flash ? " is-flash" : ""}`;

  if (!open || !canCount) {
    return (
      <article className={className} data-count-row={item.id}>
        <button type="button" className="supi-row-main" onClick={canCount ? onOpen : undefined} disabled={!canCount}>
          <span className="supi-dot" aria-hidden>
            {state === "done" ? <Check size={14} /> : null}
          </span>
          <span className="supc-row-name">
            <strong>{item.name}</strong>
            <small>{[packDescription(item), item.sku].filter(Boolean).join(" · ")}</small>
          </span>
          {saving ? (
            <span className="supc-chip is-saving">Guardando…</span>
          ) : state === "done" ? (
            <span className="supi-qty">
              <b>{formatCountQty(final, item.unit)}</b>
              {canCount ? <small>Corregir</small> : null}
            </span>
          ) : canCount ? (
            <span className="supi-go">
              Contar
              <ChevronRight size={16} />
            </span>
          ) : null}
        </button>
      </article>
    );
  }

  return (
    <article className={className} data-count-row={item.id}>
      <div className="supc-row-head">
        <div className="supc-row-name">
          <strong>{item.name}</strong>
          <small>{[packDescription(item), item.sku].filter(Boolean).join(" · ")}</small>
        </div>
        <span className={`supc-chip ${state === "done" ? "is-editing" : ""}`}>
          {state === "done" ? "Corrigiendo" : "Contando"}
        </span>
      </div>

      {state === "done" ? (
        <p className="supi-current">
          Ya contaste <b>{formatCountQty(final, item.unit)}</b>; escribe la cifra correcta.
        </p>
      ) : null}

      <div ref={firstInput} className={`supc-fields${fields.length > 1 ? " is-two" : ""}`}>
        {fields.map((field) => (
          <Stepper
            key={field.key}
            id={`full-${item.id}-${field.key}`}
            field={field}
            value={draft?.[field.key] ?? ""}
            onChange={(value) => onDraft(field.key, value)}
            onEnter={onSave}
          />
        ))}
      </div>
      <div className="supc-row-actions">
        {preview !== null && (fields.length > 1 || item.unit === "liters") ? (
          <span className="supc-preview">= {formatCountQty(preview, item.unit)}</span>
        ) : (
          <span className="supc-preview is-empty" />
        )}
        <button type="button" className="supc-btn is-ghost" onClick={onClose}>
          Cerrar
        </button>
        <button type="button" className="supc-btn" onClick={onZero} disabled={saving}>
          No hay
        </button>
        <button type="button" className="supc-btn is-primary" onClick={onSave} disabled={saving || preview === null}>
          <Check size={16} />
          Guardar
        </button>
      </div>
    </article>
  );
}
