import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { HEALTH_BG, HEALTH_COLORS } from "./pos-labels";

/**
 * Métrica compacta: ícono, etiqueta, valor y una línea de contexto. Con `href`
 * toda la tarjeta lleva a donde se resuelve (p. ej. inventario bajo su stock).
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  muted,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
  muted?: boolean;
  href?: string;
}) {
  const accent = tone === "warning" ? HEALTH_COLORS.warning : undefined;
  const body = (
    <>
      <div
        className="stat-tile-icon"
        style={accent ? { background: HEALTH_BG.warning, color: accent } : undefined}
      >
        <Icon size={18} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="stat-tile-label">{label}</div>
        <div className="stat-tile-value" style={{ color: accent ?? (muted ? "var(--muted)" : undefined) }}>
          {value}
        </div>
        {hint ? <div className="stat-tile-hint">{hint}</div> : null}
      </div>
      {href ? <ChevronRight size={16} style={{ color: "var(--muted)", alignSelf: "center" }} /> : null}
    </>
  );
  return href ? (
    <Link href={href} className="stat-tile stat-tile-link">
      {body}
    </Link>
  ) : (
    <div className="stat-tile">{body}</div>
  );
}

/** Renglón de ficha: ícono + etiqueta arriba + valor; sin valor, un texto gris. */
export function InfoRow({
  icon: Icon,
  label,
  value,
  empty = "—",
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  empty?: string;
}) {
  return (
    <div className="info-row">
      <Icon size={16} className="info-row-icon" />
      <div style={{ minWidth: 0 }}>
        <div className="stat-tile-label">{label}</div>
        <div className={value ? "info-row-value" : "info-row-value is-empty"}>{value ?? empty}</div>
      </div>
    </div>
  );
}
