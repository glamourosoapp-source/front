"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@mui/material";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { WEEKDAY_KEYS, type Branch, type StoreDayView } from "@glamouroso/shared";
import { DataTable } from "@/components/ui/DataTable";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { StoreDayFlags, storeTime } from "../BranchStoreTodayCell";
import { FilterBar, FilterMeta } from "../FilterBar";

const WEEKDAY_SHORT: Record<string, string> = {
  sunday: "Dom",
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mié",
  thursday: "Jue",
  friday: "Vie",
  saturday: "Sáb",
};

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const text = new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Lun–Sáb 9:00–19:00 · Dom cerrado", agrupando días iguales seguidos. */
export function scheduleSummary(hours: Branch["openingHours"]): string {
  const parts: string[] = [];
  const order = [...WEEKDAY_KEYS.slice(1), WEEKDAY_KEYS[0]];
  let i = 0;
  while (i < order.length) {
    const day = hours?.[order[i]!];
    const text = day ? `${day.open}–${day.close}` : "cerrado";
    let j = i;
    while (j + 1 < order.length) {
      const next = hours?.[order[j + 1]!];
      if ((next ? `${next.open}–${next.close}` : "cerrado") !== text) break;
      j += 1;
    }
    const range = i === j ? WEEKDAY_SHORT[order[i]!] : `${WEEKDAY_SHORT[order[i]!]}–${WEEKDAY_SHORT[order[j]!]}`;
    parts.push(`${range} ${text}`);
    i = j + 1;
  }
  return parts.join(" · ");
}

/**
 * Aperturas y cierres de tienda día por día (últimos 30 días): a qué hora abrió
 * y cerró, quién, si se reabrió o se registró sin internet, y las marcas contra
 * el horario de la sucursal.
 */
export function BranchStoreDaysTab({ branch }: { branch: Branch }) {
  const [days, setDays] = useState<StoreDayView[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDays(await httpClient.get<StoreDayView[]>(`/pos/branches/${branch.id}/store-days`));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar las aperturas"));
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasSchedule = Object.values(branch.openingHours ?? {}).some(Boolean);
  const flagged = days.filter((day) => day.flags.length).length;

  return (
    <div className="page-stack">
      <FilterBar>
        <FilterMeta>
          {hasSchedule ? (
            <>
              Horario: <strong>{scheduleSummary(branch.openingHours)}</strong> · 15 min de tolerancia
            </>
          ) : (
            <>Sin horario: captúralo en &quot;Editar datos&quot; para marcar aperturas tarde y cierres temprano.</>
          )}
        </FilterMeta>
        <FilterMeta>
          <strong>{flagged}</strong> {flagged === 1 ? "día con marca" : "días con marca"} en el periodo
        </FilterMeta>
        <Button size="small" startIcon={<RefreshCw size={14} />} onClick={() => void load()} disabled={loading}>
          Actualizar
        </Button>
      </FilterBar>

      {days.length ? (
        <DataTable
          rows={days}
          getKey={(row: StoreDayView) => row.date}
          columns={[
            {
              key: "date",
              label: "Día",
              render: (row: StoreDayView) => (
                <span style={{ fontWeight: 600 }}>{dayLabel(row.date)}</span>
              ),
            },
            {
              key: "hours",
              label: "Horario",
              render: (row: StoreDayView) => (row.hours ? `${row.hours.open}–${row.hours.close}` : row.hasSchedule ? "Descanso" : "—"),
            },
            { key: "opened", label: "Abrió", render: (row: StoreDayView) => <strong>{storeTime(row.openedAt)}</strong> },
            {
              key: "closed",
              label: "Cerró",
              render: (row: StoreDayView) =>
                row.status === "open" ? <span style={{ color: "#2e7d32", fontWeight: 600 }}>Abierta</span> : storeTime(row.closedAt),
            },
            {
              key: "flags",
              label: "Marcas",
              render: (row: StoreDayView) =>
                row.flags.length ? <StoreDayFlags day={row} /> : <span style={{ color: "#2e7d32" }}>✓</span>,
            },
            {
              key: "events",
              label: "Registro",
              render: (row: StoreDayView) =>
                row.events.length ? (
                  <span className="page-kicker" style={{ margin: 0 }}>
                    {row.events
                      .map(
                        (event, index) =>
                          `${event.kind === "opened" ? (index === 0 ? "Abrió" : "Reabrió") : "Cerró"} ${storeTime(event.occurredAt)}${
                            event.user ? ` (${event.user.name})` : ""
                          }${event.recordedOffline ? " · sin internet" : ""}`
                      )
                      .join(" → ")}
                  </span>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      ) : null}
      {loading && !days.length ? <p className="page-kicker">Cargando...</p> : null}
    </div>
  );
}
