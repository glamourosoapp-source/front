"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
} from "@mui/material";
import { BIDON_LITERS } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMoney } from "@/lib/format-money";
import { ListResponse, Product, ProductLine } from "@/types";
import { toast } from "sonner";

interface ProductLineFormDialogProps {
  open: boolean;
  line: ProductLine | null;
  onClose: () => void;
  onSaved: () => void;
}

function optionLabel(product: Product): string {
  const sku = product.sku ? ` · ${product.sku}` : "";
  return `${product.name}${sku} · ${formatMoney(product.price)}`;
}

/**
 * Alta y edición de una línea de líquido.
 *
 * Los dos SKU se eligen a mano a propósito: de ellos sale el precio de la venta
 * a granel (los litros sueltos se cobran al SKU de 1 L y cada 20 L completos al
 * de bidón), así que no se deducen del nombre.
 */
export function ProductLineFormDialog({ open, line, onClose, onSaved }: ProductLineFormDialogProps) {
  const isEdit = Boolean(line);
  const [isActive, setIsActive] = useState(line?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const [bidon, setBidon] = useState<Product | null>((line?.bidonProduct as Product) ?? null);
  const [liter, setLiter] = useState<Product | null>((line?.literProduct as Product) ?? null);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Product[]>([]);
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (!open) return;
    setIsActive(line?.isActive ?? true);
    setBidon((line?.bidonProduct as Product) ?? null);
    setLiter((line?.literProduct as Product) ?? null);
    setSearch("");
  }, [open, line]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    httpClient
      .get<ListResponse<Product>>("/products", {
        search: debouncedSearch,
        limit: 50,
        available: true,
      })
      .then((res) => {
        if (active) setOptions(res.items);
      })
      .catch(() => {
        if (active) setOptions([]);
      });
    return () => {
      active = false;
    };
  }, [open, debouncedSearch]);

  const canSellByLiter = Boolean(bidon && liter);
  const sameProduct = Boolean(bidon && liter && bidon.id === liter.id);

  const literPreview = useMemo(() => {
    if (!bidon || !liter) return null;
    const bidonPrice = Number(bidon.price || 0);
    const literPrice = Number(liter.price || 0);
    return { bidonPrice, literPrice, sample: bidonPrice + 5 * literPrice };
  }, [bidon, liter]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sameProduct) {
      toast.error("El bidón y el litro deben ser productos distintos");
      return;
    }
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(form.get("name") || "").trim(),
      bidonProductId: bidon?.id ?? null,
      literProductId: liter?.id ?? null,
      litersPerBidon: Number(form.get("litersPerBidon") || BIDON_LITERS),
    };

    setSaving(true);
    try {
      if (isEdit && line) {
        await httpClient.put(`/pos/lines/${line.id}`, { ...payload, isActive });
        toast.success("Línea actualizada");
      } else {
        await httpClient.post("/pos/lines", payload);
        toast.success("Línea creada");
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al guardar la línea"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" key={line?.id ?? "new"}>
      <form onSubmit={save}>
        <DialogTitle>{isEdit ? "Editar línea de líquido" : "Nueva línea de líquido"}</DialogTitle>
        <DialogContent className="form-grid" dividers>
          <TextField
            name="name"
            label="Nombre de la línea"
            defaultValue={line?.name || ""}
            required
            fullWidth
            sx={{ gridColumn: "1 / -1" }}
            helperText="Como la conocen en sucursal, p. ej. Mas Color o Ajax Hespel."
          />
          <Autocomplete
            options={options}
            value={bidon}
            onChange={(_e, value) => setBidon(value)}
            onInputChange={(_e, value) => setSearch(value)}
            getOptionLabel={optionLabel}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            filterOptions={(o) => o}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Producto de bidón (20 L)"
                helperText="Unidad con la que fábrica surte y precio de cada 20 L completos."
              />
            )}
            sx={{ gridColumn: "1 / -1" }}
          />
          <Autocomplete
            options={options}
            value={liter}
            onChange={(_e, value) => setLiter(value)}
            onInputChange={(_e, value) => setSearch(value)}
            getOptionLabel={optionLabel}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            filterOptions={(o) => o}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Producto de 1 litro"
                helperText="Precio de los litros sueltos servidos del bidón abierto."
              />
            )}
            sx={{ gridColumn: "1 / -1" }}
          />
          <TextField
            name="litersPerBidon"
            label="Litros por bidón"
            type="number"
            defaultValue={Number(line?.litersPerBidon ?? BIDON_LITERS)}
            inputProps={{ min: 1, step: 1 }}
            fullWidth
          />
          {isEdit ? (
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
              label={isActive ? "Activa" : "Inactiva"}
            />
          ) : null}

          {sameProduct ? (
            <Alert severity="error" sx={{ gridColumn: "1 / -1" }}>
              El bidón y el litro deben ser productos distintos del catálogo.
            </Alert>
          ) : canSellByLiter && literPreview ? (
            <Alert severity="success" sx={{ gridColumn: "1 / -1" }}>
              Se puede vender por litro. 25 L se cobran {formatMoney(literPreview.sample)}: un bidón
              de {formatMoney(literPreview.bidonPrice)} más 5 L a {formatMoney(literPreview.literPrice)}.
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ gridColumn: "1 / -1" }}>
              Sin los dos productos la línea agrupa el inventario en litros, pero la caja no puede
              vender litros sueltos.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={saving || sameProduct}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
