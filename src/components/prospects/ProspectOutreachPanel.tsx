"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Paper,
} from "@mui/material";
import { httpClient } from "@/services/http-client";
import {
  DEFAULT_PROSPECT_VOICE_SCRIPT,
  OUTREACH_CHANNEL,
  PROSPECT_STATUS,
  type OutreachChannel,
} from "@glamouroso/shared/constants";
import type { ProspectOutreachResponse } from "@glamouroso/shared/schemas/campaign";
import { ListResponse } from "@/types";
import { toast } from "sonner";

const LAST_IMPORTED_KEY = "lastImportedProspectIds";

type StatusFilter = "new" | "all" | "failed";

interface ProspectRow {
  id: string;
  name: string;
  phone?: string | null;
  city?: string | null;
  status?: string;
}

interface ProspectOutreachPanelProps {
  onSelectionChange?: (ids: string[]) => void;
}

export function ProspectOutreachPanel({ onSelectionChange }: ProspectOutreachPanelProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("new");
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<OutreachChannel>(OUTREACH_CHANNEL.WHATSAPP);
  const [templateName, setTemplateName] = useState("");
  const [voiceScript, setVoiceScript] = useState(DEFAULT_PROSPECT_VOICE_SCRIPT);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);

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

  useEffect(() => {
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
  }, [loadProspects]);

  useEffect(() => {
    onSelectionChange?.(Array.from(selectedIds));
  }, [selectedIds, onSelectionChange]);

  const allVisibleSelected =
    prospects.length > 0 && prospects.every((p) => selectedIds.has(p.id));

  function toggleAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(prospects.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

    setLoading(true);
    const toastId = toast.loading(`Contactando ${selectedIds.size} prospectos...`);
    try {
      const result = await httpClient.post<ProspectOutreachResponse>("/prospects/outreach", {
        prospectIds: Array.from(selectedIds),
        channel,
        templateName: showWhatsApp ? templateName.trim() : undefined,
        voiceScript: showVoice ? voiceScript.trim() : undefined,
      });
      const wa = result.outreach.whatsapp;
      const voice = result.outreach.voice;
      toast.success(
        `Contactados: ${result.contacted} · Omitidos: ${result.skipped.alreadyContacted} ya contactados, ${result.skipped.noPhone} sin telefono` +
          (wa ? ` · WA ok ${wa.sent}` : "") +
          (voice ? ` · Llamadas ${voice.sent}` : ""),
        { id: toastId }
      );
      setSelectedIds(new Set());
      await loadProspects(statusFilter);
    } catch {
      toast.error("Error al contactar prospectos", { id: toastId });
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
          <p className="page-kicker">Paso 2: elige a quien contactar y el canal (WhatsApp, llamada o ambos).</p>
        </div>
        <span className="pill">{selectedIds.size} seleccionados</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filterButtons.map(({ key, label }) => (
          <Button
            key={key}
            size="small"
            variant={statusFilter === key ? "contained" : "outlined"}
            onClick={() => {
              setStatusFilter(key);
              loadProspects(key).catch(() => undefined);
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      <form onSubmit={handleOutreach} className="mb-4 grid gap-4">
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
            fullWidth
            required
          />
        )}

        {showVoice && (
          <TextField
            label="Script de llamada (TTS)"
            value={voiceScript}
            onChange={(e) => setVoiceScript(e.target.value)}
            multiline
            minRows={3}
            fullWidth
          />
        )}

        <Button type="submit" variant="contained" disabled={loading || selectedIds.size === 0}>
          {loading ? "Enviando..." : `Contactar seleccionados (${selectedIds.size})`}
        </Button>
      </form>

      <TableContainer component={Paper} elevation={0} className="table-container-premium">
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={selectedIds.size > 0 && !allVisibleSelected}
                  onChange={toggleAll}
                  disabled={listLoading || prospects.length === 0}
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
              <TableRow>
                <TableCell colSpan={5} align="center">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : prospects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No hay prospectos en este filtro. Importa desde Prospectos IA.
                </TableCell>
              </TableRow>
            ) : (
              prospects.map((row) => (
                <TableRow key={row.id} hover selected={selectedIds.has(row.id)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                    />
                  </TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.phone || "-"}</TableCell>
                  <TableCell>{row.city || "-"}</TableCell>
                  <TableCell>
                    <span className="pill">{row.status || PROSPECT_STATUS.NEW}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </section>
  );
}

export const LAST_IMPORTED_PROSPECTS_KEY = LAST_IMPORTED_KEY;
