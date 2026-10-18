"use client";

import Link from "next/link";
import { ChevronRight, ClipboardCheck, ClipboardList, ClipboardX, Clock, CloudUpload, UserRound } from "lucide-react";
import { INVENTORY_COUNT_STATUS } from "@glamouroso/shared/constants";
import { formatDateTime, relativeDays } from "../pos-labels";
import {
  COUNT_STATUS_LABELS,
  accuracyTone,
  countHref,
  percentLabel,
  signedMoney,
  type CountListRow,
} from "./count-labels";
import "./counts.css";

/**
 * Luz del conteo, hermana del foco de tienda: azul con ondas mientras está en
 * curso; ya cerrado, verde/ámbar/rojo según la exactitud; gris si se canceló.
 */
export function CountStatusLight({ status, accuracy }: { status: string; accuracy: number | null | undefined }) {
  const tone =
    status === INVENTORY_COUNT_STATUS.IN_PROGRESS
      ? "progress"
      : status === INVENTORY_COUNT_STATUS.CANCELLED
        ? "cancelled"
        : accuracyTone(accuracy);
  const Icon =
    status === INVENTORY_COUNT_STATUS.IN_PROGRESS
      ? ClipboardList
      : status === INVENTORY_COUNT_STATUS.CANCELLED
        ? ClipboardX
        : ClipboardCheck;
  return (
    <span className={`store-light count-light is-${tone}`}>
      <span className="store-light-dot">
        <Icon size={16} />
      </span>
      <span className="store-light-label">{COUNT_STATUS_LABELS[status] ?? status}</span>
    </span>
  );
}

function RowStat({
  label,
  value,
  note,
  total,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  total?: boolean;
  className?: string;
}) {
  return (
    <span className={`pos-day-stat${total ? " is-total" : ""}`}>
      <small>{label}</small>
      <b className={className}>{value}</b>
      {note ? <em>{note}</em> : null}
    </span>
  );
}

/**
 * Un conteo como tarjeta: sucursal y cuándo, quién lo hizo y en qué va, y a la
 * derecha renglones, exactitud y merma. Toda la tarjeta abre el detalle.
 */
export function CountCard({ count }: { count: CountListRow }) {
  const inProgress = count.status === INVENTORY_COUNT_STATUS.IN_PROGRESS;
  const cancelled = count.status === INVENTORY_COUNT_STATUS.CANCELLED;
  const counted = count.countedItems ?? 0;
  const total = count.totalItems ?? 0;
  const net = count.netVarianceAmount;
  const seesAmounts = net !== null && net !== undefined;
  const reverted = count.revertedItems ?? 0;

  return (
    <section className={`pos-day pos-cut pos-branch count-card is-${count.status}`}>
      <Link href={countHref(count.id)} className="pos-day-head">
        <CountStatusLight status={count.status} accuracy={count.accuracy} />
        <span className="pos-day-date">
          <span className="pos-day-weekday">
            {count.branch ? `${count.branch.code} · ${count.branch.name}` : "Sucursal"}
            {count.pendingSync ? <span className="pos-day-badge count-sync-badge">Ventas por subir</span> : null}
          </span>
          <span className="pos-day-fulldate">
            {formatDateTime(count.startedAt)} · {relativeDays(count.startedAt)}
          </span>
        </span>
        <span className="pos-branch-status">
          <span>
            <UserRound size={15} className="pos-branch-status-icon" />
            <span>
              Contó <strong>{count.startedByUser?.name ?? "—"}</strong>
            </span>
          </span>
          <span>
            <Clock size={15} className="pos-branch-status-icon" />
            {inProgress ? (
              <span>
                <strong style={{ color: "#0284c7" }}>Contando</strong>
                <span className="pos-branch-muted">
                  {" "}
                  · {counted} de {total} renglones
                </span>
              </span>
            ) : cancelled ? (
              <span className="pos-branch-muted">
                Cancelado {formatDateTime(count.cancelledAt ?? count.closedAt)} · sin tocar el inventario
              </span>
            ) : (
              <span>
                Cerrado {formatDateTime(count.closedAt)}
                {reverted ? (
                  <span className="pos-branch-muted">
                    {" "}
                    · {reverted} {reverted === 1 ? "ajuste revertido" : "ajustes revertidos"}
                  </span>
                ) : null}
              </span>
            )}
          </span>
          {count.pendingSync ? (
            <span className="count-sync-note">
              <CloudUpload size={15} className="pos-branch-status-icon" />
              <span>La caja tenía ventas sin subir: la diferencia se recalcula al sincronizar</span>
            </span>
          ) : null}
        </span>
        <span className="pos-day-stats">
          <RowStat
            label="Renglones"
            value={inProgress || cancelled ? `${counted}/${total}` : String(total)}
            note={inProgress || cancelled ? "contados" : "ajustados al cerrar"}
          />
          <RowStat label="Exactitud" value={percentLabel(count.accuracy)} note="en tolerancia" />
          {seesAmounts ? (
            <RowStat
              label="Merma neta"
              value={inProgress || cancelled ? "—" : signedMoney(net)}
              note="precio de tienda"
              total
              className={!inProgress && !cancelled && Number(net) < 0 ? "count-negative" : undefined}
            />
          ) : null}
        </span>
        <ChevronRight size={18} className="pos-branch-go" aria-hidden />
      </Link>
    </section>
  );
}
