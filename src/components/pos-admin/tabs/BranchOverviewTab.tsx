"use client";

import Link from "next/link";
import { ArrowRight, Calculator, Receipt, Truck, Users, Wallet } from "lucide-react";
import type { BranchHealthSignal } from "@glamouroso/shared";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import { DetailField } from "@/components/ui/DetailField";
import { formatMoney } from "@/lib/format-money";
import type { Branch, BranchStats } from "@/types";
import { BranchHealthSignals } from "../BranchHealthChip";
import { BRANCH_TYPE_COPY, WEEKDAY_LABELS, formatDateTime, relativeDays, salesPeriodLabels } from "../pos-labels";

interface BranchOverviewTabProps {
  branch: Branch;
  stats: BranchStats;
}

/** La pestaña del detalle donde se resuelve cada señal de salud. */
function signalHref(branchId: string, code: BranchHealthSignal["code"]): string | null {
  const base = `${BRANCH_TYPE_COPY.branch.listHref}/${branchId}`;
  switch (code) {
    case "below_min":
      return `${base}?tab=inventario&bajo=1`;
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

      <div className="grid-2">
        <section className="panel p-5">
          <h2 style={{ marginTop: 0 }}>Salud de la {isFranchise ? "franquicia" : "sucursal"}</h2>
          <BranchHealthSignals
            health={stats.health}
            hrefFor={isFranchise ? undefined : (code) => signalHref(branch.id, code)}
          />
          <div className="grid gap-4 sm:grid-cols-2" style={{ marginTop: 16 }}>
            {!isFranchise && sales ? (
              <>
                <DetailField label="Ticket promedio del mes" value={formatMoney(sales.month.avgTicket)} />
                <DetailField label="Última venta" value={`${relativeDays(sales.lastSaleAt)} · ${formatDateTime(sales.lastSaleAt)}`} />
                <DetailField label="Clientes registrados" value={String(sales.customersCount)} />
                <DetailField label="Tickets históricos" value={String(sales.lifetimeTickets)} />
              </>
            ) : null}
            {!isFranchise && stats.inventory ? (
              <DetailField
                label="Bajo su stock"
                value={
                  stats.inventory.belowMinCount ? (
                    <span style={{ color: "#d97706" }}>
                      {stats.inventory.belowMinCount} de {stats.inventory.trackedCount} con stock definido
                    </span>
                  ) : (
                    `Ninguno de ${stats.inventory.trackedCount} con stock definido`
                  )
                }
              />
            ) : null}
            <DetailField label="Usuarios asignados" value={String(stats.usersCount)} />
          </div>
        </section>

        <section className="panel p-5">
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label={isFranchise ? "Por enviar" : "Por recibir"}
              value={
                stats.restock.openCount ? (
                  <span style={{ color: "var(--glam-navy)" }}>
                    {stats.restock.openCount} · el más viejo {relativeDays(stats.restock.oldestOpenAt)}
                  </span>
                ) : (
                  "Ninguno"
                )
              }
            />
            <DetailField label="Pedidos este mes" value={String(stats.restock.monthCount)} />
            <DetailField label="Último pedido" value={relativeDays(stats.restock.lastOrderAt)} />
            {!isFranchise ? (
              <DetailField
                label="Corte de faltantes"
                value={
                  branch.restockCutoffDow == null
                    ? "Manual (sin corte automático)"
                    : `Cada ${WEEKDAY_LABELS[branch.restockCutoffDow]}`
                }
              />
            ) : null}
          </div>
        </section>
      </div>

      <section className="panel p-5">
        <h2 style={{ marginTop: 0 }}>Datos de la {isFranchise ? "franquicia" : "sucursal"}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Código" value={branch.code} />
          <DetailField label="Nombre" value={branch.name} />
          <DetailField label="Teléfono" value={branch.phone || "—"} />
          <DetailField label="Domicilio" value={address || "—"} />
          <DetailField label="Estado" value={branch.isActive ? "Activa" : "Inactiva"} />
          {!isFranchise ? (
            <DetailField
              label="Ticket impreso"
              value={`${Number(ticket.paperWidthMm ?? 80)} mm${
                ticket.footerMessage ? ` · "${String(ticket.footerMessage)}"` : ""
              }`}
            />
          ) : null}
          {branch.notes ? <DetailField label="Notas internas" value={branch.notes} /> : null}
        </div>
      </section>
    </div>
  );
}
