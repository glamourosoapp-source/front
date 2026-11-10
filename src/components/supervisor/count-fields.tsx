"use client";

import { KeyboardEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { countedQuantity, type InventoryCountItem } from "@glamouroso/shared";
import { unitLabel } from "@/components/pos-admin/pos-labels";
import { formatQuantity } from "@/lib/format-money";
import { countGroupOf, inputValue, parseCountInput } from "./supervisor-counts";

/**
 * Captura de un renglón de conteo (cíclico o inventario completo): qué campos
 * lleva según cómo se cuenta en la tienda, el − / + y la conversión a litros
 * o piezas. Ciego: nada de aquí ve lo esperado.
 */

/** Lo que se lleva escrito en un renglón, antes de guardarlo. */
export interface Draft {
  packs: string;
  loose: string;
}

export interface FieldSpec {
  key: keyof Draft;
  label: string;
  step: number;
  decimal: boolean;
}

/**
 * Los campos de cada renglón, según cómo se cuenta en la tienda:
 * líquidos = envases llenos + litros del abierto (de ½ en ½); cajas = cajas
 * + piezas sueltas; piezas = piezas.
 */
export function fieldsFor(item: InventoryCountItem): FieldSpec[] {
  const packSize = Number(item.packSize) || 1;
  const group = countGroupOf(item);
  if (group === "liquids") {
    if (packSize <= 1) return [{ key: "loose", label: "Litros", step: 0.5, decimal: true }];
    const pack = unitLabel(2, "bidon", item.packLabel || "bidón");
    return [
      // "Bidones llenos", "Garrafas llenas".
      { key: "packs", label: `${pack.charAt(0).toUpperCase()}${pack.slice(1)} ${pack.endsWith("as") ? "llenas" : "llenos"}`, step: 1, decimal: false },
      { key: "loose", label: "Litros del abierto", step: 0.5, decimal: true },
    ];
  }
  if (group === "packs") {
    const pack = unitLabel(2, "paquete", item.packLabel || "caja");
    return [
      { key: "packs", label: `${pack.charAt(0).toUpperCase()}${pack.slice(1)}`, step: 1, decimal: false },
      { key: "loose", label: "Piezas sueltas", step: 1, decimal: false },
    ];
  }
  return [{ key: "loose", label: "Piezas", step: 1, decimal: false }];
}

/** "Bidón de 20 L", "Caja de 12 pz", "Pieza". */
export function packDescription(item: InventoryCountItem): string {
  const packSize = Number(item.packSize) || 1;
  const label = item.packLabel?.trim() || (item.unit === "liters" ? "bidón" : packSize > 1 ? "caja" : "pieza");
  const name = `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  if (packSize <= 1) return item.unit === "liters" ? "Por litro" : name;
  return `${name} de ${formatQuantity(packSize)} ${item.unit === "liters" ? "L" : "pz"}`;
}

/** Lo capturado convertido a litros o piezas; null si no se ha escrito nada. */
export function draftQty(item: InventoryCountItem, draft: Draft | undefined): number | null {
  if (!draft || (!draft.packs.trim() && !draft.loose.trim())) return null;
  const hasPacks = fieldsFor(item).some((field) => field.key === "packs");
  return countedQuantity({
    packs: hasPacks ? parseCountInput(draft.packs) : 0,
    packSize: Number(item.packSize) || 1,
    loose: parseCountInput(draft.loose),
  });
}

/** Solo cifras (y un punto decimal en los litros): nada que el servidor no entienda. */
export function cleanInput(value: string, decimal: boolean): string {
  if (!decimal) return value.replace(/\D/g, "").slice(0, 6);
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = normalized.split(".");
  return (rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole).slice(0, 9);
}

export function Stepper({
  field,
  value,
  onChange,
  onEnter,
  id,
}: {
  field: FieldSpec;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  id: string;
}) {
  const bump = (direction: 1 | -1) => {
    const current = parseCountInput(value) ?? 0;
    const next = Math.max(0, Math.round((current + direction * field.step) / field.step) * field.step);
    onChange(inputValue(next));
  };
  return (
    <div className="supc-field">
      <label htmlFor={id}>{field.label}</label>
      <div className="supc-stepper">
        <button type="button" onClick={() => bump(-1)} aria-label={`Menos ${field.label.toLowerCase()}`}>
          <Minus size={18} />
        </button>
        <input
          id={id}
          type="text"
          inputMode={field.decimal ? "decimal" : "numeric"}
          autoComplete="off"
          enterKeyHint="done"
          value={value}
          placeholder="0"
          onChange={(event) => onChange(cleanInput(event.target.value, field.decimal))}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onEnter();
            }
          }}
        />
        <button type="button" onClick={() => bump(1)} aria-label={`Más ${field.label.toLowerCase()}`}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
