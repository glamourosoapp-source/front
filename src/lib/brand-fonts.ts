// Tipografía de marca Glamouroso (ver Front/src/styles/brand-fonts.css)

export const FONT_BODY =
  '"Flama", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const FONT_DISPLAY = FONT_BODY;

// Encabezado líder: Flama Bold Italic
export const displayFontStyle = {
  fontFamily: FONT_DISPLAY,
  fontStyle: "italic" as const,
  fontWeight: 700,
};

// Secuencia de lectura: Flama Medium
export const readingFontStyle = {
  fontFamily: FONT_BODY,
  fontWeight: 500,
};

// Secuencia de lectura (énfasis): Flama Bold
export const boldFontStyle = {
  fontFamily: FONT_BODY,
  fontWeight: 700,
};
