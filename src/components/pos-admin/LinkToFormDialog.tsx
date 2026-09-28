"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import type { FactoryFormAdmin, FactoryFormAdminRow } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { formatQuantity } from "@/lib/format-money";
import { UnlinkedRestockItem } from "@/types";
import { toast } from "sonner";
import { PAGE_HINTS } from "./FactoryFormSheet";

type Placement = "new" | "row";

const PACK_LABELS = ["caja", "paquete", "bolsa"];

function rowCaption(row: FactoryFormAdminRow): string {
  return `Hoja ${row.page}${PAGE_HINTS[row.page] ? ` (${PAGE_HINTS[row.page]})` : ""} · bloque ${row.block + 1}`;
}

/** Primera palabra con sustancia del nombre: ESCOBA BRUJA → ESCOBA. */
function keyword(name: string): string {
  return (
    name
      .toUpperCase()
      .split(/[^A-ZÁÉÍÓÚÑ]+/)
      .find((word) => word.length >= 3) ?? ""
  );
}

/**
 * Liga al formato de pedido un producto que se vendió sin renglón y deja listo
 * su surtido en el mismo paso: mínimo y conteo real por sucursal. Ligar solo no
 * basta (el faltante ignora lo que no tiene mínimo) y el negativo es falso (la
 * tienda tenía producto que nunca se dio de alta): sin conteo, el primer pedido
 * saldría por el mínimo más todo el negativo.
 */
export function LinkToFormDialog({
  items,
  onClose,
  onLinked,
}: {
  /** Las filas del mismo producto o línea, una por sucursal donde se vendió. */
  items: UnlinkedRestockItem[];
  onClose: () => void;
  onLinked: () => void;
}) {
  const first = items[0];
  const isLine = first.unit === "liters";
  const unit = isLine ? "L" : "pz";

  const [rows, setRows] = useState<FactoryFormAdminRow[]>([]);
  const [placement, setPlacement] = useState<Placement>("new");
  const [after, setAfter] = useState<FactoryFormAdminRow | null>(null);
  const [emptyRow, setEmptyRow] = useState<FactoryFormAdminRow | null>(null);
  const [label, setLabel] = useState(first.name.toUpperCase());
  const [packSize, setPackSize] = useState("1");
  const [packLabel, setPackLabel] = useState("caja");
  const [unitPrice, setUnitPrice] = useState("");
  const [perBranch, setPerBranch] = useState<Record<string, { minStock: string; stock: string }>>(() =>
    Object.fromEntries(items.map((item) => [item.branchId, { minStock: "", stock: "" }]))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    httpClient
      .get<FactoryFormAdmin>("/pos/factory-form/rows")
      .then((form) => {
        const list = form.rows.filter((row) => row.kind !== "blank");
        setRows(list);
        // Sugerencia: debajo del último renglón que comparte la palabra clave
        // (ESCOBA BRUJA → debajo de la última ESCOBA del formato).
        const word = keyword(first.name);
        // Palabra que EMPIEZA con la clave: "ESCOBA" no debe caer en PORTAESCOBAS.
        const startsWord = (text: string) => text.toUpperCase().split(/[^A-ZÁÉÍÓÚÑ]+/).some((w) => w.startsWith(word));
        const similar = word ? list.filter((row) => row.kind === "product" && startsWord(row.label)) : [];
        if (similar.length) setAfter(similar[similar.length - 1]);
      })
      .catch((error) => toast.error(getApiErrorMessage(error, "No se pudo cargar el formato de pedido")));
  }, [first.name]);

  /** Renglones de producto que existen en el papel pero no tienen producto ligado. */
  const emptyRows = useMemo(
    () => rows.filter((row) => row.kind === "product" && !row.lineId && !row.productId && row.label),
    [rows]
  );

  const missingMin = items.some((item) => perBranch[item.branchId]?.minStock.trim() === "");
  const placementReady = placement === "new" ? Boolean(after) && label.trim() !== "" : Boolean(emptyRow);
  const packReady = isLine || (Number(packSize) >= 1 && Number.isInteger(Number(packSize)));
  const canSave = placementReady && packReady && !missingMin && !saving;

  function setBranch(branchId: string, field: "minStock" | "stock", value: string) {
    setPerBranch((current) => ({ ...current, [branchId]: { ...current[branchId], [field]: value } }));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await httpClient.post("/pos/restock/unlinked/link", {
        lineId: first.lineId,
        productId: first.productId,
        placement:
          placement === "row"
            ? { mode: "row", rowId: emptyRow!.id }
            : { mode: "new", page: after!.page, block: after!.block, afterRow: after!.row, label: label.trim() },
        ...(isLine ? {} : { packSize: Number(packSize), packLabel: Number(packSize) > 1 ? packLabel : "pieza" }),
        unitPrice: unitPrice.trim() === "" ? null : Number(unitPrice),
        branches: items.map((item) => ({
          branchId: item.branchId,
          minStock: Number(perBranch[item.branchId].minStock),
          stock: perBranch[item.branchId].stock.trim() === "" ? null : Number(perBranch[item.branchId].stock),
        })),
      });
      toast.success(`${first.name} ya está en el formato de pedido`);
      onLinked();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo ligar al formato"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={() => (saving ? null : onClose())} fullWidth maxWidth="md">
      <DialogTitle>Ligar al formato de pedido: {first.name}</DialogTitle>
      <DialogContent dividers className="form-grid">
        <section style={{ display: "grid", gap: 12 }}>
          <strong>1. ¿Dónde va en el formato?</strong>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={placement}
            onChange={(_e, value) => value && setPlacement(value as Placement)}
          >
            <ToggleButton value="new">Agregar renglón nuevo</ToggleButton>
            <ToggleButton value="row" disabled={!emptyRows.length}>
              Usar un renglón vacío ({emptyRows.length})
            </ToggleButton>
          </ToggleButtonGroup>

          {placement === "new" ? (
            <>
              <Autocomplete
                options={rows}
                value={after}
                onChange={(_e, value) => setAfter(value)}
                groupBy={(row) => rowCaption(row)}
                getOptionLabel={(row) => row.label || "(renglón sin nombre)"}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderOption={(props, row) => (
                  <li {...props} key={row.id}>
                    <span style={{ fontWeight: row.kind === "section" ? 700 : 400 }}>{row.label}</span>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Debajo de"
                    placeholder="Busca el renglón del formato"
                    helperText={after ? rowCaption(after) : "El renglón nuevo se inserta debajo y los de abajo se recorren"}
                  />
                )}
              />
              <TextField
                label="Nombre en la hoja"
                value={label}
                onChange={(event) => setLabel(event.target.value.toUpperCase())}
                inputProps={{ maxLength: 120 }}
                helperText="Como va a aparecer en el formato impreso"
              />
            </>
          ) : (
            <Autocomplete
              options={emptyRows}
              value={emptyRow}
              onChange={(_e, value) => setEmptyRow(value)}
              groupBy={(row) => rowCaption(row)}
              getOptionLabel={(row) => row.label}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Renglón vacío"
                  helperText="Renglones que ya están en el papel sin producto del catálogo; conservan su nombre"
                />
              )}
            />
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {isLine ? (
              <TextField label="Empaque" value="Lo pone la línea (bidón)" disabled />
            ) : (
              <>
                <TextField
                  label="Piezas por empaque"
                  type="number"
                  value={packSize}
                  onChange={(event) => setPackSize(event.target.value)}
                  inputProps={{ min: 1, step: 1 }}
                  helperText="1 = se pide por pieza suelta"
                  error={!packReady}
                />
                {Number(packSize) > 1 ? (
                  <TextField select label="Tipo de empaque" value={packLabel} onChange={(event) => setPackLabel(event.target.value)}>
                    {PACK_LABELS.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}
              </>
            )}
            <TextField
              label="Precio a tienda por empaque"
              type="number"
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              inputProps={{ min: 0, step: "any" }}
              helperText="Vacío = costo del catálogo"
            />
          </div>
        </section>

        <section style={{ display: "grid", gap: 8 }}>
          <strong>2. Mínimo y existencia real por sucursal</strong>
          <p className="page-kicker" style={{ margin: 0 }}>
            Sin mínimo el faltante nunca lo pide. El negativo salió de vender sin existencia registrada: captura
            lo que hay hoy en la tienda para que el primer pedido no reponga de más. Vacío deja la existencia
            como está. En {isLine ? "litros" : "piezas"}.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Sucursal</th>
                <th style={{ textAlign: "right" }}>En sistema</th>
                <th>Conteo real hoy</th>
                <th>Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.branchId}>
                  <td>
                    {item.branchCode} · {item.branchName}
                  </td>
                  <td style={{ textAlign: "right", color: item.stock < 0 ? "#ef4444" : undefined, fontWeight: 700 }}>
                    {formatQuantity(item.stock)} {unit}
                  </td>
                  <td>
                    <TextField
                      size="small"
                      type="number"
                      placeholder="Sin contar"
                      value={perBranch[item.branchId].stock}
                      onChange={(event) => setBranch(item.branchId, "stock", event.target.value)}
                      inputProps={{ min: 0, step: "any", "aria-label": `Conteo real en ${item.branchCode}` }}
                    />
                  </td>
                  <td>
                    <TextField
                      size="small"
                      type="number"
                      required
                      value={perBranch[item.branchId].minStock}
                      onChange={(event) => setBranch(item.branchId, "minStock", event.target.value)}
                      inputProps={{ min: 0, step: "any", "aria-label": `Mínimo en ${item.branchCode}` }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={!canSave}>
          {saving ? "Ligando..." : "Ligar al formato"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
