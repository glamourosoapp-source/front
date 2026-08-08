"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Checkbox,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMxPhone } from "@/utils/format-phone";
import type { ReactivationSegmentResponse, ReactivationCustomer } from "@glamouroso/shared/schemas/campaign";
import { toast } from "sonner";

const DAY_OPTIONS = [15, 30, 60, 90];
const MAX_RECIPIENTS = 60;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

interface InactiveCustomersTabProps {
  days: number;
  onDaysChange: (days: number) => void;
  /** Pasa los seleccionados al tab de campañas para crear una con ellos. */
  onCreateCampaign: (customerIds: string[]) => void;
}

/**
 * Clientes que ya compraron y llevan N+ días sin pedir. El segmento excluye a
 * los que pidieron no ser contactados y a los que están conversando con
 * nosotros ahora mismo (no molestarlos con una campaña).
 */
export function InactiveCustomersTab({ days, onDaysChange, onCreateCampaign }: InactiveCustomersTabProps) {
  const router = useRouter();
  const { can } = usePermissions();
  const [rows, setRows] = useState<ReactivationCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await httpClient.get<ReactivationSegmentResponse>(
        "/campaigns/reactivation-segment",
        { days, search: debouncedSearch, limit: 200 }
      );
      setRows(response.items);
      setTotal(response.total);
      setSelectedIds(new Set());
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar clientes inactivos"));
    } finally {
      setLoading(false);
    }
  }, [days, debouncedSearch]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_RECIPIENTS) {
        next.add(id);
      } else {
        toast.error(`Máximo ${MAX_RECIPIENTS} destinatarios por campaña`);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      for (const row of rows) {
        if (next.size >= MAX_RECIPIENTS) break;
        next.add(row.id);
      }
      return next;
    });
  }

  return (
    <section className="panel p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2>Clientes inactivos</h2>
          <p className="page-kicker">
            Clientes que ya te compraron y llevan {days}+ días sin pedir. Se excluyen los que
            pidieron no ser contactados y los que están conversando ahora.
          </p>
        </div>
        <span className="pill">{selectedIds.size} seleccionados</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((option) => (
            <Button
              key={option}
              size="small"
              variant={days === option ? "contained" : "outlined"}
              onClick={() => onDaysChange(option)}
            >
              {option}+ días
            </Button>
          ))}
        </div>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Buscar cliente o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={48} animation="wave" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="page-kicker" style={{ padding: "24px 0", textAlign: "center" }}>
          Ningún cliente lleva {days}+ días sin comprar. Buena señal: prueba con un rango mayor o
          revisa más adelante.
        </p>
      ) : (
        <>
          <TableContainer component={Paper} elevation={0} className="table-container-premium">
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={rows.some((r) => selectedIds.has(r.id)) && !allSelected}
                      onChange={toggleAll}
                    />
                  </TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell>Teléfono</TableCell>
                  <TableCell>Último pedido</TableCell>
                  <TableCell>Sin comprar</TableCell>
                  <TableCell>Pedidos</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover selected={selectedIds.has(row.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={selectedIds.has(row.id)} onChange={() => toggleOne(row.id)} />
                    </TableCell>
                    <TableCell>
                      <span
                        style={{ color: "var(--glam-blue)", cursor: "pointer", fontWeight: 600 }}
                        onClick={() => router.push(`/dashboard/customers/${row.id}`)}
                      >
                        {row.name}
                      </span>
                    </TableCell>
                    <TableCell>{formatMxPhone(row.phone)}</TableCell>
                    <TableCell>{formatDate(row.lastOrderAt)}</TableCell>
                    <TableCell>
                      <span className="pill warning">
                        {row.daysInactive != null ? `${row.daysInactive} días` : "—"}
                      </span>
                    </TableCell>
                    <TableCell>{row.totalOrders}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <div
            className="flex flex-wrap items-center justify-between gap-3"
            style={{
              position: "sticky",
              bottom: 0,
              background: "var(--card)",
              borderTop: "1px solid var(--border)",
              padding: "12px 4px 4px",
              marginTop: 12,
            }}
          >
            <span className="page-kicker" style={{ margin: 0 }}>
              {total} clientes en el segmento · máximo {MAX_RECIPIENTS} por campaña
            </span>
            {can("reactivation", "create") && (
              <Button
                variant="contained"
                disabled={selectedIds.size === 0}
                onClick={() => onCreateCampaign(Array.from(selectedIds))}
              >
                Crear campaña con seleccionados ({selectedIds.size})
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
