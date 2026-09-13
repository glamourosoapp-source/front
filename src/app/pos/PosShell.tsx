"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import { startCapturingInstallPrompt } from "@/lib/pwa-install";
import "./pos.css";

/**
 * Envoltorio de las pantallas de caja: sesión, permiso de POS, service worker y
 * captura del evento de instalación.
 *
 * Es un componente cliente aparte del `layout.tsx` (que sí es de servidor) solo
 * para que el layout pueda exportar `metadata`: el título del documento es el
 * que Windows muestra en la barra de tareas y en alt-tab cuando la caja corre
 * instalada, y decía "Glamouroso CRM".
 */
export default function PosShell({ children }: { children: ReactNode }) {
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

  // El service worker solo se registra en las pantallas instalables del POS.
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Solo en producción: en desarrollo el caché del shell sirve código viejo
    // tras cada edición y manda a perseguir fantasmas.
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin SW la caja funciona igual, solo arranca más lento */
    });
  }, []);

  /**
   * Captura de `beforeinstallprompt` en el layout, no en la pantalla: Chrome lo
   * dispara una sola vez y temprano, y desde aquí lo ven tanto la caja como
   * `/pos/configuracion` (que se navegan sin recargar).
   */
  useEffect(() => {
    startCapturingInstallPrompt();
  }, []);

  if (!checked || !user) {
    return <main className="pos" style={{ display: "grid", placeItems: "center" }}>Cargando caja...</main>;
  }

  if (!can("pos", "view")) {
    return (
      <main className="pos" style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <div className="panel p-5" style={{ maxWidth: 460, textAlign: "center" }}>
          <ShieldAlert size={28} style={{ color: "var(--glam-blue)" }} />
          <h2>Sin acceso a la caja</h2>
          <p className="page-kicker">
            Tu usuario no tiene el permiso de POS. Pide a un administrador que te asigne el perfil
            Cajero y una sucursal.
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
