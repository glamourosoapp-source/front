"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { Plus, Save } from "lucide-react";
import { CONTAINER_MATERIALS, type ContainerMaterial } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMoney } from "@/lib/format-money";
import type { ListResponse, PosContainerRule, Product } from "@/types";
import { toast } from "sonner";

/** Cómo se lee cada tamaño en la tabla: los litros del catálogo → la etiqueta del negocio. */
export function litersLabel(liters: number | string): string {
  const value = Number(liters);
  if (Math.abs(value - 0.5) < 0.005) return "1/2 L";
  if (Math.abs(value - 0.91) < 0.005) return "910 ml";
  if (Math.abs(value - 4) < 0.005) return "4 L (galón)";
  return `${Number.isInteger(value) ? value : value.toFixed(2)} L`;
}

export function materialLabel(material: ContainerMaterial | string): string {
  return material === CONTAINER_MATERIALS.POLYETHYLENE ? "Polietileno" : "PET";
}

function productLabel(product: Product | null | undefined): string {
  if (!product) return "";
  const cost = Number(product.cost ?? 0);
  return cost > 0 ? `${product.name} · ${formatMoney(cost)}` : product.name;
}

/** Buscador de un producto del catálogo (envase o tapa), con búsqueda al servidor. */
function ProductPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Product | null;
  onChange: (product: Product | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Product[]>([]);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (disabled) return;
    let active = true;
    httpClient
      .get<ListResponse<Product>>("/products", { search: debouncedSearch, limit: 30, available: true })
      .then((res) => {
        if (active) setOptions(res.items);
      })
      .catch(() => {
        if (active) setOptions([]);
      });
    return () => {
      active = false;
    };
  }, [debouncedSearch, disabled]);

  return (
    <Autocomplete
      options={options}
      value={value}
      disabled={disabled}
      size="small"
      onChange={(_e, next) => onChange(next)}
      onInputChange={(_e, next) => setSearch(next)}
      getOptionLabel={productLabel}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      filterOptions={(o) => o}
      renderInput={(params) => <TextField {...params} label={label} placeholder="Buscar en el catálogo" />}
      sx={{ minWidth: 260 }}
    />
  );
}

interface RuleDraft {
  material: ContainerMaterial;
  liters: number;
  container: Product | null;
  cap: Product | null;
}

function ruleKey(rule: { material: string; liters: number | string }): string {
  return `${rule.material}:${Number(rule.liters).toFixed(3)}`;
}

/**
 * Envases y tapas por material × litros. Al vender una presentación envasada
 * la caja descuenta 1 envase + 1 tapa por pieza según esta tabla; los litros
 * sueltos y el bidón de 20 L no. Una fila sin envase o sin tapa no descuenta
 * nada y la venta queda con aviso.
 */
export function ContainerRulesTab({ canManage }: { canManage: boolean }) {
  const [rules, setRules] = useState<PosContainerRule[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newRule, setNewRule] = useState<RuleDraft>({
    material: CONTAINER_MATERIALS.PET,
    liters: 1,
    container: null,
    cap: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await httpClient.get<PosContainerRule[]>("/pos/container-rules");
      setRules(data);
      const next: Record<string, RuleDraft> = {};
      for (const rule of data) {
        next[ruleKey(rule)] = {
          material: rule.material,
          liters: Number(rule.liters),
          container: (rule.containerProduct as Product | null) ?? null,
          cap: (rule.capProduct as Product | null) ?? null,
        };
      }
      setDrafts(next);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los envases y tapas"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...rules].sort((a, b) =>
        a.material === b.material ? Number(a.liters) - Number(b.liters) : a.material.localeCompare(b.material)
      ),
    [rules]
  );

  async function save(draft: RuleDraft, key: string) {
    setSaving(key);
    try {
      await httpClient.put<PosContainerRule>("/pos/container-rules", {
        material: draft.material,
        liters: draft.liters,
        containerProductId: draft.container?.id ?? null,
        capProductId: draft.cap?.id ?? null,
      });
      toast.success(`${materialLabel(draft.material)} ${litersLabel(draft.liters)} guardado`);
      setAdding(false);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar la regla"));
    } finally {
      setSaving(null);
    }
  }

  const missing = sorted.filter((rule) => !rule.containerProductId || !rule.capProductId).length;

  return (
    <div className="page-stack">
      <div className="panel p-4">
        <p className="page-kicker" style={{ margin: 0 }}>
          Al vender una presentación envasada de una línea (1/2, 910 ml, 1, 2, 4, 5 o 10 L) la caja
          descuenta <strong>1 envase y 1 tapa por pieza</strong>, además de los litros. Los litros
          sueltos y el bidón de 20 L no descuentan envase. Las líneas de polietileno solo tienen
          envase de 1 L y galón: otro tamaño no descuenta nada y la venta queda con aviso.
        </p>
      </div>

      <div className="toolbar">
        <div>
          {missing ? (
            <Chip
              size="small"
              color="warning"
              label={`${missing} ${missing === 1 ? "tamaño sin configurar" : "tamaños sin configurar"}`}
            />
          ) : (
            <Chip size="small" color="success" label="Todos los tamaños configurados" />
          )}
        </div>
        {canManage ? (
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setAdding(true)}>
            Agregar tamaño
          </Button>
        ) : null}
      </div>

      <div className="table-container-premium">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Material</th>
              <th style={{ width: 120 }}>Tamaño</th>
              <th>Envase</th>
              <th>Tapa</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((rule) => {
              const key = ruleKey(rule);
              const draft = drafts[key];
              if (!draft) return null;
              const incomplete = !draft.container || !draft.cap;
              const dirty =
                (draft.container?.id ?? null) !== (rule.containerProductId ?? null) ||
                (draft.cap?.id ?? null) !== (rule.capProductId ?? null);
              return (
                <tr key={key} style={incomplete ? { background: "#fff7ed" } : undefined}>
                  <td>
                    <strong>{materialLabel(rule.material)}</strong>
                  </td>
                  <td>{litersLabel(rule.liters)}</td>
                  <td>
                    <ProductPicker
                      label="Envase"
                      value={draft.container}
                      disabled={!canManage}
                      onChange={(product) => setDrafts((prev) => ({ ...prev, [key]: { ...draft, container: product } }))}
                    />
                  </td>
                  <td>
                    <ProductPicker
                      label="Tapa"
                      value={draft.cap}
                      disabled={!canManage}
                      onChange={(product) => setDrafts((prev) => ({ ...prev, [key]: { ...draft, cap: product } }))}
                    />
                    {incomplete ? (
                      <p className="page-kicker" style={{ margin: "4px 0 0", color: "#b45309" }}>
                        Sin configurar: las ventas de este tamaño no descontarán envase.
                      </p>
                    ) : null}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {canManage ? (
                      <Button
                        size="small"
                        variant={dirty ? "contained" : "outlined"}
                        startIcon={<Save size={14} />}
                        disabled={!dirty || saving === key}
                        onClick={() => void save(draft, key)}
                      >
                        Guardar
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!sorted.length && !loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                  No hay tamaños configurados. Agrega el primero.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {loading ? <p className="page-kicker">Cargando...</p> : null}

      <Dialog open={adding} onClose={() => setAdding(false)} fullWidth maxWidth="sm">
        <DialogTitle>Agregar tamaño</DialogTitle>
        <DialogContent dividers>
          <div className="page-stack">
            <TextField
              select
              size="small"
              label="Material"
              value={newRule.material}
              onChange={(e) => setNewRule({ ...newRule, material: e.target.value as ContainerMaterial })}
            >
              <MenuItem value={CONTAINER_MATERIALS.PET}>PET</MenuItem>
              <MenuItem value={CONTAINER_MATERIALS.POLYETHYLENE}>Polietileno</MenuItem>
            </TextField>
            <TextField
              size="small"
              label="Litros por envase"
              type="number"
              value={newRule.liters}
              inputProps={{ min: 0.1, step: 0.01 }}
              onChange={(e) => setNewRule({ ...newRule, liters: Number(e.target.value) })}
              helperText="Debe coincidir con los litros por unidad de la presentación (0.5, 0.91, 1, 2, 4, 5, 10)."
            />
            <ProductPicker label="Envase" value={newRule.container} onChange={(p) => setNewRule({ ...newRule, container: p })} />
            <ProductPicker label="Tapa" value={newRule.cap} onChange={(p) => setNewRule({ ...newRule, cap: p })} />
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdding(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!(newRule.liters > 0) || saving === "new"}
            onClick={() => void save(newRule, "new")}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
