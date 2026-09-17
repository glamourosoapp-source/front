"use client";

import { useState, type ReactNode } from "react";
import { InputAdornment, TextField } from "@mui/material";
import { Search } from "lucide-react";
import { shiftDateOnly, todayInMexico } from "./pos-labels";

/**
 * Barra de filtros de las pantallas del punto de venta.
 *
 * Existe porque `.toolbar` reparte con `space-between`: con un buscador, un
 * interruptor y un contador, los tres quedaban separados de orilla a orilla.
 * Aquí van juntos, el buscador se lleva el espacio sobrante y solo lo que se
 * marca como `FilterMeta` se va a la derecha.
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}

/**
 * Buscador de la barra: **sin etiqueta flotante y con placeholder completo**.
 * Con `label` puesto, MUI esconde el placeholder hasta enfocar el campo, así
 * que un recuadro que solo decía "Buscar" no explicaba por qué se busca.
 */
export function FilterSearch({
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onEnter?: () => void;
}) {
  return (
    <TextField
      className="filter-search"
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onEnter?.();
      }}
      placeholder={placeholder}
      aria-label={placeholder}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search size={16} style={{ color: "var(--muted)" }} />
          </InputAdornment>
        ),
      }}
    />
  );
}

/** Lo que se va al extremo derecho de la barra: conteos y totales. */
export function FilterMeta({ children }: { children: ReactNode }) {
  return <div className="filter-meta">{children}</div>;
}

/** Línea vertical entre grupos de controles de la misma barra. */
export function FilterDivider() {
  return <span className="filter-divider" aria-hidden />;
}

/**
 * Control segmentado para rangos rápidos (Hoy / 7 días / 30 días): un bloque
 * con las opciones pegadas, en vez de tres botones sueltos con huecos.
 */
export function FilterSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="filter-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "active" : ""}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface DateRangeOption {
  key: string;
  label: string;
  /** Días hacia atrás desde hoy; `null` = sin filtro de fecha ("Todo"). */
  days: number | null;
}

/** Clave interna del tramo "Personalizado" del segmentado. */
const CUSTOM_KEY = "__custom";

/**
 * Rango de fechas de la barra: atajos pegados (Todo / Hoy / 7 días / 30 días)
 * más las dos fechas exactas. Es el mismo control en ventas y en pedidos a
 * fábrica, para que "buscar por fecha" se haga igual en todo el punto de venta.
 *
 * El rango vacío (`from` y `to` en blanco) significa **sin filtrar**; quien lo
 * usa decide si eso es una opción (pedidos) o no (ventas siempre trae rango).
 *
 * Con `collapsible`, los dos campos de fecha **solo aparecen al elegir
 * "Personalizado"**. En una barra que ya trae tres selectores, tenerlos
 * siempre visibles partía la fila en dos y dejaba los "dd/mm/aaaa" vacíos
 * colgando abajo; el 90 % de las veces se usa un atajo, no una fecha exacta.
 */
export function FilterDateRange({
  from,
  to,
  onChange,
  options,
  label = "Fecha",
  collapsible = false,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  options: DateRangeOption[];
  label?: string;
  collapsible?: boolean;
}) {
  const today = todayInMexico();
  const matched =
    options.find((option) =>
      option.days === null
        ? !from && !to
        : from === shiftDateOnly(today, -option.days) && to === today
    )?.key ?? null;
  // Un rango que no cae en ningún atajo ya es personalizado, venga de donde venga.
  const hasCustomRange = !matched && Boolean(from || to);
  const [customOpen, setCustomOpen] = useState(false);
  const showDates = !collapsible || hasCustomRange || customOpen;
  /*
   * Haber abierto "Rango" manda sobre el atajo que casualmente coincida: con
   * las dos fechas en blanco también calza "Todo", y se quedaba marcado ese
   * aunque el usuario acabara de pedir el rango.
   */
  const active = customOpen ? CUSTOM_KEY : (matched ?? (hasCustomRange ? CUSTOM_KEY : null));

  const segments = collapsible
    ? [...options.map((o) => ({ value: o.key, label: o.label })), { value: CUSTOM_KEY, label: "Rango" }]
    : options.map((o) => ({ value: o.key, label: o.label }));

  return (
    <>
      <FilterSegmented
        label={label}
        value={active}
        options={segments}
        onChange={(key) => {
          if (key === CUSTOM_KEY) {
            setCustomOpen(true);
            return;
          }
          setCustomOpen(false);
          const option = options.find((item) => item.key === key);
          if (!option) return;
          if (option.days === null) onChange({ from: "", to: "" });
          else onChange({ from: shiftDateOnly(today, -option.days), to: today });
        }}
      />
      {showDates ? (
        <>
          <FilterDivider />
          <TextField
            label="Desde"
            type="date"
            size="small"
            value={from}
            onChange={(event) => onChange({ from: event.target.value, to })}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 165 }}
          />
          <TextField
            label="Hasta"
            type="date"
            size="small"
            value={to}
            onChange={(event) => onChange({ from, to: event.target.value })}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 165 }}
          />
        </>
      ) : null}
    </>
  );
}
