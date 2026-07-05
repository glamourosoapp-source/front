"use client";

import { ReactNode } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { es } from "date-fns/locale";
import { FONT_BODY, displayFontStyle, readingFontStyle, boldFontStyle } from "@/lib/brand-fonts";

const theme = createTheme({
  palette: {
    primary: {
      main: "#06a6e0",
      dark: "#0486b5",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#262d60",
      contrastText: "#ffe443",
    },
    warning: {
      main: "#ffe443",
      contrastText: "#262d60",
    },
    background: {
      default: "#f4f7fb",
      paper: "#ffffff",
    },
    text: {
      primary: "#172033",
      secondary: "#687084",
    },
    divider: "#e6ebf3",
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: FONT_BODY,
    // Encabezado líder: Flama Bold Italic
    h1: displayFontStyle,
    h2: displayFontStyle,
    h3: displayFontStyle,
    h4: displayFontStyle,
    h5: displayFontStyle,
    h6: displayFontStyle,
    // Secuencia de lectura: Flama Medium
    subtitle1: readingFontStyle,
    subtitle2: readingFontStyle,
    overline: readingFontStyle,
    // Secuencia de lectura (énfasis): Flama Bold
    button: {
      ...boldFontStyle,
      textTransform: "none",
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: "none",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          ...boldFontStyle,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: "#687084",
          fontSize: 12,
          ...readingFontStyle,
          letterSpacing: 0,
          textTransform: "uppercase",
          background: "#f8fafc",
          borderBottomColor: "#e6ebf3",
        },
        body: {
          color: "#172033",
          borderBottomColor: "#edf1f7",
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: "small",
      },
    },
  },
});

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}
