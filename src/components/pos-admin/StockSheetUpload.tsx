"use client";

import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
} from "@mui/material";
import { FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/services/http-client";
import { formatQuantity } from "@/lib/format-money";
import {
  applyStockSheet,
  readStockSheetFile,
  type StockSheetFile,
  type StockSheetResult,
} from "@/lib/stock-sheet";

/** Excel elegido y la respuesta a "¿también como inventario?" (null = sin contestar). */
export interface StockSheetChoice {
  sheet: StockSheetFile;
  asInventory: boolean | null;
}

interface StockSheetPickerProps {
  value: StockSheetChoice | null;
  onChange: (value: StockSheetChoice | null) => void;
  disabled?: boolean;
}

/**
 * Adjuntar el Excel de stock de una sucursal (el formato de pedido a tiendas
 * con la Cant llena) y contestar si esas cantidades son también lo que la
 * sucursal tiene hoy. El archivo se lee aquí mismo para avisar de inmediato si
 * no es el formato.
 */
export function StockSheetPicker({ value, onChange, disabled }: StockSheetPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      const sheet = await readStockSheetFile(file);
      if (!sheet.entries.length) throw new Error("El Excel no trae ninguna cantidad en la columna Cant.");
      onChange({ sheet, asInventory: null });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo leer el Excel"));
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <FileSpreadsheet size={18} style={{ color: "var(--glam-blue)" }} />
          <strong>{value.sheet.fileName}</strong>
          <span style={{ color: "var(--muted)" }}>
            · {value.sheet.entries.length} renglones con cantidad en {value.sheet.pages} hoja
            {value.sheet.pages === 1 ? "" : "s"}
          </span>
          <Button size="small" color="inherit" startIcon={<X size={14} />} onClick={() => onChange(null)} disabled={disabled}>
            Quitar
          </Button>
        </div>
      ) : (
        <div>
          <Button
            variant="outlined"
            startIcon={<FileSpreadsheet size={16} />}
            onClick={() => inputRef.current?.click()}
            disabled={disabled || reading}
          >
            {reading ? "Leyendo…" : "Adjuntar Excel de stock"}
          </Button>
        </div>
      )}
      {value?.sheet.invalid.length ? (
        <Alert severity="warning">
          {value.sheet.invalid.length} cantidad{value.sheet.invalid.length === 1 ? "" : "es"} no son número y no se
          cargan: {value.sheet.invalid.map((item) => `${item.label} (${item.cell}: "${item.value}")`).join(", ")}.
        </Alert>
      ) : null}
      {value ? (
        <FormControl required error={value.asInventory === null}>
          <FormLabel>¿Estas cantidades son también el inventario que la sucursal tiene hoy?</FormLabel>
          <RadioGroup
            value={value.asInventory === null ? "" : value.asInventory ? "yes" : "no"}
            onChange={(event) => onChange({ ...value, asInventory: event.target.value === "yes" })}
          >
            <FormControlLabel
              value="yes"
              disabled={disabled}
              control={<Radio />}
              label="Sí: cargarlas como Stock y también como existencia de hoy (inventario inicial)"
            />
            <FormControlLabel
              value="no"
              disabled={disabled}
              control={<Radio />}
              label="No: solo como Stock (lo que la sucursal debe tener siempre)"
            />
          </RadioGroup>
        </FormControl>
      ) : null}
    </div>
  );
}

/** Aplica el Excel a la sucursal; el error se lanza para que quien llama decida qué decir. */
export async function applyStockChoice(branchId: string, choice: StockSheetChoice): Promise<StockSheetResult> {
  return applyStockSheet(branchId, choice.sheet, { asInventory: Boolean(choice.asInventory) });
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function SkippedList({ title, entries }: { title: string; entries: StockSheetResult["unknown"] }) {
  if (!entries.length) return null;
  return (
    <>
      <div style={{ marginTop: 8, fontWeight: 600 }}>{title}:</div>
      <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>
        {entries.map((entry) => (
          <li key={`${entry.page}:${entry.cell}`}>
            {entry.label} = {formatQuantity(entry.qty)} <span style={{ color: "var(--muted)" }}>(celda {entry.cell})</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Qué quedó cargado y qué renglones del Excel no se pudieron usar. */
export function StockSheetResultDialog({
  result,
  onClose,
}: {
  result: StockSheetResult | null;
  onClose: () => void;
}) {
  const skipped = result ? [...result.unknown, ...result.unlinked] : [];
  return (
    <Dialog open={Boolean(result)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Excel de stock cargado</DialogTitle>
      {result ? (
        <DialogContent dividers style={{ display: "grid", gap: 12 }}>
          <Alert severity="success">
            Stock guardado en {plural(result.saved, "producto", "productos")}: {formatQuantity(result.liters)} L y{" "}
            {formatQuantity(result.pieces)} pz.
            {result.inventory
              ? ` Inventario de hoy cargado en ${plural(result.inventory.applied, "producto", "productos")}.`
              : " El inventario no se tocó."}
          </Alert>
          {result.inventory?.errors.length ? (
            <Alert severity="error">
              No se cargó el inventario de:
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {result.inventory.errors.map((error) => (
                  <li key={error.label}>
                    {error.label}: {error.message}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {skipped.length ? (
            <Alert severity="warning">
              {plural(skipped.length, "renglón del Excel no se cargó", "renglones del Excel no se cargaron")}.
              Lígalos en Punto de venta → Formato de pedido y vuelve a cargar el Excel, o captúralos a mano en el Stock
              de la sucursal.
              <SkippedList title="No están en el formato de pedido" entries={result.unknown} />
              <SkippedList title="Su renglón del formato no tiene producto ligado" entries={result.unlinked} />
            </Alert>
          ) : null}
        </DialogContent>
      ) : null}
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Listo
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Cargar Excel" desde el Stock de una sucursal que ya existe. */
export function StockSheetImportDialog({
  open,
  branchId,
  onClose,
  onDone,
}: {
  open: boolean;
  branchId: string;
  onClose: () => void;
  onDone: (result: StockSheetResult) => void;
}) {
  const [choice, setChoice] = useState<StockSheetChoice | null>(null);
  const [saving, setSaving] = useState(false);

  function close() {
    if (saving) return;
    setChoice(null);
    onClose();
  }

  async function apply() {
    if (!choice || choice.asInventory === null) return;
    setSaving(true);
    try {
      const result = await applyStockChoice(branchId, choice);
      setChoice(null);
      onDone(result);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo cargar el Excel"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Cargar stock desde Excel</DialogTitle>
      <DialogContent dividers style={{ display: "grid", gap: 12 }}>
        <p className="page-kicker" style={{ margin: 0 }}>
          El formato de pedido a tiendas con la columna Cant llena, en empaques como en el papel. Se reemplaza el Stock
          de los productos que trae el Excel; los demás se quedan como están.
        </p>
        <StockSheetPicker value={choice} onChange={setChoice} disabled={saving} />
        {choice?.asInventory ? (
          <Alert severity="info">
            La existencia de hoy de esos productos queda igual a la del Excel, aunque ya tuvieran inventario (queda en el
            kardex como inventario inicial).
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={saving}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={() => void apply()}
          disabled={!choice || choice.asInventory === null || saving}
        >
          {saving ? "Cargando…" : "Cargar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
