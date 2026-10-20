/** Partículas que se quedan en minúscula dentro de un nombre ("María de la Luz"). */
const NAME_PARTICLES = new Set(["de", "del", "la", "las", "los", "y"]);

/**
 * Nombre para mostrar. La caja captura como sale ("DAVID VENEGAS",
 * "virguinia"): todo mayúsculas o todo minúsculas se pasa a nombre propio para
 * que la lista se lea pareja. Un nombre con mayúsculas y minúsculas mezcladas
 * ya lo escribió alguien con cuidado y se respeta. El dato guardado no cambia.
 */
export function customerDisplayName(name: string | null | undefined): string {
  const value = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!value) return "Sin nombre";
  const isUpper = value === value.toLocaleUpperCase("es-MX");
  const isLower = value === value.toLocaleLowerCase("es-MX");
  if (!isUpper && !isLower) return value;
  return value
    .toLocaleLowerCase("es-MX")
    .split(" ")
    .map((word, index) =>
      index > 0 && NAME_PARTICLES.has(word) ? word : word.charAt(0).toLocaleUpperCase("es-MX") + word.slice(1)
    )
    .join(" ");
}

/** Dos iniciales para el avatar: nombre y primer apellido. */
export function customerInitials(name: string | null | undefined): string {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !NAME_PARTICLES.has(word.toLocaleLowerCase("es-MX")));
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toLocaleUpperCase("es-MX");
}

/** Tono fijo por cliente: el mismo avatar se reconoce en la lista y en su detalle. */
const AVATAR_TONES = [
  { bg: "rgba(6, 166, 224, 0.14)", fg: "#0369a1" },
  { bg: "rgba(124, 58, 237, 0.12)", fg: "#6d28d9" },
  { bg: "rgba(22, 163, 74, 0.13)", fg: "#15803d" },
  { bg: "rgba(234, 88, 12, 0.13)", fg: "#c2410c" },
  { bg: "rgba(219, 39, 119, 0.12)", fg: "#be185d" },
  { bg: "rgba(38, 45, 96, 0.1)", fg: "#262d60" },
];

export function customerAvatarTone(id: string): { bg: string; fg: string } {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
