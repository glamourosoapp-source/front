"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, Search, Sparkles } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { NotificationsMenu } from "@/components/notifications/NotificationsMenu";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";
import "./shell.css";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { can } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token && !isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

  return (
    <div className="shell">
      <Sidebar />
      <main className="content">
        <header className="topbar">
          <label className="topbar-search">
            <Search size={17} />
            <input placeholder="Buscar pedidos, clientes o productos..." />
          </label>
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
    </div>
  );
}
