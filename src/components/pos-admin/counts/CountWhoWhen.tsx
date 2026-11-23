"use client";

import { CalendarClock, CircleStop, Hourglass, UserRound } from "lucide-react";
import { INVENTORY_COUNT_STATUS } from "@glamouroso/shared/constants";
import type { InventoryCount } from "@glamouroso/shared";
import { businessDayOf, formatBusinessDayLong, formatBusinessTime } from "../pos-labels";

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** "Lunes, 10 de noviembre de 2026" en la zona del negocio. */
function dayLabel(value: string | null | undefined): string {
  const day = businessDayOf(value);
  return day ? formatBusinessDayLong(day) : "—";
}

/** "1 h 25 min", "12 min", "menos de 1 min". */
function durationLabel(fromIso: string | null | undefined, toIso: string | null | undefined): string {
  if (!fromIso || !toIso) return "—";
  const minutes = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 1) return "menos de 1 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Quién contó y cuándo, en cuatro bloques: la persona (y quién cerró si fue
 * otra), el inicio, el cierre (o "en curso" / "cancelado") y cuánto duró, con
 * la hora de la primera y la última captura de renglones.
 */
export function CountWhoWhen({ count }: { count: InventoryCount }) {
  const inProgress = count.status === INVENTORY_COUNT_STATUS.IN_PROGRESS;
  const cancelled = count.status === INVENTORY_COUNT_STATUS.CANCELLED;
  const endAt = cancelled ? (count.cancelledAt ?? count.closedAt) : count.closedAt;
  const starter = count.startedByUser?.name ?? "Sin registro";
  const closer = count.closedByUser?.name;
  const closedByOther = !!closer && count.closedByUser?.id !== count.startedByUser?.id;

  const captures = (count.items ?? [])
    .flatMap((item) => [item.countedAt, item.recountedAt])
    .filter((value): value is string => !!value)
    .sort();
  const firstCapture = captures[0];
  const lastCapture = captures.at(-1);
  const now = new Date().toISOString();

  return (
    <section className="count-who">
      <div className="count-who-block is-person">
        <span className="count-who-avatar" aria-hidden>
          {initials(count.startedByUser?.name)}
        </span>
        <span className="count-who-text">
          <small>
            <UserRound size={13} aria-hidden /> Contó
          </small>
          <b>{starter}</b>
          <em>{closedByOther ? `Lo cerró ${closer}` : inProgress ? "Contando ahora" : "Inició y cerró el conteo"}</em>
        </span>
      </div>

      <div className="count-who-block">
        <span className="count-who-text">
          <small>
            <CalendarClock size={13} aria-hidden /> Inicio
          </small>
          <b>{formatBusinessTime(count.startedAt)}</b>
          <em>{dayLabel(count.startedAt)}</em>
        </span>
      </div>

      <div className="count-who-block">
        <span className="count-who-text">
          <small>
            <CircleStop size={13} aria-hidden /> {cancelled ? "Cancelado" : "Cierre"}
          </small>
          {inProgress ? (
            <>
              <b className="is-live">En curso</b>
              <em>Todavía no se cierra</em>
            </>
          ) : (
            <>
              <b className={cancelled ? "is-muted" : undefined}>{formatBusinessTime(endAt)}</b>
              <em>
                {businessDayOf(endAt) && businessDayOf(endAt) === businessDayOf(count.startedAt)
                  ? "El mismo día"
                  : dayLabel(endAt)}
              </em>
            </>
          )}
        </span>
      </div>

      <div className="count-who-block">
        <span className="count-who-text">
          <small>
            <Hourglass size={13} aria-hidden /> Duración
          </small>
          <b>{durationLabel(count.startedAt, inProgress ? now : endAt)}</b>
          <em>
            {firstCapture
              ? `Capturas de ${formatBusinessTime(firstCapture)} a ${formatBusinessTime(lastCapture)}`
              : "Sin renglones capturados"}
          </em>
        </span>
      </div>
    </section>
  );
}
