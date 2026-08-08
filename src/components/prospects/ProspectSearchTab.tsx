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
import { DataTable } from "@/components/ui/DataTable";
import { ListPagination } from "@/components/ui/ListPagination";
import { ProspectStatusPill } from "@/components/prospects/prospect-status";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMxPhone } from "@/utils/format-phone";
import { PROSPECT_STATUS } from "@glamouroso/shared/constants";
import type {
  ProspectBulkDeleteResponse,
  ProspectImportResponse,
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

interface ProspectSearchTabProps {
  /** Avisar al padre que cambiaron los datos (para refrescar el embudo). */
  onDataChanged?: () => void;
  /** Cambiar al tab de envío directo tras importar. */
  onGoToContact?: () => void;
  newCount: number;
  notContactedCount: number;
}

export function ProspectSearchTab({
  onDataChanged,
  onGoToContact,
  newCount,
  notContactedCount,
}: ProspectSearchTabProps) {
  const router = useRouter();
  const { can } = usePermissions();
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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const canCreate = can("prospects", "create");
  const canDelete = can("prospects", "delete");

  const loadProspects = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await httpClient.get<ListResponse<ProspectRow>>("/prospects", {
        search: debouncedSearch,
        page,
        limit,
      });
      setProspects(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al cargar prospectos"));
    } finally {
      setListLoading(false);
    }
  }, [debouncedSearch, page, limit]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    loadProspects().catch(() => undefined);
  }, [loadProspects]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LAST_IMPORTED_KEY);
      if (raw) setLastImportedIds(JSON.parse(raw) as string[]);
    } catch {
      setLastImportedIds([]);
    }
  }, []);

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) {
      toast.error("Escribe que tipo de negocios quieres buscar");
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Buscando e importando negocios...");
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
      await loadProspects();
      onDataChanged?.();
      toast.success(
        `${result.imported.length} importados · ${result.skipped.noPhone} sin telefono · ${result.skipped.duplicate} duplicados`,
        { id: toastId }
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al buscar negocios"), { id: toastId });
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
      await loadProspects();
      onDataChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al limpiar prospectos"));
    } finally {
      setClearing(false);
    }
  }

  const lastImportedSet = new Set(lastImportedIds);
  const visibleProspects = showOnlyLastImport
    ? prospects.filter((row) => lastImportedSet.has(row.id))
    : prospects;

  return (
    <div className="grid gap-4">
      {canCreate && (
        <section className="panel p-4">
          <div className="mb-3">
            <h2>Buscar negocios con IA</h2>
            <p className="page-kicker">
              Describe a quien buscas y la IA importa negocios con telefono desde Google Places
              (Mexico). Luego contactalos en la pestana Envio directo.
            </p>
          </div>
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
              {lastResult && lastResult.imported.length > 0 && onGoToContact && (
                <Button type="button" variant="outlined" onClick={onGoToContact}>
                  Contactar {lastResult.imported.length} de esta busqueda
                </Button>
              )}
            </div>

            {lastResult && (
              <div
                className="flex flex-wrap items-center gap-2 border-t pt-3"
                style={{ borderColor: "var(--border)" }}
              >
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
      )}

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Negocios guardados</h2>
            <p className="page-kicker">
              {showOnlyLastImport
                ? "Mostrando solo la ultima busqueda."
                : "Haz clic en un negocio para ver su historial completo."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showOnlyLastImport && (
              <Button size="small" variant="text" onClick={() => setShowOnlyLastImport(false)}>
                Ver todos ({total})
              </Button>
            )}
            {canDelete && notContactedCount > 0 && (
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
              {visibleProspects.length} registros · {newCount} nuevos
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
            onRowClick={(row) => router.push(`/dashboard/prospeccion/${row.id}`)}
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
        {!showOnlyLastImport && (
          <ListPagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        )}
      </section>

      <Dialog open={confirmClearOpen} onClose={() => (clearing ? null : setConfirmClearOpen(false))}>
        <DialogTitle>Limpiar prospectos</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se eliminaran {notContactedCount} prospectos no contactados (nuevos y fallidos). Los ya
            contactados se conservan para no perder el historial. Esta accion no se puede deshacer.
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
