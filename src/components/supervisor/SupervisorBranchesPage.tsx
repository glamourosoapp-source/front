"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Clock, RefreshCw, Search, Store } from "lucide-react";
import { toast } from "sonner";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import type { StoreDayEvaluation } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { storeTime } from "@/components/pos-admin/BranchStoreTodayCell";
import type { BranchStats } from "@/types";

type Filter = "all" | "open" | "closed" | "not_opened";

/** Cada cuánto se vuelve a pedir la lista: la apertura y el cierre no avisan en vivo. */
const REFRESH_MS = 60_000;

const ORDER: Record<string, number> = { open: 0, closed: 1, not_opened: 2 };

/** "9:00" → "9:00 a. m.", con el mismo formato que las horas de apertura. */
function scheduleTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const at = new Date();
  at.setHours(h ?? 0, m ?? 0, 0, 0);
  return at.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
}

function statusLabel(day: StoreDayEvaluation | null): string {
  if (!day) return "Sin datos";
  if (day.status === "open") return "Abierta";
  if (day.status === "closed") return "Cerrada";
  return day.hasSchedule && !day.hours ? "Descanso" : "Sin abrir";
}

function BranchCard({ row }: { row: BranchStats }) {
  const day = row.storeToday;
  const status = day?.status ?? "not_opened";
  return (
    <article className={`sup-card sup-branch is-${status}`}>
      <div className="sup-branch-head">
        <span className={`sup-light is-${status}`} aria-hidden>
          <Store size={16} />
        </span>
        <div className="sup-branch-name">
          <strong>{row.name}</strong>
          <small>{[row.code, row.city].filter(Boolean).join(" · ")}</small>
        </div>
        <span className={`sup-pill is-${status}`}>{statusLabel(day)}</span>
      </div>

      <dl className="sup-times">
        <div>
          <dt>Abrió</dt>
          <dd>{day?.openedAt ? storeTime(day.openedAt) : "—"}</dd>
        </div>
        <div>
          <dt>Cerró</dt>
          <dd>{day?.status === "closed" ? storeTime(day.closedAt) : day?.status === "open" ? "Abierta" : "—"}</dd>
        </div>
        <div>
          <dt>Horario</dt>
          <dd className="is-muted">
            {day?.hours
              ? `${scheduleTime(day.hours.open)} – ${scheduleTime(day.hours.close)}`
              : day?.hasSchedule
                ? "No abre hoy"
                : "Sin horario"}
          </dd>
        </div>
      </dl>

      {day && (day.flags.length || day.reopenCount) ? (
        <div className="sup-flags">
          {day.flags.map((flag) => (
            <span key={flag.code} className="sup-flag">
              <AlertTriangle size={12} />
              {flag.label}
            </span>
          ))}
          {day.reopenCount ? (
            <span className="sup-flag is-muted">
              Reabrió {day.reopenCount} {day.reopenCount === 1 ? "vez" : "veces"}
            </span>
          ) : null}
        </div>
      ) : null}

      <Link href={`/supervisor/pedidos/${row.branchId}`} className="sup-card-link">
        Pedido a fábrica
        <ChevronRight size={16} />
      </Link>
    </article>
  );
}

/**
 * Sucursales de hoy para el supervisor de caja: abiertas primero (con su hora
 * de apertura), luego las cerradas (apertura y cierre) y al final las que no
 * han abierto, con su horario. Se refresca sola cada minuto.
 */
export function SupervisorBranchesPage() {
  const [rows, setRows] = useState<BranchStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await httpClient.get<BranchStats[]>("/pos/branches/stats", { type: BRANCH_TYPES.BRANCH });
      setRows(list.filter((row) => row.isActive));
      setUpdatedAt(new Date());
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar las sucursales"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      open: rows.filter((row) => row.storeToday?.status === "open").length,
      closed: rows.filter((row) => row.storeToday?.status === "closed").length,
      not_opened: rows.filter((row) => (row.storeToday?.status ?? "not_opened") === "not_opened").length,
    }),
    [rows]
  );

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => filter === "all" || (row.storeToday?.status ?? "not_opened") === filter)
      .filter((row) => !term || `${row.code} ${row.name} ${row.city ?? ""}`.toLowerCase().includes(term))
      .sort((a, b) => {
        const sa = a.storeToday?.status ?? "not_opened";
        const sb = b.storeToday?.status ?? "not_opened";
        if (sa !== sb) return (ORDER[sa] ?? 3) - (ORDER[sb] ?? 3);
        // Abiertas y cerradas: la que abrió primero arriba. Sin abrir: la que debía abrir antes.
        const ka = sa === "not_opened" ? (a.storeToday?.hours?.open ?? "99") : (a.storeToday?.openedAt ?? "");
        const kb = sb === "not_opened" ? (b.storeToday?.hours?.open ?? "99") : (b.storeToday?.openedAt ?? "");
        return ka.localeCompare(kb) || a.name.localeCompare(b.name);
      });
  }, [rows, filter, search]);

  const today = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "Todas" },
    { key: "open", label: "Abiertas" },
    { key: "closed", label: "Cerradas" },
    { key: "not_opened", label: "Sin abrir" },
  ];

  return (
    <div className="sup-page">
      <div className="sup-page-head">
        <div>
          <h1>Sucursales hoy</h1>
          <p>
            <span className="sup-capitalize">{today}</span>
            {updatedAt ? (
              <span className="sup-updated">
                Actualizado {updatedAt.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" })}
              </span>
            ) : null}
          </p>
        </div>
        <button type="button" className="sup-icon-button" onClick={() => void load()} disabled={loading} aria-label="Actualizar">
          <RefreshCw size={18} className={loading ? "sup-spin" : undefined} />
        </button>
      </div>

      <div className="sup-summary" role="tablist" aria-label="Filtrar por estado">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`sup-summary-item is-${key}${filter === key ? " is-active" : ""}`}
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

      {loading && !rows.length ? <p className="page-kicker">Cargando sucursales…</p> : null}
      {!loading && !shown.length ? (
        <p className="sup-empty">
          <Clock size={18} />
          {rows.length ? "Ninguna sucursal en este filtro." : "No hay sucursales activas."}
        </p>
      ) : null}

      <div className="sup-grid">
        {shown.map((row) => (
          <BranchCard key={row.branchId} row={row} />
        ))}
      </div>
    </div>
  );
}
