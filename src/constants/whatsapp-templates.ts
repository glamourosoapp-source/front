/** Estados de aprobacion que devuelve Meta para una plantilla de WhatsApp. */
export const TEMPLATE_STATUS_META: Record<string, { label: string; className: string }> = {
  APPROVED: { label: "Aprobada", className: "pill-success" },
  PENDING: { label: "En revision", className: "pill warning" },
  IN_APPEAL: { label: "En apelacion", className: "pill warning" },
  REJECTED: { label: "Rechazada", className: "pill-danger" },
  PAUSED: { label: "Pausada", className: "pill-danger" },
  DISABLED: { label: "Deshabilitada", className: "pill-danger" },
};

export function templateStatusMeta(status: string) {
  return TEMPLATE_STATUS_META[status] || { label: status, className: "pill" };
}

export const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidad",
  AUTHENTICATION: "Autenticacion",
};

export const TEMPLATE_LANGUAGE_OPTIONS = [
  { value: "es_MX", label: "Espanol (Mexico)" },
  { value: "es", label: "Espanol" },
  { value: "en_US", label: "Ingles (EE. UU.)" },
];
