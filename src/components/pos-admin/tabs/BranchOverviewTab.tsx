"use client";

import { Calculator, Receipt, Truck, Users, Wallet } from "lucide-react";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import { DetailField } from "@/components/ui/DetailField";
import { formatMoney } from "@/lib/format-money";
import type { Branch, BranchStats } from "@/types";
import { BranchHealthSignals } from "../BranchHealthChip";
import { WEEKDAY_LABELS, formatDateTime, relativeDays } from "../pos-labels";

interface BranchOverviewTabProps {
  branch: Branch;
  stats: BranchStats;
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

/**
 * Resumen de la sucursal: lo que el administrador quiere saber en 10 segundos.
 * Ventas por periodo (con el permiso de reportes), salud con sus señales,
 * surtido y los datos de contacto.
 */
export function BranchOverviewTab({ branch, stats }: BranchOverviewTabProps) {
  const isFranchise = branch.type === BRANCH_TYPES.FRANCHISE;
  const sales = stats.sales;
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
              <span>Hoy</span>
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
              <span>Semana (sáb–vie)</span>
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
              <span>Mes</span>
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
              <span>Últimos 30 días</span>
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
          <BranchHealthSignals health={stats.health} />
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
                label="Bajo stock mínimo"
                value={
                  stats.inventory.belowMinCount ? (
                    <span style={{ color: "#d97706" }}>
                      {stats.inventory.belowMinCount} de {stats.inventory.trackedCount} con mínimo
                    </span>
                  ) : (
                    `Ninguno de ${stats.inventory.trackedCount} con mínimo`
                  )
                }
              />
            ) : null}
            <DetailField label="Usuarios asignados" value={String(stats.usersCount)} />
          </div>
        </section>

        <section className="panel p-5">
          <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Truck size={18} style={{ color: "var(--glam-blue)" }} /> Surtido a fábrica
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="Por enviar"
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
