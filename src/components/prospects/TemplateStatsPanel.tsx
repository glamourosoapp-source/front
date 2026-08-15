"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import type { TemplateStatsResponse, TemplateStatsRow } from "@glamouroso/shared/schemas/campaign";

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Resalta la mejor tasa de respuesta cuando hay con qué comparar. */
function isBest(rows: TemplateStatsRow[], row: TemplateStatsRow): boolean {
  const comparable = rows.filter((r) => r.sent >= 5);
  if (comparable.length < 2) return false;
  const best = Math.max(...comparable.map((r) => r.replyRate));
  return row.sent >= 5 && row.replyRate === best && best > 0;
}

interface TemplateStatsPanelProps {
  /** Filtra por flujo: prospect_outreach, campaign o reactivation. */
  context?: string;
  /** Muestra la columna de conversiones con etiqueta de recompra. */
  conversionLabel?: string;
}

/**
 * "¿Qué mensaje funciona?": tasa de respuesta a 72 h por plantilla. Es el
 * insumo para iterar el copy con datos en vez de intuición.
 */
export function TemplateStatsPanel({
  context,
  conversionLabel = "Convirtieron",
}: TemplateStatsPanelProps) {
  const [data, setData] = useState<TemplateStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(
        await httpClient.get<TemplateStatsResponse>("/outreach/template-stats", {
          ...(context ? { context } : {}),
        })
      );
      setError(null);
    } catch (err) {
      // Un 500 no es "todavía no hay envíos": mostrar el error real.
      setError(getApiErrorMessage(err, "No se pudieron leer las estadísticas"));
      setData({ items: [], days: 90 });
    }
  }, [context]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (!data) {
    return (
      <section className="panel p-4">
        <Skeleton variant="text" width={220} />
        <Skeleton variant="rounded" height={80} />
      </section>
    );
  }

  const rows = data.items;

  return (
    <section className="panel p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2>¿Qué mensaje funciona?</h2>
          <p className="page-kicker">
            Tasa de respuesta dentro de las 72 h siguientes al envío, últimos {data.days} días.
          </p>
        </div>
      </div>

      {error ? (
        <p className="page-kicker" style={{ margin: 0, color: "#b45309" }}>
          No se pudieron cargar las estadísticas: {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="page-kicker" style={{ margin: 0 }}>
          Todavía no hay envíos suficientes. En cuanto salgan los primeros mensajes verás aquí qué
          plantilla trae más respuestas.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Plantilla</TableCell>
                <TableCell align="right">Enviados</TableCell>
                <TableCell align="right">Respondieron</TableCell>
                <TableCell align="right">Tasa</TableCell>
                <TableCell align="right">{conversionLabel}</TableCell>
                <TableCell align="right">Fallidos</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.templateName} hover>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span style={{ fontWeight: 600 }}>{row.templateName}</span>
                      {isBest(rows, row) && <span className="pill-success">mejor</span>}
                      {row.queued > 0 && <span className="pill-muted">{row.queued} en cola</span>}
                    </span>
                  </TableCell>
                  <TableCell align="right">{row.sent}</TableCell>
                  <TableCell align="right">{row.replied}</TableCell>
                  <TableCell align="right">
                    {row.sent >= 5 ? (
                      <strong>{formatPct(row.replyRate)}</strong>
                    ) : (
                      <span style={{ color: "var(--muted)" }} title="Pocos envíos para concluir">
                        {formatPct(row.replyRate)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell align="right">{row.converted}</TableCell>
                  <TableCell align="right">
                    {row.failed > 0 ? (
                      <span className="pill-danger">{row.failed}</span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
