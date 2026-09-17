import { Suspense } from "react";
import { TicketSettingsPage } from "@/components/pos-admin/ticket/TicketSettingsPage";

export const metadata = { title: "Ticket de venta" };

/** `Suspense` porque la pantalla lee `?branch=` con `useSearchParams`. */
export default function Page() {
  return (
    <Suspense fallback={<div className="panel p-5">Cargando...</div>}>
      <TicketSettingsPage />
    </Suspense>
  );
}
