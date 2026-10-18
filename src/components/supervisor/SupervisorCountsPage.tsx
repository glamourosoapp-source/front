"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ClipboardCheck, ClipboardList, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { BRANCH_TYPES, INVENTORY_COUNT_STATUS } from "@glamouroso/shared/constants";
import type { InventoryCount } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { relativeDays } from "@/components/pos-admin/pos-labels";
import { usePermissions } from "@/lib/permissions";
import type { Branch, ListResponse } from "@/types";
import { StartCountDialog, type CountBranch } from "./StartCountDialog";
import { accuracyPercent, countProgress, itemsWithDifference } from "./supervisor-counts";

/** Días tras los que una sucursal vuelve a "Por contar" (la frecuencia de la clase A). */
const STALE_DAYS = 30;

/**
 * - `progress`: tiene un conteo en curso;
 * - `due`: nunca se ha contado o el último cerró hace más de 30 días;
 * - `ok`: contada en los últimos 30 días.
 */
type Step = "progress" | "due" | "ok";
type Filter = "all" | Step;

const STEP_ORDER: Record<Step, number> = { progress: 0, due: 1, ok: 2 };
const STEP_LABELS: Record<Step, string> = { progress: "En curso", due: "Por contar", ok: "Contada" };
/** Mismos colores de foco y etiqueta que los pasos del pedido. */
const STEP_CLASS: Record<Step, string> = { progress: "is-step-draft", due: "", ok: "is-step-ok" };

interface Row {
  branch: Branch;
  step: Step;
  current: InventoryCount | null;
  last: InventoryCount | null;
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function CountCard({ row, canStart, onStart }: { row: Row; canStart: boolean; onStart: (row: Row) => void }) {
  const { branch, step, current, last } = row;
  const progress = current ? countProgress(current) : null;
  const differences = last ? itemsWithDifference(last) : null;
  const accuracy = last ? accuracyPercent(last.accuracy) : null;
  const Icon = step === "progress" ? ClipboardList : ClipboardCheck;

  return (
    <article className="sup-card sup-order">
      <div className="sup-branch-head">
        <span className={`sup-light ${STEP_CLASS[step]}`} aria-hidden>
          <Icon size={16} />
        </span>
        <div className="sup-branch-name">
          <strong>{branch.name}</strong>
          <small>{[branch.code, branch.city].filter(Boolean).join(" · ")}</small>
        </div>
        <span className={`sup-pill ${STEP_CLASS[step]}`}>{STEP_LABELS[step]}</span>
      </div>

      <div className="supc-card-lines">
        {current && progress ? (
          <p>
            <strong>
              En curso · {progress.counted}/{progress.total || "—"}
            </strong>{" "}
            <span>· empezó {relativeDays(current.startedAt)}</span>
          </p>
        ) : null}
        {last ? (
          <p>
            Último conteo {relativeDays(last.closedAt ?? last.startedAt)}
            {differences !== null
              ? differences
                ? ` · diferencias en ${differences} ${differences === 1 ? "renglón" : "renglones"}`
                : " · sin diferencias"
              : ""}
            {accuracy !== null ? <span className="supc-muted"> · exactitud {accuracy} %</span> : null}
          </p>
        ) : (
          <p className="supc-muted">Nunca contada</p>
        )}
      </div>

      {current ? (
        <div className="sup-card-links">
          <Link href={`/supervisor/conteos/${current.id}`} className="sup-card-link">
            Continuar conteo
            <ChevronRight size={16} />
          </Link>
        </div>
      ) : canStart ? (
        <div className="sup-card-links">
          <button type="button" className="sup-card-link" onClick={() => onStart(row)}>
            Iniciar conteo
            <ChevronRight size={16} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Conteos de inventario (cíclicos) para el supervisor: cada sucursal con su
 * conteo en curso y el último cerrado. Desde aquí se inicia (lista sorpresa
 * de 30 renglones) o se continúa. `?sucursal=<id>` (desde la tarjeta de
 * Sucursales) abre directo el de esa sucursal.
 */
export function SupervisorCountsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requestedBranch = params.get("sucursal");
  const { can } = usePermissions();
  const canStart = can("posCounts", "create");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [current, setCurrent] = useState<Record<string, InventoryCount>>({});
  const [lastClosed, setLastClosed] = useState<Record<string, InventoryCount>>({});
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState<CountBranch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [branchList, open, closed] = await Promise.all([
        httpClient.get<ListResponse<Branch>>("/pos/branches", { limit: 200, isActive: "true" }),
        httpClient.get<ListResponse<InventoryCount>>("/pos/counts", {
          status: INVENTORY_COUNT_STATUS.IN_PROGRESS,
          limit: 200,
        }),
        httpClient.get<ListResponse<InventoryCount>>("/pos/counts", { status: INVENTORY_COUNT_STATUS.CLOSED, limit: 200 }),
      ]);
      const stores = branchList.items.filter((branch) => branch.type === BRANCH_TYPES.BRANCH);
      // Vienen del más reciente al más viejo: el primero de cada sucursal manda.
      const byBranch = (list: InventoryCount[]) => {
        const map: Record<string, InventoryCount> = {};
        for (const count of list) if (!map[count.branchId]) map[count.branchId] = count;
        return map;
      };
      const closedMap = byBranch(closed.items);
      // Si hay más conteos cerrados de los que caben en una página, las
      // sucursales que no salieron se piden una por una (solo esas).
      if (closed.total > closed.items.length) {
        const missing = stores.filter((branch) => !closedMap[branch.id]);
        await Promise.all(
          missing.map(async (branch) => {
            try {
              const one = await httpClient.get<ListResponse<InventoryCount>>("/pos/counts", {
                branchId: branch.id,
                status: INVENTORY_COUNT_STATUS.CLOSED,
                limit: 1,
              });
              if (one.items[0]) closedMap[branch.id] = one.items[0];
            } catch {
              // Sin dato: se muestra como nunca contada.
            }
          })
        );
      }
      setBranches(stores);
      setCurrent(byBranch(open.items));
      setLastClosed(closedMap);
      setLoaded(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los conteos"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const rows: Row[] = useMemo(
    () =>
      branches
        .map((branch) => {
          const open = current[branch.id] ?? null;
          const last = lastClosed[branch.id] ?? null;
          const step: Step = open
            ? "progress"
            : daysSince(last?.closedAt ?? last?.startedAt) > STALE_DAYS
              ? "due"
              : "ok";
          return { branch, step, current: open, last };
        })
        .sort((a, b) => {
          if (a.step !== b.step) return STEP_ORDER[a.step] - STEP_ORDER[b.step];
          // Por contar: primero la que lleva más tiempo sin contarse (o nunca).
          if (a.step === "due") {
            const ageA = daysSince(a.last?.closedAt);
            const ageB = daysSince(b.last?.closedAt);
            if (ageA !== ageB) return ageA > ageB ? -1 : 1;
          }
          return a.branch.name.localeCompare(b.branch.name);
        }),
    [branches, current, lastClosed]
  );

  // Llegó desde la tarjeta de una sucursal: continuar el que está en curso o
  // confirmar el inicio. El parámetro se quita para que no se repita al volver.
  useEffect(() => {
    if (!requestedBranch || !loaded) return;
    const row = rows.find((item) => item.branch.id === requestedBranch);
    router.replace(pathname);
    if (!row) return;
    if (row.current) router.push(`/supervisor/conteos/${row.current.id}`);
    else if (canStart) setStarting({ id: row.branch.id, name: row.branch.name, code: row.branch.code });
  }, [requestedBranch, loaded, rows, router, pathname, canStart]);

  const counts = useMemo(() => {
    const of = (step: Step) => rows.filter((row) => row.step === step).length;
    return { all: rows.length, progress: of("progress"), due: of("due"), ok: of("ok") };
  }, [rows]);

  const shown = rows.filter((row) => {
    if (filter !== "all" && row.step !== filter) return false;
    const term = search.trim().toLowerCase();
    return !term || `${row.branch.code} ${row.branch.name} ${row.branch.city ?? ""}`.toLowerCase().includes(term);
  });

  const filters: Array<{ key: Filter; label: string; className: string }> = [
    { key: "all", label: "Todas", className: "" },
    { key: "progress", label: "En curso", className: "is-step-draft" },
    { key: "due", label: "Por contar", className: "" },
    { key: "ok", label: "Contadas", className: "is-step-ok" },
  ];

  return (
    <div className="sup-page">
      <div className="sup-page-head">
        <div>
          <h1>Conteos de inventario</h1>
          <p>Cuenta 30 productos al azar de una sucursal, sin ver lo que dice el sistema.</p>
        </div>
        <button type="button" className="sup-icon-button" onClick={() => void load()} disabled={loading} aria-label="Actualizar">
          <RefreshCw size={18} className={loading ? "sup-spin" : undefined} />
        </button>
      </div>

      <div className="sup-summary" role="tablist" aria-label="Filtrar por estado">
        {filters.map(({ key, label, className }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`sup-summary-item ${className}${filter === key ? " is-active" : ""}`}
            onClick={() => setFilter(key)}
          >
            <b>{counts[key]}</b>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <label className="sup-search">
        <Search size={16} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar sucursal"
          aria-label="Buscar sucursal"
        />
      </label>

      {loading && !rows.length ? <p className="page-kicker">Cargando conteos…</p> : null}
      {!loading && !shown.length ? <p className="sup-empty">Ninguna sucursal en este filtro.</p> : null}

      <div className="sup-grid">
        {shown.map((row) => (
          <CountCard
            key={row.branch.id}
            row={row}
            canStart={canStart}
            onStart={(item) => setStarting({ id: item.branch.id, name: item.branch.name, code: item.branch.code })}
          />
        ))}
      </div>

      <StartCountDialog branch={starting} onClose={() => setStarting(null)} />
    </div>
  );
}
