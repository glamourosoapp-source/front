import type { Metadata } from "next";
import { AppThemeProvider } from "@/components/providers/AppThemeProvider";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glamouroso CRM",
  description: "Pedidos, clientes, WhatsApp IA y campanas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AppThemeProvider>
          {children}
          <Toaster position="top-right" richColors />
        </AppThemeProvider>
      </body>
    </html>
  );
}
