"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, ShieldAlert, Store, Truck } from "lucide-react";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import { ForcePasswordChangeDialog } from "@/components/auth/ForcePasswordChangeDialog";
import { PosLinksProvider, SUPERVISOR_POS_LINKS } from "@/components/pos-admin/pos-links";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import "./supervisor.css";

const NAV = [
  { href: "/supervisor", label: "Sucursales", icon: Store },
  { href: "/supervisor/pedidos", label: "Pedidos", icon: Truck },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/supervisor" ? pathname === "/supervisor" : pathname.startsWith(href);
}

/**
 * Marco de la app del supervisor: barra de arriba con el logo y, para
 * moverse, dos secciones (Sucursales y Pedidos). En el celular la navegación
 * baja a una barra fija abajo, al alcance del pulgar; dentro de un pedido se
 * esconde para dejarle la pantalla a la hoja y a su barra de enviar.
 */
export default function SupervisorShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrate = useAuthStore((s) => s.hydrate);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { can } = usePermissions();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void Promise.resolve(hydrate()).finally(() => setChecked(true));
  }, [hydrate]);

  // Su propia sesión (lib/session.ts): sin ella, a su login, aunque el
  // navegador tenga abierta la caja con el cajero.
  useEffect(() => {
    if (checked && !isAuthenticated) router.replace("/login?app=supervisor");
  }, [checked, isAuthenticated, router]);

  if (!checked || !user) {
    return <main className="sup-center">Cargando…</main>;
  }

  if (!can("posSupervisor", "view")) {
    return (
      <main className="sup-center">
        <div className="panel p-5" style={{ maxWidth: 460, textAlign: "center" }}>
          <ShieldAlert size={28} style={{ color: "var(--glam-blue)" }} />
          <h2>Sin acceso</h2>
          <p className="page-kicker">
            Tu usuario no tiene la app de supervisor de caja. Pide a un administrador que te asigne el perfil
            Supervisor de caja.
          </p>
          <button className="button secondary" onClick={() => router.push("/dashboard")}>
            Ir al panel
          </button>
        </div>
      </main>
    );
  }

  // Dentro de un pedido (revisar o ver la hoja) la barra de abajo estorba.
  const inOrder = pathname.startsWith("/supervisor/pedidos/");

  return (
    <RealtimeProvider>
      <PosLinksProvider links={SUPERVISOR_POS_LINKS}>
        <div className={`sup${inOrder ? " is-detail" : ""}`}>
          <header className="sup-topbar">
            <Link href="/supervisor" className="sup-brand" aria-label="Inicio">
              <img src="/branding/glamouroso-logo-g-azul.svg" alt="" aria-hidden="true" />
              <span>
                <strong>Supervisor</strong>
                <small>{user.name}</small>
              </span>
            </Link>
            <nav className="sup-nav" aria-label="Secciones">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={isActive(pathname, href) ? "is-active" : undefined}>
                  <Icon size={18} />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
            <button
              type="button"
              className="sup-logout"
              onClick={() => {
                logout();
                router.push("/login?app=supervisor");
              }}
              aria-label="Salir"
              title="Salir"
            >
              <LogOut size={18} />
              <span>Salir</span>
            </button>
          </header>
          <main className="sup-body">{children}</main>
        </div>
        <ForcePasswordChangeDialog open={user.mustChangePassword ?? false} />
      </PosLinksProvider>
    </RealtimeProvider>
  );
}
