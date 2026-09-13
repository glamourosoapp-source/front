"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import "./fabrica.css";

/**
 * App de fábrica: pantalla propia para la tablet del almacén, fuera de
 * `/dashboard`. Tipografía y filas grandes, porque se opera con el dedo y con
 * las manos ocupadas.
 */
export default function FactoryLayout({ children }: { children: ReactNode }) {
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

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Solo en producción; en dev el caché del shell sirve código viejo.
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => null);
  }, []);

  if (!checked || !user) {
    return <main className="factory-center">Cargando pedidos...</main>;
  }

  if (!can("factory", "view")) {
    return (
      <main className="factory-center">
        <div className="panel p-5" style={{ maxWidth: 460, textAlign: "center" }}>
          <ShieldAlert size={28} style={{ color: "var(--glam-blue)" }} />
          <h2>Sin acceso a fábrica</h2>
          <p className="page-kicker">
            Tu usuario no tiene el permiso de fábrica. Pide a un administrador que te asigne el
            perfil Fábrica.
          </p>
          <button className="button secondary" onClick={() => router.push("/dashboard")}>
            Ir al panel
          </button>
        </div>
      </main>
    );
  }

  return <RealtimeProvider>{children}</RealtimeProvider>;
}
