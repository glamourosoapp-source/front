/**
 * CODE39 para la hoja del navegador.
 *
 * La impresora térmica dibuja el código de barras sola (`GS k`), pero el
 * respaldo por diálogo del navegador es HTML: aquí se arman las barras para
 * pintarlas como SVG y que el folio se lea igual por los dos caminos.
 */

/** Patrón de 9 elementos por carácter: barra/espacio alternados, `w` = ancha. */
const PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", A: "wnnnnwnnw", B: "nnwnnwnnw",
  C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww",
  O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw",
  W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn", Z: "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", $: "nwnwnwnnn",
  "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
};

const NARROW = 1;
const WIDE = 3;
/** Espacio entre caracteres, del ancho de una barra angosta. */
const GAP = NARROW;

export interface Code39Bar {
  x: number;
  width: number;
}

export interface Code39Result {
  bars: Code39Bar[];
  /** Ancho total en unidades de barra angosta. */
  width: number;
  /** Lo que realmente se codificó (sin los caracteres no soportados). */
  value: string;
}

/** Deja solo lo que CODE39 puede dibujar. */
export function sanitizeCode39(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, "");
}

/** Barras (solo las negras) con su posición, listas para un `<rect>` por barra. */
export function encodeCode39(value: string): Code39Result {
  const sanitized = sanitizeCode39(value);
  const bars: Code39Bar[] = [];
  let x = 0;

  // El asterisco delimita el código por los dos lados: es parte del estándar.
  for (const char of `*${sanitized}*`) {
    const pattern = PATTERNS[char];
    if (!pattern) continue;
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === "w" ? WIDE : NARROW;
      // Los índices pares son barras; los impares, espacios.
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    }
    x += GAP;
  }

  return { bars, width: Math.max(0, x - GAP), value: sanitized };
}
