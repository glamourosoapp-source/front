"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { CASHIER_POS_LINKS, PosLinksProvider } from "@/components/pos-admin/pos-links";
import type { PosSession } from "@/types";

/**
 * Pedido a fábrica desde la caja (menú "Más" → "Pedido a fábrica"). Solo para
 * las sucursales con "La caja hace su pedido a fábrica" en Editar datos: el
 * permiso es de la sucursal, no del perfil Cajero. Son las mismas pantallas del
 * panel y del supervisor (revisar y enviar, hoja del pedido) con las rutas de
 * la caja; el Back solo le abre las de SU sucursal.
 */
export default function CashierRestockLayout({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PosSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    httpClient
      .get<PosSession>("/pos/session")
      .then(setSession)
      .catch((err) => setError(getApiErrorMessage(err, "No se pudo abrir el pedido. Revisa el internet.")));
  }, []);

  const allowed = Boolean(session?.branch.cashierRestock);
  // La pantalla del pedido trae su propio "Volver a la caja"; mientras no
  // carga (o sin permiso) va este.
  const back = (
    <Link href="/pos" className="pos-action" style={{ textDecoration: "none", width: "fit-content" }}>
      <ArrowLeft size={14} /> Volver a la caja
    </Link>
  );

  return (
    <main className="pos-restock">
      <div className="pos-restock-body">
        {error ? (
          <>
            {back}
            <p className="page-kicker">{error}</p>
          </>
        ) : !session ? (
          <p className="page-kicker">Cargando…</p>
        ) : !allowed ? (
          <>
            {back}
            <div className="panel p-5" style={{ maxWidth: 460, margin: "40px auto", textAlign: "center" }}>
              <ShieldAlert size={28} style={{ color: "var(--glam-blue)" }} />
              <h2>Sin pedido desde la caja</h2>
              <p className="page-kicker">
                Esta sucursal no hace su pedido a fábrica desde la caja. Pide a un administrador que lo active en los
                datos de la sucursal.
              </p>
            </div>
          </>
        ) : (
          <PosLinksProvider links={CASHIER_POS_LINKS}>{children}</PosLinksProvider>
        )}
      </div>
    </main>
  );
}
