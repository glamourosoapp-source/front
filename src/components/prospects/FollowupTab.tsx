"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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
import { TemplatePicker } from "@/components/prospects/TemplatePicker";
import { formatMxPhone } from "@/utils/format-phone";
import { OUTREACH_CHANNEL } from "@glamouroso/shared/constants";
import type { ProspectOutreachResponse } from "@glamouroso/shared/schemas/campaign";
import { ListResponse } from "@/types";
import { toast } from "sonner";

const LAST_FOLLOWUP_TEMPLATE_KEY = "lastFollowupTemplateName";

interface FollowupRow {
  id: string;
  name: string;
  phone?: string | null;
  city?: string | null;
  touchCount?: number;
  lastContactedAt?: string | null;
}

interface FollowupListResponse extends ListResponse<FollowupRow> {
  followupConfig?: { waitDays: number; maxTouches: number };
}

function daysAgo(iso?: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "hoy";
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

/**
 * Tab Seguimiento: contactados que no respondieron y cuyo próximo toque ya
 * venció. El segundo toque es un click humano (no automático) y sale por el
 * guardián con la misma protección de cupos y supresiones.
 */
export function FollowupTab({ onContacted }: { onContacted?: () => void }) {
  const { can } = usePermissions();
  // El envío exige outreach:create en el Back; sin él la tabla es solo lectura.
  const canSend = can("outreach", "create");
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [config, setConfig] = useState<{ waitDays: number; maxTouches: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [templateName, setTemplateName] = useState("");
  const [templateValid, setTemplateValid] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await httpClient.get<FollowupListResponse>("/prospects", {
        segment: "followup_due",
        limit: 60,
      });
      setRows(response.items);
      setConfig(response.followupConfig ?? null);
      // Todos preseleccionados: el caso típico es "mándales a todos el 2º toque".
      setSelectedIds(new Set(response.items.map((r) => r.id)));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar el segmento de seguimiento"));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_FOLLOWUP_TEMPLATE_KEY);
      if (last) setTemplateName(last);
    } catch {
      // localStorage no disponible
    }
    load().catch(() => undefined);
  }, [load]);

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedIds.size === 0) {
      toast.error("Selecciona al menos un prospecto");
      return;
    }
    if (!templateName.trim()) {
      toast.error("Elige la plantilla del seguimiento");
      return;
    }
    if (!templateValid) {
      toast.error("Esa plantilla no existe en Meta: elige una del catálogo o créala con “Nueva”");
      return;
    }
    setSending(true);
    const toastId = toast.loading(`Encolando ${selectedIds.size} seguimientos...`);
    try {
      const response = await httpClient.post<ProspectOutreachResponse>("/prospects/outreach", {
        prospectIds: Array.from(selectedIds),
        channel: OUTREACH_CHANNEL.WHATSAPP,
        templateName: templateName.trim(),
        followup: true,
      });
      const queued = response.whatsapp?.queued ?? 0;
      toast.success(
        queued > 0
          ? `${queued} ${queued === 1 ? "seguimiento" : "seguimientos"} en cola (${
              response.whatsapp?.scheduledToday ?? 0
            } ${(response.whatsapp?.scheduledToday ?? 0) === 1 ? "sale hoy" : "salen hoy"})`
          : "Nada nuevo por enviar",
        { id: toastId }
      );
      try {
        localStorage.setItem(LAST_FOLLOWUP_TEMPLATE_KEY, templateName.trim());
      } catch {
        // localStorage no disponible
      }
      await load();
      onContacted?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al enviar seguimientos"), { id: toastId });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="panel p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2>Seguimiento</h2>
          <p className="page-kicker">
            Contactados que no respondieron
            {config ? ` después de ${config.waitDays} días` : ""}. Un segundo mensaje bien hecho
            trae la mayoría de las respuestas.
          </p>
        </div>
        {canSend && (
          <span className="pill">
            {selectedIds.size} {selectedIds.size === 1 ? "seleccionado" : "seleccionados"}
          </span>
        )}
      </div>

      {listLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={48} animation="wave" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="page-kicker" style={{ padding: "24px 0", textAlign: "center" }}>
          Nadie espera seguimiento por ahora. Aquí aparecen los contactados que no respondieron
          {config ? ` después de ${config.waitDays} días` : ""} — vuelve mañana o importa más
          negocios en Buscar.
        </p>
      ) : (
        <form onSubmit={handleSend} className="grid gap-4">
          {canSend && (
            <TemplatePicker
              value={templateName}
              onChange={setTemplateName}
              onValidityChange={setTemplateValid}
              helperText="Usa una plantilla DISTINTA a la del primer mensaje: recordar sin repetir funciona mejor."
              required
            />
          )}

          <TableContainer component={Paper} elevation={0} className="table-container-premium">
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  {canSend && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={rows.some((r) => selectedIds.has(r.id)) && !allSelected}
                        onChange={() =>
                          setSelectedIds(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
                        }
                      />
                    </TableCell>
                  )}
                  <TableCell>Negocio</TableCell>
                  <TableCell>Teléfono</TableCell>
                  <TableCell>Ciudad</TableCell>
                  <TableCell>Último contacto</TableCell>
                  <TableCell>Toque</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} hover selected={canSend && selectedIds.has(row.id)}>
                    {canSend && (
                      <TableCell padding="checkbox">
                        <Checkbox checked={selectedIds.has(row.id)} onChange={() => toggleOne(row.id)} />
                      </TableCell>
                    )}
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{formatMxPhone(row.phone)}</TableCell>
                    <TableCell>{row.city || "-"}</TableCell>
                    <TableCell>{daysAgo(row.lastContactedAt)}</TableCell>
                    <TableCell>
                      <span className="pill-muted">
                        {(row.touchCount ?? 1)} de {config?.maxTouches ?? 2}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {canSend && (
            <div
              className="flex flex-wrap items-center justify-between gap-3"
              style={{
                position: "sticky",
                bottom: 0,
                background: "var(--card)",
                borderTop: "1px solid var(--border)",
                padding: "12px 4px 4px",
              }}
            >
              <span className="page-kicker" style={{ margin: 0 }}>
                El envío pasa por el guardián: respeta el cupo diario y la lista de no contactar.
              </span>
              <Button type="submit" variant="contained" disabled={sending || selectedIds.size === 0}>
                {sending ? "Enviando..." : `Enviar seguimiento (${selectedIds.size})`}
              </Button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
