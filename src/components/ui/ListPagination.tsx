"use client";

import { Pagination, Stack, Typography } from "@mui/material";

interface ListPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
}

export function ListPagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  limitOptions = [25, 50, 100],
}: ListPaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const showPager = totalPages > 1;

  if (total === 0) return null;

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      alignItems={{ xs: "stretch", sm: "center" }}
      justifyContent="space-between"
      gap={2}
      sx={{ mt: 2, pt: 2, borderTop: "1px solid rgba(38, 45, 96, 0.08)" }}
    >
      <Typography variant="body2" color="text.secondary">
        Mostrando {from.toLocaleString("es-MX")}–{to.toLocaleString("es-MX")} de {total.toLocaleString("es-MX")}
      </Typography>
      <Stack direction="row" alignItems="center" justifyContent={{ xs: "space-between", sm: "flex-end" }} gap={2}>
        {onLimitChange ? (
          <label className="flex items-center gap-2 text-sm text-[var(--glam-muted)]">
            Por pagina
            <select
              className="input"
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              aria-label="Productos por pagina"
            >
              {limitOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showPager ? (
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_event, nextPage) => onPageChange(nextPage)}
            color="primary"
            shape="rounded"
            showFirstButton
            showLastButton
            siblingCount={1}
            boundaryCount={1}
          />
        ) : null}
      </Stack>
    </Stack>
  );
}
