import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Novedades del CRM — Glamouroso",
  description: "Qué se construyó esta semana en la plataforma, explicado sin tecnicismos.",
  robots: { index: false, follow: false },
};

export default function NovedadesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
