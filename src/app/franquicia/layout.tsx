"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";

/**
 * Portal de franquicias: pantalla propia, fuera de `/dashboard`.
 *
 * Una franquicia solo levanta pedidos a fábrica con precio de mayoreo y ve su
 * propio historial. No tiene caja, ni inventario, ni acceso a otras sucursales.
 */
export default function FranchiseLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const hydrate = useAuthStore((s) => s.hydrate);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { can } = usePermissions();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void Promise.resolve(hydrate()).finally(() => setChecked(true));
  }, [hydrate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem("token") && !isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

  if (!checked || !user) {
    return <main style={{ display: "grid", placeItems: "center", height: "100vh" }}>Cargando...</main>;
  }

  if (!can("franchise", "view")) {
    return (
      <main style={{ display: "grid", placeItems: "center", height: "100vh", padding: 24 }}>
        <div className="panel p-5" style={{ maxWidth: 460, textAlign: "center" }}>
          <ShieldAlert size={28} style={{ color: "var(--glam-blue)" }} />
          <h2>Sin acceso al portal</h2>
          <p className="page-kicker">
            Tu usuario no tiene el permiso de franquicia. Pide a un administrador que te asigne el
            perfil Franquicia y tu sucursal.
          </p>
          <button className="button secondary" onClick={() => router.push("/dashboard")}>
            Ir al panel
          </button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
