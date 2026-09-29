"use client";

import Link from "next/link";
import { Handshake } from "lucide-react";

/**
 * Lo que se ve en las pantallas de franquicias (panel y portal) mientras el
 * módulo está apagado (`NEXT_PUBLIC_FRANCHISE_MODULE_ENABLED`).
 */
export function FranchiseDisabledNotice() {
  return (
    <div className="panel p-5" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
      <Handshake size={28} style={{ color: "var(--glam-blue)" }} />
      <h2>El módulo de franquicias está desactivado</h2>
      <p className="page-kicker">Por ahora las franquicias no levantan pedidos desde el sistema.</p>
      <Link href="/dashboard" className="button secondary">
        Ir al panel
      </Link>
    </div>
  );
}
