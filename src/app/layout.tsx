import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { AppThemeProvider } from "@/components/providers/AppThemeProvider";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glamouroso CRM",
  description: "Pedidos, clientes, WhatsApp IA y campanas",
  // Los iconos salen de las convenciones de archivo (`app/icon.svg` para la
  // pestaña, `app/apple-icon.png` para la pantalla de inicio de iOS). El campo
  // `icons` de metadata NO sirve aquí: cuando existe `app/icon.*`, Next lo
  // ignora.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/* El cache de emotion tiene que pasar por `useServerInsertedHTML`: si no,
            el SSR escupe el <style> de emotion dentro del <body> y el cliente lo
            reinyecta en el <head>, lo que rompe la hidratacion en todas las rutas. */}
        <AppRouterCacheProvider options={{ key: "mui" }}>
          <AppThemeProvider>
            {children}
            <Toaster position="top-right" richColors />
          </AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
