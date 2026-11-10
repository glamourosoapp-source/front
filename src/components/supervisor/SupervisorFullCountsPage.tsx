"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, CloudCheck, EyeOff, ListChecks, RefreshCw, Search, Store, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { BRANCH_TYPES, INVENTORY_COUNT_KINDS, INVENTORY_COUNT_STATUS } from "@glamouroso/shared/constants";
import type { InventoryCount } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatDateTime, relativeDays } from "@/components/pos-admin/pos-labels";
import { usePermissions } from "@/lib/permissions";
import { useSupervisorScope } from "@/lib/supervisor-scope";
import type { Branch, ListResponse } from "@/types";
import { CountDialog } from "./CountDialog";
import type { CountBranch } from "./StartCountDialog";
import { accuracyPercent, countProgress, itemsWithDifference } from "./supervisor-counts";
import { fullCountHref, percentOf } from "./full-count";

/**
 * - `progress`: inventario completo en curso;
 * - `blocked`: tiene un conteo cíclico abierto (uno solo por sucursal);
 * - `never`: nunca se le ha hecho inventario completo;
 * - `done`: ya tiene uno cerrado.
 */
type Step = "progress" | "blocked" | "never" | "done";
type Filter = "all" | "progress" | "never" | "done";

const STEP_ORDER: Record<Step, number> = { progress: 0, blocked: 1, never: 2, done: 3 };
const STEP_LABELS: Record<Step, string> = {
  progress: "En curso",
  blocked: "Conteo cíclico abierto",
  never: "Sin inventario",
  done: "Hecho",
};
const STEP_CLASS: Record<Step, string> = { progress: "is-step-draft", blocked: "is-step-transit", never: "", done: "is-step-ok" };

interface Row {
  branch: Branch;
  step: Step;
  open: InventoryCount | null;
  last: InventoryCount | null;
}

function FullCountCard({ row, canStart, onStart }: { row: Row; canStart: boolean; onStart: (row: Row) => void }) {
  const { branch, step, open, last } = row;
  const progress = open && step === "progress" ? countProgress(open) : null;
  const differences = last ? itemsWithDifference(last) : null;
  const accuracy = last ? accuracyPercent(last.accuracy) : null;

  return (
    <article className={`sup-card sup-order supi-card is-${step}`}>
      <div className="sup-branch-head">
        <span className={`sup-light ${STEP_CLASS[step]}`} aria-hidden>
          <Warehouse size={16} />
        </span>
        <div className="sup-branch-name">
          <strong>{branch.name}</strong>
          <small>{[branch.code, branch.city].filter(Boolean).join(" · ")}</small>
        </div>
        <span className={`sup-pill ${STEP_CLASS[step]}`}>{STEP_LABELS[step]}</span>
      </div>

      <div className="supc-card-lines">
        {progress ? (
          <div className="supc-card-progress">
            <p>
              <strong>
                {progress.counted} de {progress.total} contados
              </strong>{" "}
              <span className="supc-muted">· {percentOf(progress.counted, progress.total)} %</span>
            </p>
            <span className="supi-bar is-small" aria-hidden>
              <span className="is-done" style={{ width: `${percentOf(progress.counted, progress.total)}%` }} />
            </span>
            <p className="supc-muted">
              Empezó {relativeDays(open!.startedAt)}
              {open!.startedByUser?.name ? ` · ${open!.startedByUser.name}` : ""}
            </p>
          </div>
        ) : null}
        {step === "blocked" ? (
          <p className="supc-muted">Termina o cancela el conteo cíclico para iniciar el inventario completo.</p>
        ) : null}
        {last ? (
          <p className="supc-card-last">
            <span>
              Último inventario {relativeDays(last.closedAt ?? last.startedAt)} · {last.totalItems ?? "—"} productos
              {differences !== null ? (differences ? ` · ${differences} con diferencia` : " · sin diferencias") : ""}
            </span>
            {accuracy !== null ? (
              <span className={`supc-accuracy${accuracy >= 95 ? " is-ok" : accuracy >= 80 ? " is-mid" : " is-low"}`}>
                {accuracy} % exacto
              </span>
            ) : null}
          </p>
        ) : step !== "progress" ? (
          <p className="supc-muted">Nunca se le ha hecho inventario completo</p>
        ) : null}
      </div>

      <div className="sup-card-links">
        {step === "progress" && open ? (
          <Link href={fullCountHref(open.id)} className="sup-card-link">
            Continuar inventario
            <ChevronRight size={16} />
          </Link>
        ) : step === "blocked" && open ? (
          <Link href={`/supervisor/conteos/${open.id}`} className="sup-card-link">
            Ir al conteo cíclico
            <ChevronRight size={16} />
          </Link>
        ) : canStart ? (
          <button type="button" className="sup-card-link" onClick={() => onStart(row)}>
            {last ? "Iniciar otro inventario" : "Iniciar inventario completo"}
            <ChevronRight size={16} />
          </button>
        ) : null}
        {last ? (
          <Link href={fullCountHref(last.id)} className="sup-card-link">
            Ver el último ({formatDateTime(last.closedAt)})
            <ChevronRight size={16} />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function StartFullCountDialog({ branch, onClose }: { branch: CountBranch | null; onClose: () => void }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (branch) setStarting(false);
  }, [branch]);

  const start = async () => {
    if (!branch) return;
    setStarting(true);
    try {
      const count = await httpClient.post<InventoryCount>("/pos/counts", {
        branchId: branch.id,
        kind: INVENTORY_COUNT_KINDS.FULL,
      });
      router.push(fullCountHref(count.id));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo iniciar el inventario"));
      setStarting(false);
    }
  };

  const steps = [
    {
      icon: ListChecks,
      title: "Todos los productos de la tienda",
      text: "Lo que tiene existencia, Stock o venta reciente, acomodado por categoría.",
    },
    {
      icon: CloudCheck,
      title: "Se registra al momento",
      text: "Cada producto que cuentas ya queda en el inventario de la sucursal. Puedes salir y continuar después.",
    },
    {
      icon: EyeOff,
      title: "Conteo ciego",
      text: "No verás lo que dice el sistema: anota solo lo que cuentas.",
    },
  ];

  return (
    <CountDialog
      open={Boolean(branch)}
      onClose={onClose}
      busy={starting}
      icon={Warehouse}
      title="Iniciar inventario completo"
      subtitle={
        branch ? (
          <>
            {branch.code ? <span className="supd-code">{branch.code}</span> : null}
            {branch.name}
          </>
        ) : null
      }
      actions={
        <>
          <button type="button" className="supd-btn" onClick={onClose} disabled={starting}>
            Ahora no
          </button>
          <button type="button" className="supd-btn is-primary" onClick={() => void start()} disabled={starting}>
            <Warehouse size={18} />
            {starting ? "Armando la lista…" : "Iniciar inventario"}
          </button>
        </>
      }
    >
      <ol className="supd-steps">
        {steps.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <span aria-hidden>
              <Icon size={18} />
            </span>
            <div>
              <strong>{title}</strong>
              <small>{text}</small>
            </div>
          </li>
        ))}
      </ol>
      <p className="supd-note">
        <Store size={16} />
        La tienda puede seguir vendiendo: cada producto se compara con lo que había a la hora en que lo contaste.
      </p>
    </CountDialog>
  );
}

/**
 * Inventarios completos para el supervisor: cada sucursal con su inventario
 * en curso, si nunca se ha hecho y el último cerrado. Desde aquí se inicia
 * (todo lo vivo de la sucursal) o se continúa.
 */
export function SupervisorFullCountsPage() {
  const { allows } = useSupervisorScope();
  const { can } = usePermissions();
  const canStart = can("posCounts", "create");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [open, setOpen] = useState<Record<string, InventoryCount>>({});
  const [lastClosed, setLastClosed] = useState<Record<string, InventoryCount>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState<CountBranch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [branchList, inProgress, closed] = await Promise.all([
        httpClient.get<ListResponse<Branch>>("/pos/branches", { limit: 200, isActive: "true" }),
        // Abiertos de los dos tipos: un cíclico abierto impide iniciar el completo.
        httpClient.get<ListResponse<InventoryCount>>("/pos/counts", {
          status: INVENTORY_COUNT_STATUS.IN_PROGRESS,
          limit: 200,
        }),
        httpClient.get<ListResponse<InventoryCount>>("/pos/counts", {
          status: INVENTORY_COUNT_STATUS.CLOSED,
          kind: INVENTORY_COUNT_KINDS.FULL,
          limit: 200,
        }),
      ]);
      const stores = branchList.items.filter(
        (branch) => branch.type === BRANCH_TYPES.BRANCH && allows("counts", branch.id)
      );
      const byBranch = (list: InventoryCount[]) => {
        const map: Record<string, InventoryCount> = {};
        for (const count of list) if (!map[count.branchId]) map[count.branchId] = count;
        return map;
      };
      setBranches(stores);
      setOpen(byBranch(inProgress.items));
      setLastClosed(byBranch(closed.items));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los inventarios"));
    } finally {
      setLoading(false);
    }
  }, [allows]);

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
          const current = open[branch.id] ?? null;
          const last = lastClosed[branch.id] ?? null;
          const step: Step = current
            ? current.kind === INVENTORY_COUNT_KINDS.FULL
              ? "progress"
              : "blocked"
            : last
              ? "done"
              : "never";
          return { branch, step, open: current, last };
        })
        .sort((a, b) => {
          if (a.step !== b.step) return STEP_ORDER[a.step] - STEP_ORDER[b.step];
          // Hechas: primero la que lleva más tiempo sin inventario.
          if (a.step === "done" && a.last && b.last) {
            const diff = new Date(a.last.closedAt ?? 0).getTime() - new Date(b.last.closedAt ?? 0).getTime();
            if (diff) return diff;
          }
          return a.branch.name.localeCompare(b.branch.name);
        }),
    [branches, open, lastClosed]
  );

  const totals = useMemo(() => {
    const of = (step: Step) => rows.filter((row) => row.step === step).length;
    return { all: rows.length, progress: of("progress"), never: of("never") + of("blocked"), done: of("done") };
  }, [rows]);

  const shown = rows.filter((row) => {
    if (filter === "progress" && row.step !== "progress") return false;
    if (filter === "never" && row.step !== "never" && row.step !== "blocked") return false;
    if (filter === "done" && row.step !== "done") return false;
    const term = search.trim().toLowerCase();
    return !term || `${row.branch.code} ${row.branch.name} ${row.branch.city ?? ""}`.toLowerCase().includes(term);
  });

  const filters: Array<{ key: Filter; label: string; className: string }> = [
    { key: "all", label: "Todas", className: "" },
    { key: "progress", label: "En curso", className: "is-step-draft" },
    { key: "never", label: "Sin inventario", className: "" },
    { key: "done", label: "Hechas", className: "is-step-ok" },
  ];

  return (
    <div className="sup-page">
      <div className="sup-page-head">
        <div>
          <h1>Inventarios completos</h1>
          <p>Cuenta todos los productos de una sucursal, categoría por categoría, sin ver lo que dice el sistema.</p>
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
            <b>{totals[key]}</b>
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

      {loading && !rows.length ? <p className="page-kicker">Cargando inventarios…</p> : null}
      {!loading && !shown.length ? <p className="sup-empty">Ninguna sucursal en este filtro.</p> : null}

      <div className="sup-grid">
        {shown.map((row) => (
          <FullCountCard
            key={row.branch.id}
            row={row}
            canStart={canStart}
            onStart={(item) => setStarting({ id: item.branch.id, name: item.branch.name, code: item.branch.code })}
          />
        ))}
      </div>

      <StartFullCountDialog branch={starting} onClose={() => setStarting(null)} />
    </div>
  );
}
