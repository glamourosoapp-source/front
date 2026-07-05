"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Paper,
} from "@mui/material";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMxPhone } from "@/utils/format-phone";
import { ProspectStatusPill, statusMeta, channelLabel } from "@/components/prospects/prospect-status";
import {
  DEFAULT_PROSPECT_VOICE_SCRIPT,
  OUTREACH_CHANNEL,
  OUTREACH_ATTEMPT_STATUS,
  PROSPECT_STATUS,
  type OutreachChannel,
} from "@glamouroso/shared/constants";
import type {
  ProspectOutreachResponse,
  ProspectOutreachAttempt,
} from "@glamouroso/shared/schemas/campaign";
import { ListResponse } from "@/types";
import { toast } from "sonner";

const LAST_IMPORTED_KEY = "lastImportedProspectIds";
const LAST_TEMPLATE_KEY = "lastOutreachTemplateName";

type StatusFilter = "new" | "all" | "failed";

interface ProspectRow {
  id: string;
  name: string;
  phone?: string | null;
  city?: string | null;
  status?: string;
}

interface ResultRow {
  prospectId: string;
  name: string;
  channel: string;
  status: string;
  error?: string | null;
}

interface ProspectOutreachPanelProps {
  onSelectionChange?: (ids: string[]) => void;
  onContacted?: () => void;
}

export function ProspectOutreachPanel({ onSelectionChange, onContacted }: ProspectOutreachPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("new");
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<OutreachChannel>(OUTREACH_CHANNEL.WHATSAPP);
  const [templateName, setTemplateName] = useState("");
  const [voiceScript, setVoiceScript] = useState(DEFAULT_PROSPECT_VOICE_SCRIPT);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText, 250);
  const [resultRows, setResultRows] = useState<ResultRow[] | null>(null);
  const [attempts, setAttempts] = useState<ProspectOutreachAttempt[]>([]);

  const showWhatsApp = channel === OUTREACH_CHANNEL.WHATSAPP || channel === OUTREACH_CHANNEL.BOTH;
  const showVoice = channel === OUTREACH_CHANNEL.VOICE || channel === OUTREACH_CHANNEL.BOTH;

  const loadProspects = useCallback(async (filter: StatusFilter) => {
    setListLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 100 };
      if (filter !== "all") {
        params.status = filter === "new" ? PROSPECT_STATUS.NEW : PROSPECT_STATUS.FAILED;
      }
      const response = await httpClient.get<ListResponse<ProspectRow>>("/prospects", params);
      setProspects(response.items);

      if (filter === "new") {
        let ids = response.items.map((p) => p.id);
        try {
          const raw = sessionStorage.getItem(LAST_IMPORTED_KEY);
          if (raw) {
            const lastIds = JSON.parse(raw) as string[];
            const visible = new Set(response.items.map((p) => p.id));
            const fromLast = lastIds.filter((id) => visible.has(id));
            if (fromLast.length > 0) ids = fromLast;
          }
        } catch {
          // ignore
        }
        setSelectedIds(new Set(ids));
      } else {
        setSelectedIds(new Set());
      }
    } catch {
      toast.error("Error al cargar prospectos");
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadAttempts = useCallback(async () => {
    try {
      const response = await httpClient.get<ListResponse<ProspectOutreachAttempt>>(
        "/prospects/outreach/attempts",
        { limit: 8 }
      );
      setAttempts(response.items);
    } catch {
      // actividad reciente es secundaria
    }
  }, []);

  useEffect(() => {
    try {
      const lastTemplate = localStorage.getItem(LAST_TEMPLATE_KEY);
      if (lastTemplate) setTemplateName(lastTemplate);
    } catch {
      // localStorage no disponible
    }
    const params = new URLSearchParams(window.location.search);
    const urlStatus = params.get("status");
    const initial: StatusFilter =
      urlStatus === PROSPECT_STATUS.FAILED
        ? "failed"
        : urlStatus === "all"
          ? "all"
          : "new";
    setStatusFilter(initial);
    loadProspects(initial).catch(() => undefined);
    loadAttempts().catch(() => undefined);
  }, [loadProspects, loadAttempts]);

  useEffect(() => {
    onSelectionChange?.(Array.from(selectedIds));
  }, [selectedIds, onSelectionChange]);

  const visibleProspects = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return prospects;
    return prospects.filter((p) =>
      [p.name, p.phone, p.city].some((v) => (v || "").toLowerCase().includes(term))
    );
  }, [prospects, debouncedSearch]);

  const allVisibleSelected =
    visibleProspects.length > 0 && visibleProspects.every((p) => selectedIds.has(p.id));

  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleProspects.forEach((p) => next.delete(p.id));
      } else {
        visibleProspects.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function changeFilter(key: StatusFilter) {
    setStatusFilter(key);
    loadProspects(key).catch(() => undefined);
  }

  async function handleOutreach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedIds.size === 0) {
      toast.error("Selecciona al menos un prospecto");
      return;
    }
    if (showWhatsApp && !templateName.trim()) {
      toast.error("Indica una plantilla Meta para WhatsApp");
      return;
    }

    const nameById = new Map(prospects.map((p) => [p.id, p.name]));

    setLoading(true);
    const toastId = toast.loading(`Contactando ${selectedIds.size} prospectos...`);
    try {
      const result = await httpClient.post<ProspectOutreachResponse>("/prospects/outreach", {
        prospectIds: Array.from(selectedIds),
        channel,
        templateName: showWhatsApp ? templateName.trim() : undefined,
        voiceScript: showVoice ? voiceScript.trim() : undefined,
      });

      const rows: ResultRow[] = [];
      for (const d of result.outreach.whatsapp?.details ?? []) {
        rows.push({
          prospectId: d.prospectId,
          name: nameById.get(d.prospectId) || "Prospecto",
          channel: OUTREACH_CHANNEL.WHATSAPP,
          status: d.status,
          error: d.error,
        });
      }
      for (const d of result.outreach.voice?.details ?? []) {
        rows.push({
          prospectId: d.prospectId,
          name: nameById.get(d.prospectId) || "Prospecto",
          channel: OUTREACH_CHANNEL.VOICE,
          status: d.status,
          error: d.error,
        });
      }
      setResultRows(rows);

      toast.success(
        `Contactados: ${result.contacted} · Omitidos: ${result.skipped.alreadyContacted} ya contactados, ${result.skipped.noPhone} sin telefono`,
        { id: toastId }
      );
      if (showWhatsApp && templateName.trim()) {
        try {
          localStorage.setItem(LAST_TEMPLATE_KEY, templateName.trim());
        } catch {
          // localStorage no disponible
        }
      }
      setSelectedIds(new Set());
      await Promise.all([loadProspects(statusFilter), loadAttempts()]);
      onContacted?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al contactar prospectos"), { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  const filterButtons: { key: StatusFilter; label: string }[] = useMemo(
    () => [
      { key: "new", label: "Nuevos" },
      { key: "all", label: "Todos" },
      { key: "failed", label: "Fallidos" },
    ],
    []
  );

  return (
    <section className="panel p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2>Contactar prospectos</h2>
          <p className="page-kicker">Elige a quien contactar y el canal (WhatsApp, llamada o ambos).</p>
        </div>
        <span className="pill">{selectedIds.size} seleccionados</span>
      </div>

      <form onSubmit={handleOutreach} className="mb-4 grid gap-4">
        <div
          className="grid gap-4 rounded-lg p-3"
          style={{ background: "rgba(248, 250, 252, 0.7)", border: "1px solid var(--border)" }}
        >
          <FormControl>
            <FormLabel>Canal de contacto</FormLabel>
            <RadioGroup
              row
              value={channel}
              onChange={(e) => setChannel(e.target.value as OutreachChannel)}
            >
              <FormControlLabel value={OUTREACH_CHANNEL.WHATSAPP} control={<Radio />} label="WhatsApp" />
              <FormControlLabel value={OUTREACH_CHANNEL.VOICE} control={<Radio />} label="Llamada" />
              <FormControlLabel value={OUTREACH_CHANNEL.BOTH} control={<Radio />} label="Ambos" />
            </RadioGroup>
          </FormControl>

          {showWhatsApp && (
            <TextField
              label="Plantilla Meta aprobada (Kapso)"
              placeholder="nombre_plantilla"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              helperText="Nombre exacto de la plantilla aprobada en Meta. WhatsApp solo permite iniciar conversacion con plantilla."
              size="small"
              fullWidth
              required
            />
          )}

          {showVoice && (
            <TextField
              label="Script de llamada (TTS)"
              value={voiceScript}
              onChange={(e) => setVoiceScript(e.target.value)}
              helperText="Texto que la llamada automatica leera en voz alta al contestar."
              multiline
              minRows={2}
              size="small"
              fullWidth
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {filterButtons.map(({ key, label }) => (
              <Button
                key={key}
                size="small"
                variant={statusFilter === key ? "contained" : "outlined"}
                onClick={() => changeFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="Buscar negocio, telefono o ciudad"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        <TableContainer component={Paper} elevation={0} className="table-container-premium">
          <Table sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={allVisibleSelected}
                    indeterminate={
                      visibleProspects.some((p) => selectedIds.has(p.id)) && !allVisibleSelected
                    }
                    onChange={toggleAll}
                    disabled={listLoading || visibleProspects.length === 0}
                  />
                </TableCell>
                <TableCell>Negocio</TableCell>
                <TableCell>Telefono</TableCell>
                <TableCell>Ciudad</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {listLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell padding="checkbox">
                      <Skeleton variant="circular" width={20} height={20} />
                    </TableCell>
                    <TableCell colSpan={4}>
                      <Skeleton variant="text" />
                    </TableCell>
                  </TableRow>
                ))
              ) : visibleProspects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 5, color: "text.secondary" }}>
                    {prospects.length === 0
                      ? "No hay prospectos en este filtro. Importa desde Prospectos IA."
                      : "Ningun prospecto coincide con tu busqueda."}
                  </TableCell>
                </TableRow>
              ) : (
                visibleProspects.map((row) => (
                  <TableRow key={row.id} hover selected={selectedIds.has(row.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                      />
                    </TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{formatMxPhone(row.phone)}</TableCell>
                    <TableCell>{row.city || "-"}</TableCell>
                    <TableCell>
                      <ProspectStatusPill status={row.status || PROSPECT_STATUS.NEW} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <div
          className="sticky-action-bar flex flex-wrap items-center justify-between gap-3"
          style={{
            position: "sticky",
            bottom: 0,
            background: "var(--card)",
            borderTop: "1px solid var(--border)",
            padding: "12px 4px 4px",
          }}
        >
          <span className="page-kicker" style={{ margin: 0 }}>
            {selectedIds.size} prospecto(s) seleccionados · canal {channelLabel(channel)}
          </span>
          <Button type="submit" variant="contained" disabled={loading || selectedIds.size === 0}>
            {loading ? "Enviando..." : `Contactar seleccionados (${selectedIds.size})`}
          </Button>
        </div>
      </form>

      {attempts.length > 0 && (
        <div className="mt-2">
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "var(--glam-navy)" }}>
            Actividad reciente
          </h3>
          <div className="grid gap-1">
            {attempts.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2"
                style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid rgba(230,235,243,0.6)" }}
              >
                <span style={{ color: "var(--text)" }}>
                  {a.prospectName} · {channelLabel(a.channel)}
                </span>
                <span className="flex items-center gap-2">
                  <span className={statusMeta(a.status).className}>
                    {a.status === OUTREACH_ATTEMPT_STATUS.SENT ||
                    a.status === OUTREACH_ATTEMPT_STATUS.COMPLETED
                      ? "Enviado"
                      : a.status === OUTREACH_ATTEMPT_STATUS.FAILED
                        ? "Fallido"
                        : a.status}
                  </span>
                  <span style={{ color: "var(--muted)" }}>
                    {new Date(a.createdAt).toLocaleString("es-MX", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={resultRows !== null} onClose={() => setResultRows(null)} fullWidth maxWidth="sm">
        <DialogTitle>Resultado del envio</DialogTitle>
        <DialogContent dividers>
          {resultRows && resultRows.length === 0 ? (
            <p className="page-kicker" style={{ margin: 0 }}>
              No se realizaron envios (prospectos ya contactados o sin telefono valido).
            </p>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Negocio</TableCell>
                  <TableCell>Canal</TableCell>
                  <TableCell>Resultado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resultRows?.map((r, i) => (
                  <TableRow key={`${r.prospectId}-${r.channel}-${i}`}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{channelLabel(r.channel)}</TableCell>
                    <TableCell>
                      <span className="flex flex-col gap-1">
                        <span
                          className={
                            r.status === OUTREACH_ATTEMPT_STATUS.SENT
                              ? "pill-success"
                              : "pill-danger"
                          }
                        >
                          {r.status === OUTREACH_ATTEMPT_STATUS.SENT ? "Enviado" : "Fallido"}
                        </span>
                        {r.error && (
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>{r.error}</span>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResultRows(null)} variant="contained">
            Entendido
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}

export const LAST_IMPORTED_PROSPECTS_KEY = LAST_IMPORTED_KEY;
