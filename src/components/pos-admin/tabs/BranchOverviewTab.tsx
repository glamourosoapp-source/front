"use client";

import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  Inbox,
  MapPin,
  Package,
  Phone,
  Printer,
  Receipt,
  Store,
  StickyNote,
  Truck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { BranchHealthSignal } from "@glamouroso/shared";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import { formatMoney } from "@/lib/format-money";
import type { Branch, BranchStats } from "@/types";
import { BranchHealthSignals } from "../BranchHealthChip";
import {
  BRANCH_TYPE_COPY,
  HEALTH_BG,
  HEALTH_COLORS,
  WEEKDAY_LABELS,
  formatDateTime,
  relativeDays,
  salesPeriodLabels,
} from "../pos-labels";

interface BranchOverviewTabProps {
  branch: Branch;
  stats: BranchStats;
}

/** La pestaña del detalle donde se resuelve cada señal de salud. */
function signalHref(branchId: string, code: BranchHealthSignal["code"]): string | null {
  const base = `${BRANCH_TYPE_COPY.branch.listHref}/${branchId}`;
  switch (code) {
    case "stale_restock":
    case "no_recent_orders":
      return `${base}?tab=pedidos`;
    case "sales_drop":
    case "no_recent_sales":
      return `${base}?tab=ventas`;
    case "sync_pending":
    case "sync_offline":
    case "sync_rejected":
    case "clock_skew":
      return `${base}?tab=caja`;
    default:
      return null;
  }
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <small>Sin base de comparación</small>;
  const ratio = (current - previous) / previous;
  const pct = Math.round(Math.abs(ratio) * 100);
  const up = ratio >= 0;
  return (
    <small style={{ color: up ? "#15803d" : "#c62828" }}>
      {up ? "▲" : "▼"} {pct}% vs. los 30 días anteriores
    </small>
  );
}

/** Fechas que abarca la tarjeta, en gris bajo la etiqueta. */
function Period({ children }: { children: string }) {
  return (
    <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 13, fontWeight: 400 }}>{children}</div>
  );
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * Métrica compacta: ícono, etiqueta, valor y una línea de contexto. Con `href`
 * toda la tarjeta lleva a donde se resuelve (p. ej. inventario bajo su stock).
 */
function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  muted,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
  muted?: boolean;
  href?: string;
}) {
  const accent = tone === "warning" ? HEALTH_COLORS.warning : undefined;
  const body = (
    <>
      <div
        className="stat-tile-icon"
        style={accent ? { background: HEALTH_BG.warning, color: accent } : undefined}
      >
        <Icon size={18} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="stat-tile-label">{label}</div>
        <div className="stat-tile-value" style={{ color: accent ?? (muted ? "var(--muted)" : undefined) }}>
          {value}
        </div>
        {hint ? <div className="stat-tile-hint">{hint}</div> : null}
      </div>
      {href ? <ChevronRight size={16} style={{ color: "var(--muted)", alignSelf: "center" }} /> : null}
    </>
  );
  return href ? (
    <Link href={href} className="stat-tile stat-tile-link">
      {body}
    </Link>
  ) : (
    <div className="stat-tile">{body}</div>
  );
}

/** Renglón de ficha: ícono + etiqueta arriba + valor; sin valor, un texto gris. */
function InfoRow({
  icon: Icon,
  label,
  value,
  empty = "—",
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  empty?: string;
}) {
  return (
    <div className="info-row">
      <Icon size={16} className="info-row-icon" />
      <div style={{ minWidth: 0 }}>
        <div className="stat-tile-label">{label}</div>
        <div className={value ? "info-row-value" : "info-row-value is-empty"}>{value ?? empty}</div>
      </div>
    </div>
  );
}

/**
 * Resumen de la sucursal: lo que el administrador quiere saber en 10 segundos.
 * Ventas por periodo (con el permiso de reportes), salud con sus señales,
 * surtido y los datos de contacto.
 */
export function BranchOverviewTab({ branch, stats }: BranchOverviewTabProps) {
  const isFranchise = branch.type === BRANCH_TYPES.FRANCHISE;
  const sales = stats.sales;
  const periods = salesPeriodLabels();
  const ticket = (branch.ticketSettings ?? {}) as Record<string, unknown>;
  const address = [branch.street, branch.colony, branch.city, branch.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="page-stack">
      {!isFranchise && sales ? (
        <section className="grid grid-4">
          <div className="card metric">
            <div className="metric-head">
              <div>
                <span>Hoy</span>
                <Period>{periods.today}</Period>
              </div>
              <div className="metric-icon">
                <Wallet size={22} />
              </div>
            </div>
            <strong>{formatMoney(sales.today.total)}</strong>
            <small>
              {sales.today.tickets} tickets · promedio {formatMoney(sales.today.avgTicket)}
            </small>
          </div>
          <div className="card metric">
            <div className="metric-head">
              <div>
                <span>Semana (vie–jue)</span>
                <Period>{periods.week}</Period>
              </div>
              <div className="metric-icon">
                <Receipt size={22} />
              </div>
            </div>
            <strong>{formatMoney(sales.week.total)}</strong>
            <small>
              {sales.week.tickets} tickets · promedio {formatMoney(sales.week.avgTicket)}
            </small>
          </div>
          <div className="card metric">
            <div className="metric-head">
              <div>
                <span>Mes</span>
                <Period>{periods.month}</Period>
              </div>
              <div className="metric-icon">
                <Calculator size={22} />
              </div>
            </div>
            <strong>{formatMoney(sales.month.total)}</strong>
            <small>
              {sales.month.tickets} tickets · promedio {formatMoney(sales.month.avgTicket)}
            </small>
          </div>
          <div className="card metric">
            <div className="metric-head">
              <div>
                <span>Últimos 30 días</span>
                <Period>{periods.last30}</Period>
              </div>
              <div className="metric-icon">
                <Users size={22} />
              </div>
            </div>
            <strong>{formatMoney(sales.last30.total)}</strong>
            <Delta current={sales.last30.total} previous={sales.prev30.total} />
          </div>
        </section>
      ) : null}

      <section className="panel p-5">
        <h2>Salud de la {isFranchise ? "franquicia" : "sucursal"}</h2>
        <div style={{ marginTop: 12 }}>
          <BranchHealthSignals
            health={stats.health}
            hrefFor={isFranchise ? undefined : (code) => signalHref(branch.id, code)}
          />
        </div>
        <div className={`stat-tiles ${isFranchise ? "cols-2" : "cols-3"}`} style={{ marginTop: 16 }}>
          {!isFranchise && sales ? (
            <>
              <StatTile
                icon={Wallet}
                label="Ticket promedio del mes"
                value={formatMoney(sales.month.avgTicket)}
                hint={`${sales.month.tickets} tickets este mes`}
              />
              <StatTile
                icon={Clock}
                label="Última venta"
                value={sales.lastSaleAt ? capitalize(relativeDays(sales.lastSaleAt)) : "Sin ventas"}
                hint={sales.lastSaleAt ? formatDateTime(sales.lastSaleAt) : "Aún no cobra su primer ticket"}
                muted={!sales.lastSaleAt}
              />
              <StatTile icon={Users} label="Clientes registrados" value={String(sales.customersCount)} />
              <StatTile icon={Receipt} label="Tickets históricos" value={String(sales.lifetimeTickets)} />
            </>
          ) : null}
          {!isFranchise && stats.inventory ? (
            <StatTile
              icon={Package}
              label="Bajo su stock"
              value={stats.inventory.belowMinCount ? `${stats.inventory.belowMinCount} productos` : "Ninguno"}
              hint={`de ${stats.inventory.trackedCount} con stock definido`}
              tone={stats.inventory.belowMinCount ? "warning" : undefined}
              href={
                stats.inventory.belowMinCount
                  ? `${BRANCH_TYPE_COPY.branch.listHref}/${branch.id}?tab=inventario&bajo=1`
                  : undefined
              }
            />
          ) : null}
          <StatTile icon={UserCog} label="Usuarios asignados" value={String(stats.usersCount)} />
        </div>
      </section>

      <section className="panel p-5">
        <div className="toolbar" style={{ marginBottom: 0, flexWrap: "wrap" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Truck size={18} style={{ color: "var(--glam-blue)" }} /> Surtido a fábrica
          </h2>
          {!isFranchise ? (
            <Link
              href={`${BRANCH_TYPE_COPY.branch.listHref}/${branch.id}?tab=pedidos`}
              className="inline-flex items-center gap-1 text-sm"
              style={{ color: "var(--glam-blue)", fontWeight: 600 }}
            >
              Ver pedidos a fábrica <ArrowRight size={14} />
            </Link>
          ) : null}
        </div>
        <div className={`stat-tiles ${isFranchise ? "cols-3" : ""}`} style={{ marginTop: 16 }}>
          <StatTile
            icon={Inbox}
            label={isFranchise ? "Por enviar" : "Por recibir"}
            value={stats.restock.openCount ? `${stats.restock.openCount} pedidos` : "Ninguno"}
            hint={
              stats.restock.openCount
                ? `El más viejo ${relativeDays(stats.restock.oldestOpenAt)}`
                : "No hay pedidos en camino"
            }
          />
          <StatTile icon={ClipboardList} label="Pedidos este mes" value={String(stats.restock.monthCount)} />
          <StatTile
            icon={CalendarClock}
            label="Último pedido"
            value={capitalize(relativeDays(stats.restock.lastOrderAt))}
            hint={stats.restock.lastOrderAt ? formatDateTime(stats.restock.lastOrderAt) : "Aún no pide a fábrica"}
            muted={!stats.restock.lastOrderAt}
          />
          {!isFranchise ? (
            <StatTile
              icon={CalendarDays}
              label="Corte de faltantes"
              value={
                branch.restockCutoffDow == null
                  ? "Manual"
                  : capitalize(WEEKDAY_LABELS[branch.restockCutoffDow] ?? "")
              }
              hint={branch.restockCutoffDow == null ? "Sin corte automático" : "Cada semana, automático"}
            />
          ) : null}
        </div>
      </section>

      <section className="panel p-5">
        <div className="toolbar" style={{ marginBottom: 0, flexWrap: "wrap" }}>
          <h2>Datos de la {isFranchise ? "franquicia" : "sucursal"}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="branch-code-badge">{branch.code}</span>
            <span
              className="branch-status-pill"
              style={
                branch.isActive
                  ? { background: HEALTH_BG.good, color: HEALTH_COLORS.good }
                  : { background: "var(--bg)", color: "var(--muted)" }
              }
            >
              {branch.isActive ? "Activa" : "Inactiva"}
            </span>
          </div>
        </div>
        <div className="info-rows" style={{ marginTop: 12 }}>
          <InfoRow icon={Store} label="Nombre" value={branch.name} />
          <InfoRow icon={Phone} label="Teléfono" value={branch.phone || null} empty="Sin teléfono registrado" />
          <InfoRow icon={MapPin} label="Domicilio" value={address || null} empty="Sin domicilio registrado" />
          {!isFranchise ? (
            <InfoRow
              icon={Printer}
              label="Ticket impreso"
              value={`Papel de ${Number(ticket.paperWidthMm ?? 80)} mm${
                ticket.footerMessage ? ` · "${String(ticket.footerMessage)}"` : ""
              }`}
            />
          ) : null}
          {branch.notes ? <InfoRow icon={StickyNote} label="Notas internas" value={branch.notes} /> : null}
        </div>
      </section>
    </div>
  );
}
