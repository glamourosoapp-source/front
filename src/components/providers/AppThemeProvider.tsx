"use client";

import { ReactNode } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { es } from "date-fns/locale";

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
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: {
      fontWeight: 800,
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
          fontWeight: 800,
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
          fontWeight: 900,
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
