"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
import { isValidMexicanPhone } from "@glamouroso/shared/utils/phone";
import type {
  ProspectBulkCreateResponse,
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
  "Ferreterías en zona norte de Guadalajara",
  "Encuentra distribuidores de pintura en Guadalajara",
  "Busca tortillerías en Zapopan",
];

/** Parser CSV mínimo (soporta comillas dobles). Columnas: nombre,telefono,ciudad,giro,direccion */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const SOURCE_LABELS: Record<string, string> = {
  google_places: "Google Places",
  google_places_mock: "Google Places",
  manual: "Manual",
  csv: "CSV",
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
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);

  // Solo la carga más reciente escribe estado: al importar/limpiar cambian los
  // filtros y el useEffect relanza la carga; una respuesta vieja no debe pisarla.
  const loadSeq = useRef(0);
  const loadProspects = useCallback(async () => {
    const seq = ++loadSeq.current;
    setListLoading(true);
    try {
      // "Solo la última búsqueda" se filtra en el server por ids: si el import
      // fue grande y cae en varias páginas, el filtro local ocultaría filas.
      const params: Record<string, string | number> = { search: debouncedSearch, page, limit };
      if (showOnlyLastImport && lastImportedIds.length) {
        params.ids = lastImportedIds.slice(0, 100).join(",");
        params.limit = 100;
        params.page = 1;
      }
      const response = await httpClient.get<ListResponse<ProspectRow>>("/prospects", params);
      if (seq !== loadSeq.current) return;
      setProspects(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
    } catch (error) {
      if (seq !== loadSeq.current) return;
      toast.error(getApiErrorMessage(error, "Error al cargar prospectos"));
    } finally {
      if (seq === loadSeq.current) setListLoading(false);
    }
  }, [debouncedSearch, page, limit, showOnlyLastImport, lastImportedIds]);

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
      toast.error("Escribe qué tipo de negocios quieres buscar");
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
      // El cambio de filtros relanza la carga vía useEffect; llamar
      // loadProspects() aquí usaría el closure viejo (sin el filtro de ids).
      onDataChanged?.();
      toast.success(
        `${result.imported.length} importados · ${result.skipped.noPhone} sin teléfono · ${result.skipped.duplicate} duplicados` +
          (result.skipped.suppressed ? ` · ${result.skipped.suppressed} excluidos por no contactar` : ""),
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
      // La carga se relanza sola por el cambio de filtros (useEffect).
      onDataChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al limpiar prospectos"));
    } finally {
      setClearing(false);
    }
  }

  const lastImportedSet = new Set(lastImportedIds);
  const visibleProspects = prospects;

  async function handleAddManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") || "").trim();
    if (phone && !isValidMexicanPhone(phone)) {
      setPhoneError("Teléfono inválido: usa 10 dígitos (ej. 3312345678)");
      return;
    }
    setPhoneError(null);
    setSaving(true);
    try {
      await httpClient.post("/prospects", {
        name: String(form.get("name") || ""),
        phone: String(form.get("phone") || ""),
        city: String(form.get("city") || ""),
        businessType: String(form.get("businessType") || ""),
        address: String(form.get("address") || ""),
        source: "manual",
      });
      toast.success("Negocio agregado");
      setAddOpen(false);
      await loadProspects();
      onDataChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al agregar el negocio"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCsvFile(file: File) {
    setImportingCsv(true);
    const toastId = toast.loading("Importando CSV...");
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed.length) throw new Error("El archivo está vacío");
      // Detecta encabezado (si la primera fila trae "nombre"/"telefono", se salta).
      const first = parsed[0].map((c) => c.trim().toLowerCase());
      const hasHeader = first.some((c) => ["nombre", "name", "telefono", "teléfono", "phone"].includes(c));
      const dataRows = (hasHeader ? parsed.slice(1) : parsed).slice(0, 500);
      const rows = dataRows
        .map((cols) => ({
          name: (cols[0] || "").trim(),
          phone: (cols[1] || "").trim(),
          city: (cols[2] || "").trim(),
          businessType: (cols[3] || "").trim(),
          address: (cols[4] || "").trim(),
        }))
        .filter((r) => r.name.length >= 2);
      if (!rows.length) throw new Error("No encontré filas válidas (columnas: nombre, teléfono, ciudad, giro, dirección)");
      const result = await httpClient.post<ProspectBulkCreateResponse>("/prospects/csv-import", { rows });
      toast.success(
        `${result.imported} importados · ${result.skipped.duplicate} duplicados · ${result.skipped.noPhone} sin teléfono` +
          (result.skipped.suppressed ? ` · ${result.skipped.suppressed} excluidos` : ""),
        { id: toastId }
      );
      await loadProspects();
      onDataChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al importar el CSV"), { id: toastId });
    } finally {
      setImportingCsv(false);
    }
  }

  return (
    <div className="grid gap-4">
      {canCreate && (
        <section className="panel p-4">
          <div className="mb-3">
            <h2>Buscar negocios con IA</h2>
            <p className="page-kicker">
              Describe a quién buscas y la IA importa negocios con teléfono desde Google Places
              (México). Luego contáctalos en la pestaña Envío directo.
            </p>
          </div>
          <form onSubmit={handleImport} className="grid gap-4">
            <TextField
              label="¿Qué negocios buscas?"
              placeholder="Ej: ferreterías en zona norte de Guadalajara..."
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
                  Contactar {lastResult.imported.length} de esta búsqueda
                </Button>
              )}
            </div>

            {lastResult && (
              <div
                className="flex flex-wrap items-center gap-2 border-t pt-3"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="page-kicker" style={{ margin: 0 }}>
                  Última búsqueda: {lastResult.parsed.businessType} en {lastResult.parsed.city}
                  {lastResult.parsed.zone ? ` · ${lastResult.parsed.zone}` : ""}
                </span>
                <span className="pill-success">{lastResult.imported.length} importados</span>
                <span className="pill warning">{lastResult.skipped.noPhone} sin teléfono</span>
                <span className="pill-muted">{lastResult.skipped.duplicate} duplicados</span>
                {(lastResult.skipped.suppressed ?? 0) > 0 && (
                  <span className="pill-danger">{lastResult.skipped.suppressed} no contactar</span>
                )}
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
                ? "Mostrando solo la última búsqueda."
                : "Haz clic en un negocio para ver su historial completo."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showOnlyLastImport && (
              <Button size="small" variant="text" onClick={() => setShowOnlyLastImport(false)}>
                Ver todos
              </Button>
            )}
            {canCreate && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setPhoneError(null);
                    setAddOpen(true);
                  }}
                >
                  Agregar negocio
                </Button>
                <Button size="small" variant="outlined" component="label" disabled={importingCsv}>
                  {importingCsv ? "Importando..." : "Importar CSV"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void handleCsvFile(file);
                    }}
                  />
                </Button>
              </>
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
            placeholder="Buscar negocio, teléfono o ciudad"
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
              { key: "phone", label: "Teléfono", render: (row) => formatMxPhone(row.phone) },
              { key: "city", label: "Ciudad", render: (row) => row.city || "-" },
              { key: "address", label: "Dirección", render: (row) => row.address || "-" },
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

      <Dialog open={addOpen} onClose={() => (saving ? null : setAddOpen(false))} fullWidth maxWidth="sm">
        <form onSubmit={handleAddManual}>
          <DialogTitle>Agregar negocio</DialogTitle>
          <DialogContent className="form-grid" dividers>
            <TextField name="name" label="Nombre del negocio" fullWidth required autoFocus />
            <TextField
              name="phone"
              type="tel"
              label="Teléfono (WhatsApp)"
              error={Boolean(phoneError)}
              helperText={phoneError ?? "10 dígitos, ej: 33 1234 5678"}
              onChange={() => phoneError && setPhoneError(null)}
              fullWidth
            />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField name="city" label="Ciudad" fullWidth />
              <TextField name="businessType" label="Giro" placeholder="Ej: ferretería" fullWidth />
            </div>
            <TextField name="address" label="Dirección" fullWidth />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={confirmClearOpen} onClose={() => (clearing ? null : setConfirmClearOpen(false))}>
        <DialogTitle>Limpiar prospectos</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se eliminarán {notContactedCount} prospectos no contactados (nuevos y fallidos). Los ya
            contactados se conservan para no perder el historial. Esta acción no se puede deshacer.
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
