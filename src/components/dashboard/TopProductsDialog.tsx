"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from "@mui/material";
import { httpClient } from "@/services/http-client";
import { DataTable } from "@/components/ui/DataTable";
import { MONTH_LONG } from "@/components/dashboard/SalesByPeriodChart";
import {
  DASHBOARD_TOP_PRODUCTS_MAX_LIMIT,
  type DashboardTopProducts,
  type DashboardTopProductsOrderBy,
} from "@glamouroso/shared/schemas/dashboard";

interface TopProductsDialogProps {
  onClose: () => void;
  /** Periodo con el que abre, heredado del panel. `null` = todo el histórico. */
  initialYear: number | null;
  initialMonth: number | null;
  /** Años con ventas, para el selector. */
  availableYears: number[];
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function periodLabel(year: number | null, month: number | null): string {
  if (year === null) return "Todo el tiempo";
  return month ? `${MONTH_LONG[month - 1]} ${year}` : `${year}`;
}

/**
 * Lista larga (hasta 50) de los productos más vendidos, con su propio filtro de periodo y de
 * orden. Abre en el periodo del panel y a partir de ahí es independiente. El orden se pide al
 * Back, no se reordena aquí: así el top 50 por unidades es el top 50 real y no una reordenada
 * del top 50 por ingreso.
 *
 * Se monta solo cuando está abierto, para que cada apertura arranque en el periodo del panel.
 */
export function TopProductsDialog({ onClose, initialYear, initialMonth, availableYears }: TopProductsDialogProps) {
  const [year, setYear] = useState<number | null>(initialYear);
  const [month, setMonth] = useState<number | null>(initialMonth);
  const [orderBy, setOrderBy] = useState<DashboardTopProductsOrderBy>("total");
  const [data, setData] = useState<DashboardTopProducts | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    const params: Record<string, unknown> = { limit: DASHBOARD_TOP_PRODUCTS_MAX_LIMIT, orderBy };
    if (year !== null) params.year = year;
    if (year !== null && month !== null) params.month = month;
    return httpClient
      .get<DashboardTopProducts>("/dashboard/top-products", params)
      .then((result) => {
        setData(result);
        setFailed(false);
      })
      .catch(() => {
        // Un fallo de red no es "no hubo ventas": se avisa distinto para no mentir.
        setData(null);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [year, month, orderBy]);

  useEffect(() => {
    load();
  }, [load]);

  const label = periodLabel(year, month);
  const years = availableYears.length ? availableYears : year !== null ? [year] : [];
  const rows = (data?.products ?? []).map((product, index) => ({
    rank: index + 1,
    name: product.name,
    quantity: product.quantity,
    total: product.total,
  }));

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { borderRadius: 3, boxShadow: "0 24px 48px rgba(38, 45, 96, 0.12)" } }}
    >
      <DialogTitle sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
        <Stack spacing={1.5}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "var(--glam-navy)", lineHeight: 1.2 }}>
            Top {DASHBOARD_TOP_PRODUCTS_MAX_LIMIT} de Artículos más Vendidos — {label}
          </Typography>
          <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1}>
            <select
              className="input"
              style={{ width: "auto", minHeight: "34px", padding: "4px 10px" }}
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value as DashboardTopProductsOrderBy)}
              aria-label="Ordenar por"
            >
              <option value="total">Por ingreso</option>
              <option value="quantity">Por unidades vendidas</option>
            </select>
            <select
              className="input"
              style={{ width: "auto", minHeight: "34px", padding: "4px 10px" }}
              value={month ?? ""}
              onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
              disabled={year === null}
              aria-label="Mes"
            >
              <option value="">Todo el año</option>
              {MONTH_LONG.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ width: "auto", minHeight: "34px", padding: "4px 10px" }}
              value={year ?? ""}
              onChange={(e) => {
                // "Todo el tiempo" no admite mes: el histórico completo cruza años.
                if (!e.target.value) {
                  setYear(null);
                  setMonth(null);
                  return;
                }
                setYear(Number(e.target.value));
              }}
              aria-label="Año"
            >
              <option value="">Todo el tiempo</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Stack>
          <span className="page-kicker">Pedidos cancelados excluidos. El lugar sigue el criterio elegido.</span>
        </Stack>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ px: 3, py: 2, minHeight: 320 }}>
        {loading ? (
          <p className="page-kicker">Cargando productos…</p>
        ) : failed ? (
          <Stack spacing={1.5} alignItems="flex-start">
            <p className="page-kicker">No se pudieron cargar los productos. Revisa la conexión con el servidor.</p>
            <Button variant="outlined" size="small" onClick={load}>
              Reintentar
            </Button>
          </Stack>
        ) : rows.length === 0 ? (
          <p className="page-kicker">Sin ventas registradas en {label.toLowerCase()}.</p>
        ) : (
          <>
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
              <span className="pill warning">{rows.length} productos</span>
              <span className="pill pill-muted">{formatMoney(data?.totalSales ?? 0)} en productos del periodo</span>
            </Stack>
            <DataTable
              rows={rows}
              getKey={(row: any) => row.name}
              columns={[
                { key: "rank", label: "Lugar", render: (row: any) => `#${row.rank}` },
                { key: "name", label: "Producto" },
                { key: "quantity", label: "Unidades Solicitadas" },
                { key: "total", label: "Ingreso Total", render: (row: any) => formatMoney(Number(row.total || 0)) },
              ]}
            />
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} variant="outlined">
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
