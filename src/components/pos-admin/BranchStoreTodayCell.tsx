"use client";

import type { StoreDayEvaluation } from "@glamouroso/shared";

export function storeTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/** Marca roja del día: abrió tarde, cerró temprano, no abrió o sin cierre. */
export function StoreDayFlags({ day }: { day: StoreDayEvaluation }) {
  if (!day.flags.length) return null;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {day.flags.map((flag) => (
        <span
          key={flag.code}
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 6,
            background: "#fdecec",
            color: "#c62828",
            whiteSpace: "nowrap",
          }}
        >
          {flag.label}
        </span>
      ))}
    </span>
  );
}

/**
 * Columna "Hoy" de la lista de sucursales: a qué hora abrió y cerró, o si
 * todavía no abre. Las marcas salen del horario de la sucursal (15 min de
 * tolerancia).
 */
export function BranchStoreTodayCell({ day }: { day: StoreDayEvaluation | null }) {
  if (!day) return <span className="page-kicker">—</span>;
  const muted = { color: "var(--text-muted, #687084)", fontSize: 12 };
  let main: React.ReactNode;
  if (day.status === "not_opened") {
    main = (
      <span style={muted}>
        {day.hours ? `No ha abierto · abre ${day.hours.open}` : day.hasSchedule ? "Descanso" : "No ha abierto · sin horario"}
      </span>
    );
  } else {
    main = (
      <span style={{ fontSize: 13 }}>
        <strong style={{ color: "var(--glam-navy)" }}>Abrió {storeTime(day.openedAt)}</strong>
        {day.status === "closed" ? (
          <span style={muted}> · cerró {storeTime(day.closedAt)}</span>
        ) : (
          <span style={{ ...muted, color: "#2e7d32", fontWeight: 600 }}> · abierta</span>
        )}
        {day.reopenCount ? <span style={muted}> · reabrió {day.reopenCount}</span> : null}
      </span>
    );
  }
  return (
    <div style={{ display: "grid", gap: 3 }}>
      {main}
      <StoreDayFlags day={day} />
    </div>
  );
}
