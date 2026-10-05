"use client";

import { Button, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { WEEKDAY_KEYS, type BranchOpeningHours, type StoreDayHours, type WeekdayKey } from "@glamouroso/shared";

const LABELS: Record<WeekdayKey, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
};

/** Lunes primero, como se lee un horario de tienda. */
const ORDER: WeekdayKey[] = [...WEEKDAY_KEYS.slice(1), WEEKDAY_KEYS[0]];
const DEFAULT_DAY: StoreDayHours = { open: "09:00", close: "19:00" };

/** Los 7 días explícitos (`null` = no abre), que es como se guarda. */
export function completeOpeningHours(hours: BranchOpeningHours | null | undefined): Record<WeekdayKey, StoreDayHours | null> {
  return Object.fromEntries(ORDER.map((day) => [day, hours?.[day] ?? null])) as Record<WeekdayKey, StoreDayHours | null>;
}

/** Primer error de captura, o null si el horario es válido. */
export function openingHoursError(hours: Record<WeekdayKey, StoreDayHours | null>): string | null {
  for (const day of ORDER) {
    const value = hours[day];
    if (value && !(value.close > value.open)) return `${LABELS[day]}: la hora de cierre debe ser después de la apertura`;
  }
  return null;
}

/**
 * Horario semanal de la tienda. Contra él el panel marca abrió tarde, cerró
 * temprano, no abrió y sin cierre (15 min de tolerancia). Un día sin palomita
 * es descanso: no se marca nada.
 */
export function OpeningHoursEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<WeekdayKey, StoreDayHours | null>;
  onChange: (next: Record<WeekdayKey, StoreDayHours | null>) => void;
  disabled?: boolean;
}) {
  const set = (day: WeekdayKey, next: StoreDayHours | null) => onChange({ ...value, [day]: next });
  const copyMonday = () => {
    const monday = value.monday;
    if (!monday) return;
    onChange(Object.fromEntries(ORDER.map((day) => [day, value[day] ? { ...monday } : null])) as typeof value);
  };

  return (
    <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Typography variant="subtitle2">Horario de la tienda</Typography>
        <Button size="small" onClick={copyMonday} disabled={disabled || !value.monday}>
          Copiar el lunes a los días abiertos
        </Button>
      </div>
      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
        El cajero registra en la caja a qué hora abre y cierra; el panel marca lo que salga de este horario por más de 15
        minutos. Sin palomita = ese día no abre.
      </Typography>
      {ORDER.map((day) => {
        const hours = value[day];
        return (
          <div
            key={day}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(96px, 140px) minmax(96px, 1fr) minmax(96px, 1fr)",
              gap: 8,
              alignItems: "center",
            }}
          >
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={Boolean(hours)}
                  disabled={disabled}
                  onChange={(event) => set(day, event.target.checked ? (value.monday ?? DEFAULT_DAY) : null)}
                />
              }
              label={LABELS[day]}
            />
            {hours ? (
              <>
                <TextField
                  type="time"
                  size="small"
                  label="Abre"
                  value={hours.open}
                  disabled={disabled}
                  onChange={(event) => set(day, { ...hours, open: event.target.value })}
                  inputProps={{ step: 300 }}
                />
                <TextField
                  type="time"
                  size="small"
                  label="Cierra"
                  value={hours.close}
                  disabled={disabled}
                  error={!(hours.close > hours.open)}
                  onChange={(event) => set(day, { ...hours, close: event.target.value })}
                  inputProps={{ step: 300 }}
                />
              </>
            ) : (
              <Typography variant="body2" sx={{ color: "var(--muted)", gridColumn: "2 / -1" }}>
                No abre
              </Typography>
            )}
          </div>
        );
      })}
    </div>
  );
}
