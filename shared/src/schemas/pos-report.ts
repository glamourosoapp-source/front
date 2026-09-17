import { z } from "zod";

/** Periodos que ofrece el corte: día, semana de negocio (sáb→vie), mes o rango libre. */
export const POS_REPORT_GRANULARITIES = ["day", "week", "month", "range"] as const;
export type PosReportGranularity = (typeof POS_REPORT_GRANULARITIES)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD");

/**
 * Filtro común de los reportes del POS. `branchId` ausente = todas las
 * sucursales (solo para usuarios sin sucursal fija).
 */
export const queryPosReportSchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  from: dateOnly,
  to: dateOnly,
  granularity: z.enum(POS_REPORT_GRANULARITIES).default("range"),
});

export const queryPosTimeseriesSchema = queryPosReportSchema.extend({
  granularity: z.enum(["day", "week", "month"]).default("day"),
});

/** Serie por sucursal: además admite año, para la tabla de ventas por periodo del Overview. */
export const queryPosBranchTimeseriesSchema = queryPosReportSchema.extend({
  granularity: z.enum(["day", "week", "month", "year"]).default("day"),
});

export const queryPosTopProductsSchema = queryPosReportSchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  orderBy: z.enum(["revenue", "quantity"]).default("revenue"),
});

/** Congela un corte: guarda el resumen del periodo para consultarlo después. */
export const createCashCutSchema = z.object({
  branchId: z.union([z.string().uuid(), z.null()]).optional(),
  from: dateOnly,
  to: dateOnly,
  granularity: z.enum(POS_REPORT_GRANULARITIES).default("range"),
});

export const queryCashCutsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  branchId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
});
