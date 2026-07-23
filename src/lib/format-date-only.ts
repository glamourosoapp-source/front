/**
 * Formatea una fecha DATEONLY "YYYY-MM-DD" sin pasar por new Date(string),
 * que la interpretaría como UTC y restaría un día en México.
 */
export function formatDateOnly(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "short" }
) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", options);
}

/** Fecha local del navegador como "YYYY-MM-DD", con offset opcional en días. */
export function localDateOnly(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
