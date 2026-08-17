"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CirclePlus, Menu, Sparkles } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { NotificationsMenu } from "@/components/notifications/NotificationsMenu";
import { ForcePasswordChangeDialog } from "@/components/auth/ForcePasswordChangeDialog";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import "./shell.css";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const mustChangePassword = useAuthStore((s) => s.user?.mustChangePassword ?? false);
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  // Drawer móvil (<=900px): el sidebar vive fuera de pantalla hasta abrirlo.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token && !isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("nav-open", mobileNavOpen);
    return () => document.body.classList.remove("nav-open");
  }, [mobileNavOpen]);

  return (
    <RealtimeProvider>
    <div className="shell">
      <Sidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
      {mobileNavOpen ? (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      ) : null}
      <main className="content">
        <header className="topbar">
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={mobileNavOpen}
          >
            <Menu size={20} />
          </button>
          <GlobalSearch />
          <div className="topbar-actions">
            {can("orders", "create") ? (
              <Link className="create-action" href="/dashboard/orders/new" aria-label="Nuevo pedido">
                <CirclePlus size={21} />
              </Link>
            ) : null}
            <NotificationsMenu />
            <span className="health-chip">
              <Sparkles size={15} />
              IA lista
            </span>
            <div className="user-chip">
              <img
                className="user-avatar-logo"
                src="/branding/glamouroso-logo-g-azul.svg"
                alt=""
                aria-hidden="true"
              />
              <div>
                <strong>Glamouroso</strong>
                <span>Super admin</span>
              </div>
            </div>
          </div>
        </header>
        {children}
      </main>
      <ForcePasswordChangeDialog open={mustChangePassword} />
    </div>
    </RealtimeProvider>
  );
}
