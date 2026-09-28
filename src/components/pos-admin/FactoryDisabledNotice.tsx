"use client";

import Link from "next/link";
import { Factory } from "lucide-react";

/**
 * Lo que se ve en las pantallas de fábrica mientras el módulo está apagado
 * (`NEXT_PUBLIC_FACTORY_MODULE_ENABLED`). El surtido entra a las sucursales
 * con la entrada de surtido, desde el detalle de cada sucursal.
 */
export function FactoryDisabledNotice() {
  return (
    <div className="panel p-5" style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
      <Factory size={28} style={{ color: "var(--glam-blue)" }} />
      <h2>El módulo de fábrica está desactivado</h2>
      <p className="page-kicker">
        Por ahora el producto que sale de fábrica se registra en cada sucursal: entra a Sucursales,
        abre la sucursal y en la pestaña Pedidos a fábrica usa &quot;Registrar entrada de surtido&quot;.
      </p>
      <Link href="/dashboard/pos/sucursales" className="button secondary">
        Ir a Sucursales
      </Link>
    </div>
  );
}
