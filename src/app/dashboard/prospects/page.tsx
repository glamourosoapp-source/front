"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, TextField } from "@mui/material";
import { DataTable } from "@/components/ui/DataTable";
import { httpClient } from "@/services/http-client";
import { PROSPECT_STATUS } from "@glamouroso/shared/constants";
import type { ProspectImportResponse } from "@glamouroso/shared/schemas/campaign";
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

export default function ProspectsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [lastResult, setLastResult] = useState<ProspectImportResponse | null>(null);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [lastImportedIds, setLastImportedIds] = useState<string[]>([]);

  const loadProspects = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await httpClient.get<ListResponse<ProspectRow>>("/prospects", {
        search: searchText,
        limit: 100,
      });
      setProspects(response.items);
    } catch {
      toast.error("Error al cargar prospectos");
    } finally {
      setListLoading(false);
    }
  }, [searchText]);

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

  const newCount = prospects.filter((p) => p.status === PROSPECT_STATUS.NEW).length;

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
        maxResults: 60,
      });
      setLastResult(result);
      const ids = result.imported.map((row) => String(row.id));
      setLastImportedIds(ids);
      sessionStorage.setItem(LAST_IMPORTED_KEY, JSON.stringify(ids));
      await loadProspects();
      toast.success(
        `${result.imported.length} importados · ${result.skipped.noPhone} sin telefono · ${result.skipped.duplicate} duplicados`,
        { id: toastId }
      );
    } catch {
      toast.error("Error al buscar prospectos", { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  function goToOutreach() {
    router.push("/dashboard/outreach?status=new");
  }

  const lastImportedSet = new Set(lastImportedIds);

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
        {newCount > 0 && (
          <Button variant="contained" onClick={goToOutreach}>
            Contactar {newCount} nuevos
          </Button>
        )}
      </div>

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

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? "Importando..." : "Buscar e importar"}
            </Button>
            {lastResult && lastResult.imported.length > 0 && (
              <Button type="button" variant="outlined" onClick={goToOutreach}>
                Contactar {lastResult.imported.length} de esta busqueda
              </Button>
            )}
          </div>
        </form>
      </section>

      {lastResult && (
        <section className="panel p-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2>Ultima busqueda</h2>
              <p className="page-kicker">
                {lastResult.parsed.businessType} en {lastResult.parsed.city}
                {lastResult.parsed.zone ? ` · ${lastResult.parsed.zone}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="pill">{lastResult.imported.length} importados</span>
              <span className="pill warning">{lastResult.skipped.noPhone} sin telefono</span>
              <span className="pill">{lastResult.skipped.duplicate} duplicados</span>
            </div>
          </div>
        </section>
      )}

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Prospectos guardados</h2>
            <p className="page-kicker">Listos para contactar en Outreach.</p>
          </div>
          <span className="pill">{prospects.length} registros · {newCount} nuevos</span>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto]">
          <input
            className="input"
            placeholder="Buscar negocio, telefono o ciudad"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button variant="outlined" onClick={loadProspects} disabled={listLoading}>
            Filtrar
          </Button>
        </div>
        <DataTable
          rows={prospects}
          getKey={(row) => row.id}
          columns={[
            { key: "name", label: "Negocio" },
            { key: "phone", label: "Telefono" },
            { key: "city", label: "Ciudad" },
            { key: "source", label: "Origen" },
            {
              key: "status",
              label: "Estado",
              render: (row) => (
                <span className="pill">
                  {row.status || PROSPECT_STATUS.NEW}
                  {lastImportedSet.has(row.id) ? " · reciente" : ""}
                </span>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
