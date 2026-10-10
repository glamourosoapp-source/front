"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Popover } from "@mui/material";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { FilterSegmented } from "./FilterBar";
import { posWeekStart, shiftDateOnly, todayInMexico } from "./pos-labels";

export type PeriodGranularity = "day" | "week" | "month" | "range";

export interface PeriodValue {
  granularity: PeriodGranularity;
  /** Día elegido (día), cualquier día de la semana o del mes, o inicio del rango. */
  anchor: string;
  /** Fin del rango; solo cuenta con `range`. */
  rangeTo: string;
}

/* ---- Fechas como texto YYYY-MM-DD ----
   Todo se calcula en UTC sobre la fecha sola: con `new Date("YYYY-MM-DD")` en
   hora local el día se recorre según la zona del navegador. */

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAYS_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const dowOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

function shiftMonth(day: string, months: number): string {
  const date = new Date(`${monthStart(day)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function monthEnd(day: string): string {
  return shiftDateOnly(shiftMonth(day, 1), -1);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const monthTitle = (day: string) => `${capitalize(MONTHS[Number(day.slice(5, 7)) - 1]!)} ${day.slice(0, 4)}`;

/** "9 oct" o "9 oct 2025" (el año solo si no es el actual). */
function shortDate(day: string, withYear = day.slice(0, 4) !== todayInMexico().slice(0, 4)): string {
  return `${Number(day.slice(8, 10))} ${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}${withYear ? ` ${day.slice(0, 4)}` : ""}`;
}

function rangeText(from: string, to: string): string {
  if (from === to) return `${WEEKDAYS_SHORT[dowOf(from)]} ${shortDate(from)}`;
  const crossYear = from.slice(0, 4) !== to.slice(0, 4);
  return `${shortDate(from, crossYear)} – ${shortDate(to, crossYear || undefined)}`;
}

/** Inicio y fin efectivos del periodo, con la semana del punto de venta (vie–jue). */
export function periodBounds(value: PeriodValue): { from: string; to: string } {
  if (value.granularity === "day") return { from: value.anchor, to: value.anchor };
  if (value.granularity === "week") {
    const from = posWeekStart(value.anchor);
    return { from, to: shiftDateOnly(from, 6) };
  }
  if (value.granularity === "month") return { from: monthStart(value.anchor), to: monthEnd(value.anchor) };
  return { from: value.anchor, to: value.rangeTo };
}

/**
 * Periodo contra el que se compara, con su etiqueta para el "vs …":
 * - día: el mismo día de la semana anterior (un viernes se compara con viernes);
 * - semana y mes: el anterior, **al mismo avance** si el actual va a medias
 *   (lunes contra lunes, día 10 contra día 10);
 * - rango: los mismos días justo antes.
 */
export function previousPeriod(
  value: PeriodValue,
  today: string = todayInMexico()
): { from: string; to: string; label: string } {
  const { from, to } = periodBounds(value);
  const end = to > today ? today : to;
  const length = from > end ? 1 : daysBetween(from, end);
  if (value.granularity === "day") {
    const prev = shiftDateOnly(from, -7);
    return { from: prev, to: prev, label: `vs ${WEEKDAYS_SHORT[dowOf(prev)]!.toLowerCase()} ${shortDate(prev)}` };
  }
  if (value.granularity === "week") {
    const prevFrom = shiftDateOnly(from, -7);
    return {
      from: prevFrom,
      to: shiftDateOnly(prevFrom, length - 1),
      label: length < 7 ? "vs semana anterior al mismo día" : "vs semana anterior",
    };
  }
  if (value.granularity === "month") {
    const prevFrom = shiftMonth(from, -1);
    const prevEnd = monthEnd(prevFrom);
    const candidate = shiftDateOnly(prevFrom, length - 1);
    const name = MONTHS[Number(prevFrom.slice(5, 7)) - 1]!;
    return {
      from: prevFrom,
      to: candidate > prevEnd ? prevEnd : candidate,
      label: end < to ? `vs ${name} al día ${Number(end.slice(8, 10))}` : `vs ${name}`,
    };
  }
  return {
    from: shiftDateOnly(from, -length),
    to: shiftDateOnly(from, -1),
    label: `vs ${length === 1 ? "el día anterior" : `los ${length} días anteriores`}`,
  };
}

/** Celdas de un mes: `null` donde no hay día, para alinear con el día de inicio de semana. */
function monthCells(month: string, weekStartDow: number): Array<string | null> {
  const first = monthStart(month);
  const lead = (dowOf(first) - weekStartDow + 7) % 7;
  const total = daysBetween(first, monthEnd(month));
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let i = 0; i < total; i++) cells.push(shiftDateOnly(first, i));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/* ---- Mes del calendario ---- */

interface MonthGridProps {
  month: string;
  weekStartDow: number;
  today: string;
  /** Inicio y fin marcados (pueden ser iguales); el tramo intermedio va sombreado. */
  from: string | null;
  to: string | null;
  onPick: (day: string) => void;
  onHover?: (day: string | null) => void;
}

function MonthGrid({ month, weekStartDow, today, from, to, onPick, onHover }: MonthGridProps) {
  const cells = useMemo(() => monthCells(month, weekStartDow), [month, weekStartDow]);
  const headers = Array.from({ length: 7 }, (_, i) => WEEKDAYS_SHORT[(weekStartDow + i) % 7]!);
  return (
    <div className="period-month">
      <div className="period-month-title">{monthTitle(month)}</div>
      <div className="period-grid" role="grid" onMouseLeave={() => onHover?.(null)}>
        {headers.map((label) => (
          <span key={label} className="period-weekday">
            {label}
          </span>
        ))}
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} className="period-cell is-empty" />;
          const disabled = day > today;
          const isStart = from === day;
          const isEnd = to === day;
          const inRange = Boolean(from && to && day > from && day < to);
          const classes = [
            "period-cell",
            isStart ? "is-start" : "",
            isEnd ? "is-end" : "",
            isStart && isEnd ? "is-single" : "",
            inRange ? "is-in" : "",
            day === today ? "is-today" : "",
            disabled ? "is-disabled" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <span key={day} className={classes} onMouseEnter={() => !disabled && onHover?.(day)}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(day)}
                aria-label={`${WEEKDAYS_LONG[dowOf(day)]} ${Number(day.slice(8, 10))} de ${MONTHS[Number(day.slice(5, 7)) - 1]}`}
                aria-pressed={isStart || isEnd}
              >
                {Number(day.slice(8, 10))}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Flechas para recorrer meses (o años) en la cabecera del calendario. */
function CalendarNav({
  onPrev,
  onNext,
  nextDisabled,
  label,
}: {
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  label: string;
}) {
  return (
    <>
      <button type="button" className="period-nav is-prev" onClick={onPrev} aria-label={`${label} anterior`}>
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        className="period-nav is-next"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={`${label} siguiente`}
      >
        <ChevronRight size={18} />
      </button>
    </>
  );
}

/* ---- Rango: calendario grande de dos meses con atajos ---- */

interface Preset {
  label: string;
  range: (today: string) => [string, string];
}

const RANGE_PRESETS: Preset[] = [
  { label: "Hoy", range: (t) => [t, t] },
  { label: "Ayer", range: (t) => [shiftDateOnly(t, -1), shiftDateOnly(t, -1)] },
  { label: "Esta semana (vie–jue)", range: (t) => [posWeekStart(t), t] },
  {
    label: "Semana pasada",
    range: (t) => {
      const start = shiftDateOnly(posWeekStart(t), -7);
      return [start, shiftDateOnly(start, 6)];
    },
  },
  { label: "Últimos 7 días", range: (t) => [shiftDateOnly(t, -6), t] },
  { label: "Últimos 30 días", range: (t) => [shiftDateOnly(t, -29), t] },
  { label: "Este mes", range: (t) => [monthStart(t), t] },
  { label: "Mes pasado", range: (t) => [shiftMonth(t, -1), monthEnd(shiftMonth(t, -1))] },
  { label: "Este año", range: (t) => [`${t.slice(0, 4)}-01-01`, t] },
];

function RangeCalendar({
  from,
  to,
  today,
  onApply,
  onCancel,
}: {
  from: string;
  to: string;
  today: string;
  onApply: (from: string, to: string) => void;
  onCancel: () => void;
}) {
  // Borrador: el primer clic pone el inicio, el segundo el fin. Nada se aplica
  // hasta "Aplicar", así un clic suelto no dispara cinco consultas.
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState<string | null>(to);
  const [hover, setHover] = useState<string | null>(null);
  // Se ven dos meses: el del fin y el anterior.
  const [viewEnd, setViewEnd] = useState(monthStart(to));
  const viewStart = shiftMonth(viewEnd, -1);

  // Mientras falta el fin, el tramo sigue al cursor para que se vea qué quedará.
  const previewTo = draftTo ?? (hover && hover >= draftFrom ? hover : draftFrom);
  const previewFrom = draftTo ? draftFrom : hover && hover < draftFrom ? hover : draftFrom;

  const pick = (day: string) => {
    if (draftTo || day < draftFrom) {
      setDraftFrom(day);
      setDraftTo(null);
    } else {
      setDraftTo(day);
    }
  };

  const activePreset = draftTo
    ? RANGE_PRESETS.find((preset) => {
        const [a, b] = preset.range(today);
        return a === draftFrom && b === draftTo;
      })?.label
    : undefined;

  const days = draftTo ? daysBetween(draftFrom, draftTo) : null;

  return (
    <div className="period-range">
      <aside className="period-presets" aria-label="Atajos de fecha">
        <span className="period-presets-title">Atajos</span>
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={activePreset === preset.label ? "active" : ""}
            onClick={() => {
              const [a, b] = preset.range(today);
              onApply(a, b);
            }}
          >
            {preset.label}
          </button>
        ))}
      </aside>
      <div className="period-range-main">
        <div className="period-months">
          <CalendarNav
            label="Mes"
            onPrev={() => setViewEnd(shiftMonth(viewEnd, -1))}
            onNext={() => setViewEnd(shiftMonth(viewEnd, 1))}
            nextDisabled={viewEnd >= monthStart(today)}
          />
          <div className="period-month-wrap is-secondary">
            <MonthGrid
              month={viewStart}
              weekStartDow={1}
              today={today}
              from={previewFrom}
              to={previewTo}
              onPick={pick}
              onHover={setHover}
            />
          </div>
          <div className="period-month-wrap">
            <MonthGrid
              month={viewEnd}
              weekStartDow={1}
              today={today}
              from={previewFrom}
              to={previewTo}
              onPick={pick}
              onHover={setHover}
            />
          </div>
        </div>
        <footer className="period-footer">
          <div className="period-summary">
            <span className="period-summary-field">
              <small>Desde</small>
              <b>{WEEKDAYS_SHORT[dowOf(draftFrom)]} {shortDate(draftFrom, true)}</b>
            </span>
            <span className="period-summary-arrow">→</span>
            <span className={`period-summary-field${draftTo ? "" : " is-pending"}`}>
              <small>Hasta</small>
              <b>{draftTo ? `${WEEKDAYS_SHORT[dowOf(draftTo)]} ${shortDate(draftTo, true)}` : "Elige el último día"}</b>
            </span>
            {days ? (
              <span className="period-summary-days">
                {days} {days === 1 ? "día" : "días"}
              </span>
            ) : null}
          </div>
          <div className="period-footer-actions">
            <Button onClick={onCancel}>Cancelar</Button>
            <Button variant="contained" disabled={!draftTo} onClick={() => draftTo && onApply(draftFrom, draftTo)}>
              Aplicar
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ---- Día y semana: un mes grande ---- */

function SingleMonthCalendar({
  value,
  week,
  today,
  onPick,
}: {
  value: string;
  week: boolean;
  today: string;
  onPick: (day: string) => void;
}) {
  const [view, setView] = useState(monthStart(value));
  const [hover, setHover] = useState<string | null>(null);
  // En semana el mes empieza en viernes: cada renglón es una semana del punto de venta.
  const target = week ? (hover ?? value) : value;
  const from = week ? posWeekStart(target) : value;
  const to = week ? shiftDateOnly(from, 6) : value;
  return (
    <div className="period-single">
      <div className="period-months is-single">
        <CalendarNav
          label="Mes"
          onPrev={() => setView(shiftMonth(view, -1))}
          onNext={() => setView(shiftMonth(view, 1))}
          nextDisabled={view >= monthStart(today)}
        />
        <div className="period-month-wrap">
          <MonthGrid
            month={view}
            weekStartDow={week ? 5 : 1}
            today={today}
            from={from}
            to={to}
            onPick={onPick}
            onHover={week ? setHover : undefined}
          />
        </div>
      </div>
      <p className="period-hint">
        {week
          ? "Cada renglón es una semana del punto de venta, de viernes a jueves. Toca cualquier día."
          : "Toca un día para ver su corte."}
      </p>
    </div>
  );
}

/* ---- Mes: rejilla de meses ---- */

function MonthPicker({ value, today, onPick }: { value: string; today: string; onPick: (month: string) => void }) {
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const currentYear = Number(today.slice(0, 4));
  return (
    <div className="period-monthpicker">
      <div className="period-months is-single">
        <CalendarNav
          label="Año"
          onPrev={() => setYear(year - 1)}
          onNext={() => setYear(year + 1)}
          nextDisabled={year >= currentYear}
        />
        <div className="period-month-title">{year}</div>
        <div className="period-month-grid">
          {MONTHS.map((name, index) => {
            const month = `${year}-${String(index + 1).padStart(2, "0")}-01`;
            const selected = monthStart(value) === month;
            const disabled = month > monthStart(today);
            return (
              <button
                key={name}
                type="button"
                disabled={disabled}
                className={`${selected ? "active" : ""}${month === monthStart(today) ? " is-current" : ""}`}
                onClick={() => onPick(month)}
              >
                {capitalize(name)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Control completo ---- */

const SEGMENTS: Array<{ value: PeriodGranularity; label: string }> = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "range", label: "Rango" },
];

/**
 * Selector de periodo de las pantallas del punto de venta: segmentado
 * Día / Semana / Mes / Rango, y un botón que dice el periodo elegido con
 * flechas para ir al anterior o al siguiente. El botón abre el calendario que
 * toca: un mes grande (día), un mes con renglones de viernes a jueves
 * (semana), los doce meses (mes) o, para el rango, dos meses grandes con
 * atajos. Reemplaza los `<input type="date">` sueltos, que en el rango eran dos
 * calendarios chicos del navegador sin ver el tramo elegido.
 */
export function PeriodPicker({ value, onChange }: { value: PeriodValue; onChange: (value: PeriodValue) => void }) {
  const today = todayInMexico();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  // Al elegir "Rango" el calendario se abre solo: es lo que se viene a hacer.
  const [openOnRange, setOpenOnRange] = useState(false);
  useEffect(() => {
    if (openOnRange && value.granularity === "range") {
      setOpen(true);
      setOpenOnRange(false);
    }
  }, [openOnRange, value.granularity]);

  const { from, to } = periodBounds(value);
  const label =
    value.granularity === "day"
      ? `${value.anchor === today ? "Hoy · " : ""}${WEEKDAYS_LONG[dowOf(value.anchor)]} ${Number(value.anchor.slice(8, 10))} de ${MONTHS[Number(value.anchor.slice(5, 7)) - 1]}`
      : value.granularity === "week"
        ? `Semana ${rangeText(from, to)}`
        : value.granularity === "month"
          ? monthTitle(value.anchor)
          : rangeText(from, to);
  const sublabel =
    value.granularity === "range" ? `${daysBetween(from, to)} ${daysBetween(from, to) === 1 ? "día" : "días"}` : null;

  const changeGranularity = (next: PeriodGranularity) => {
    if (next === value.granularity) {
      if (next === "range") setOpen(true);
      return;
    }
    if (next === "range") {
      // Un rango de un día no es lo que se busca: arranca con los 7 días que
      // terminan en la fecha que ya estaba elegida (o el periodo que se veía).
      const end = value.granularity === "day" ? value.anchor : to > today ? today : to;
      const start = value.granularity === "day" ? shiftDateOnly(end, -6) : from;
      onChange({ granularity: "range", anchor: start, rangeTo: end });
      setOpenOnRange(true);
      return;
    }
    // Al salir del rango, la fecha que manda es la final.
    const anchor = value.granularity === "range" ? value.rangeTo : value.anchor;
    onChange({ granularity: next, anchor, rangeTo: value.rangeTo });
  };

  /** Flechas ‹ ›: el periodo anterior o el siguiente del mismo tamaño. */
  const step = (direction: -1 | 1) => {
    if (value.granularity === "day") return onChange({ ...value, anchor: shiftDateOnly(value.anchor, direction) });
    if (value.granularity === "week") return onChange({ ...value, anchor: shiftDateOnly(value.anchor, 7 * direction) });
    if (value.granularity === "month") return onChange({ ...value, anchor: shiftMonth(value.anchor, direction) });
    const length = daysBetween(from, to);
    const end = shiftDateOnly(to, length * direction);
    onChange({
      ...value,
      anchor: shiftDateOnly(from, length * direction),
      rangeTo: end > today ? today : end,
    });
  };
  // Después de hoy no hay ventas: no se avanza a un periodo que ya incluye hoy.
  const nextDisabled = to >= today;

  return (
    <>
      <FilterSegmented label="Periodo" value={value.granularity} options={SEGMENTS} onChange={changeGranularity} />
      <div className="period-trigger-group">
        <button type="button" className="period-step" onClick={() => step(-1)} aria-label="Periodo anterior">
          <ChevronLeft size={17} />
        </button>
        <button
          ref={anchorRef}
          type="button"
          className={`period-trigger${open ? " is-open" : ""}`}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <CalendarDays size={16} />
          <span className="period-trigger-label">{label}</span>
          {sublabel ? <span className="period-trigger-sub">{sublabel}</span> : null}
          <ChevronDown size={15} className="period-trigger-caret" />
        </button>
        <button
          type="button"
          className="period-step"
          onClick={() => step(1)}
          disabled={nextDisabled}
          aria-label="Periodo siguiente"
        >
          <ChevronRight size={17} />
        </button>
      </div>
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { className: "period-popover", elevation: 0 } }}
      >
        {/* La llave reinicia el borrador del calendario cada vez que se abre. */}
        {open && value.granularity === "range" ? (
          <RangeCalendar
            key={`${from}-${to}`}
            from={from}
            to={to}
            today={today}
            onCancel={() => setOpen(false)}
            onApply={(a, b) => {
              onChange({ ...value, anchor: a, rangeTo: b });
              setOpen(false);
            }}
          />
        ) : null}
        {open && (value.granularity === "day" || value.granularity === "week") ? (
          <SingleMonthCalendar
            value={value.anchor}
            week={value.granularity === "week"}
            today={today}
            onPick={(day) => {
              onChange({ ...value, anchor: day });
              setOpen(false);
            }}
          />
        ) : null}
        {open && value.granularity === "month" ? (
          <MonthPicker
            value={value.anchor}
            today={today}
            onPick={(month) => {
              // El "ancla" de un mes pasado es su primer día; del mes en curso, hoy.
              onChange({ ...value, anchor: month === monthStart(today) ? today : month });
              setOpen(false);
            }}
          />
        ) : null}
      </Popover>
    </>
  );
}
