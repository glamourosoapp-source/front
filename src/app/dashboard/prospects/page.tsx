"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import { Sparkles, Users, PhoneCall, AlertTriangle } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { ProspectStatusPill } from "@/components/prospects/prospect-status";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMxPhone } from "@/utils/format-phone";
import { PROSPECT_STATUS } from "@glamouroso/shared/constants";
import type {
  ProspectBulkDeleteResponse,
  ProspectImportResponse,
  ProspectMetricsResponse,
} from "@glamouroso/shared/schemas/campaign";
import { ListResponse } from "@/types";
import { toast } from "sonner";

const LAST_IMPORTED_KEY = "lastImportedProspectIds";

interface ProspectRow {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  businessType?: string | null;
  status?: string;
  source?: string;
}

const PROMPT_SUGGESTIONS = [
  "Buscame en zona norte de la ciudad de Jalisco ferreterias",
  "Encuentra distribuidores de pintura en Guadalajara",
  "Busca tortillerias en Zapopan",
];

const SOURCE_LABELS: Record<string, string> = {
  google_places: "Google Places",
  google_places_mock: "Google Places",
  manual: "Manual",
};

const emptyMetrics: ProspectMetricsResponse = {
  total: 0,
  byStatus: { new: 0, contacted_whatsapp: 0, contacted_voice: 0, failed: 0 },
  contactedToday: 0,
};

export default function ProspectsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(60);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText, 300);
  const [lastResult, setLastResult] = useState<ProspectImportResponse | null>(null);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [lastImportedIds, setLastImportedIds] = useState<string[]>([]);
  const [showOnlyLastImport, setShowOnlyLastImport] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [metrics, setMetrics] = useState<ProspectMetricsResponse>(emptyMetrics);

  const loadMetrics = useCallback(async () => {
    try {
      const data = await httpClient.get<ProspectMetricsResponse>("/prospects/metrics");
      setMetrics(data);
    } catch {
      // métricas son secundarias: si fallan, se quedan en cero
    }
  }, []);

  const loadProspects = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await httpClient.get<ListResponse<ProspectRow>>("/prospects", {
        search: debouncedSearch,
        limit: 100,
      });
      setProspects(response.items);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar prospectos"));
    } finally {
      setListLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    loadProspects().catch(() => undefined);
  }, [loadProspects]);

  useEffect(() => {
    loadMetrics().catch(() => undefined);
  }, [loadMetrics]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LAST_IMPORTED_KEY);
      if (raw) setLastImportedIds(JSON.parse(raw) as string[]);
    } catch {
      setLastImportedIds([]);
    }
  }, []);

  const contactedTotal = metrics.byStatus.contacted_whatsapp + metrics.byStatus.contacted_voice;
  const notContactedCount = metrics.byStatus.new + metrics.byStatus.failed;

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) {
      toast.error("Escribe que tipo de negocios quieres buscar");
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Buscando e importando prospectos...");
    try {
      const result = await httpClient.post<ProspectImportResponse>("/prospects/ai-import", {
        query: query.trim(),
        maxResults,
      });
      setLastResult(result);
      const ids = result.imported.map((row) => String(row.id));
      setLastImportedIds(ids);
      setShowOnlyLastImport(ids.length > 0);
      sessionStorage.setItem(LAST_IMPORTED_KEY, JSON.stringify(ids));
      await Promise.all([loadProspects(), loadMetrics()]);
      toast.success(
        `${result.imported.length} importados · ${result.skipped.noPhone} sin telefono · ${result.skipped.duplicate} duplicados`,
        { id: toastId }
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al buscar prospectos"), { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  async function handleClearProspects() {
    setClearing(true);
    try {
      const result = await httpClient.post<ProspectBulkDeleteResponse>("/prospects/bulk-delete", {
        onlyNotContacted: true,
      });
      toast.success(`${result.deleted} prospectos eliminados`);
      setConfirmClearOpen(false);
      setShowOnlyLastImport(false);
      setLastImportedIds([]);
      setLastResult(null);
      sessionStorage.removeItem(LAST_IMPORTED_KEY);
      await Promise.all([loadProspects(), loadMetrics()]);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al limpiar prospectos"));
    } finally {
      setClearing(false);
    }
  }

  function goToOutreach() {
    router.push("/dashboard/outreach?status=new");
  }

  const lastImportedSet = new Set(lastImportedIds);
  const visibleProspects = showOnlyLastImport
    ? prospects.filter((row) => lastImportedSet.has(row.id))
    : prospects;

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Prospectos IA</h1>
          <p className="page-kicker">
            Paso 1: describe a quien buscas e importa negocios con telefono desde Google Places (Mexico).
            Despues contacta desde Outreach.
          </p>
        </div>
        {metrics.byStatus.new > 0 && (
          <Button variant="contained" onClick={goToOutreach}>
            Contactar {metrics.byStatus.new} nuevos
          </Button>
        )}
      </div>

      <section className="grid grid-4">
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Total prospectos</span>
            <Users size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.total}</strong>
          <small>En tu base de captacion</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Nuevos</span>
            <Sparkles size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.byStatus.new}</strong>
          <small>Listos para contactar</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Contactados</span>
            <PhoneCall size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{contactedTotal}</strong>
          <small>{metrics.contactedToday} hoy</small>
        </div>
        <div className="card metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span>Fallidos</span>
            <AlertTriangle size={18} style={{ color: "var(--glam-blue)" }} />
          </div>
          <strong>{metrics.byStatus.failed}</strong>
          <small>Revisa telefono o reintenta</small>
        </div>
      </section>

      <section className="panel p-4">
        <form onSubmit={handleImport} className="grid gap-4">
          <TextField
            label="Que negocios buscas?"
            placeholder="Ej: ferreterias en zona norte de Guadalajara..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            required
          />

          <div className="flex flex-wrap gap-2">
            {PROMPT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="pill cursor-pointer border-0 bg-transparent"
                onClick={() => setQuery(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="max-results-label">Resultados</InputLabel>
              <Select
                labelId="max-results-label"
                label="Resultados"
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
              >
                <MenuItem value={20}>Hasta 20</MenuItem>
                <MenuItem value={40}>Hasta 40</MenuItem>
                <MenuItem value={60}>Hasta 60</MenuItem>
              </Select>
            </FormControl>
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? "Importando..." : "Buscar e importar"}
            </Button>
            {lastResult && lastResult.imported.length > 0 && (
              <Button type="button" variant="outlined" onClick={goToOutreach}>
                Contactar {lastResult.imported.length} de esta busqueda
              </Button>
            )}
          </div>

          {lastResult && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <span className="page-kicker" style={{ margin: 0 }}>
                Ultima busqueda: {lastResult.parsed.businessType} en {lastResult.parsed.city}
                {lastResult.parsed.zone ? ` · ${lastResult.parsed.zone}` : ""}
              </span>
              <span className="pill-success">{lastResult.imported.length} importados</span>
              <span className="pill warning">{lastResult.skipped.noPhone} sin telefono</span>
              <span className="pill-muted">{lastResult.skipped.duplicate} duplicados</span>
            </div>
          )}
        </form>
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Prospectos guardados</h2>
            <p className="page-kicker">
              {showOnlyLastImport
                ? "Mostrando solo la ultima busqueda."
                : "Listos para contactar en Outreach."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showOnlyLastImport && (
              <Button size="small" variant="text" onClick={() => setShowOnlyLastImport(false)}>
                Ver todos ({prospects.length})
              </Button>
            )}
            {notContactedCount > 0 && (
              <Button
                size="small"
                color="error"
                variant="outlined"
                onClick={() => setConfirmClearOpen(true)}
              >
                Limpiar lista
              </Button>
            )}
            <span className="pill">
              {visibleProspects.length} registros · {metrics.byStatus.new} nuevos
            </span>
          </div>
        </div>
        <div className="mb-4">
          <input
            className="input"
            placeholder="Buscar negocio, telefono o ciudad"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        {listLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={48} animation="wave" />
            ))}
          </div>
        ) : (
          <DataTable
            rows={visibleProspects}
            getKey={(row) => row.id}
            columns={[
              { key: "name", label: "Negocio" },
              { key: "phone", label: "Telefono", render: (row) => formatMxPhone(row.phone) },
              { key: "city", label: "Ciudad", render: (row) => row.city || "-" },
              { key: "address", label: "Direccion", render: (row) => row.address || "-" },
              {
                key: "source",
                label: "Origen",
                render: (row) => SOURCE_LABELS[row.source || ""] || row.source || "-",
              },
              {
                key: "status",
                label: "Estado",
                render: (row) => (
                  <span className="flex items-center gap-2">
                    <ProspectStatusPill status={row.status || PROSPECT_STATUS.NEW} />
                    {lastImportedSet.has(row.id) && <span className="pill warning">reciente</span>}
                  </span>
                ),
              },
            ]}
          />
        )}
      </section>

      <Dialog open={confirmClearOpen} onClose={() => (clearing ? null : setConfirmClearOpen(false))}>
        <DialogTitle>Limpiar prospectos</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se eliminaran {notContactedCount} prospectos no contactados (nuevos y fallidos). Los ya
            contactados se conservan para no perder el historial de outreach. Esta accion no se
            puede deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearOpen(false)} disabled={clearing}>
            Cancelar
          </Button>
          <Button color="error" variant="contained" onClick={handleClearProspects} disabled={clearing}>
            {clearing ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
