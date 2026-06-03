"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Headphones,
  LogOut,
  Bell,
  Megaphone,
  MessageCircle,
  PackageCheck,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";

const items = [
  {
    label: "Operacion",
    links: [
      { href: "/dashboard", label: "Overview", icon: BarChart3 },
      { href: "/dashboard/orders", label: "Pedidos", icon: PackageCheck },
      { href: "/dashboard/customers", label: "Clientes", icon: Users },
      { href: "/dashboard/products", label: "Catalogo", icon: Boxes },
    ],
  },
  {
    label: "WhatsApp IA",
    links: [
      { href: "/dashboard/conversations", label: "Conversaciones", icon: MessageCircle },
      { href: "/dashboard/agent", label: "Metricas IA", icon: BarChart3 },
      { href: "/dashboard/faqs", label: "FAQs IA", icon: Bot },
      { href: "/dashboard/prospects", label: "Prospectos IA", icon: Sparkles },
      { href: "/dashboard/outreach", label: "Outreach", icon: Megaphone },
    ],
  },
  {
    label: "Sistema",
    links: [
      { href: "/dashboard/notifications", label: "Notificaciones", icon: Bell },
      { href: "/dashboard/settings", label: "Configuracion", icon: Settings },
      { href: "#", label: "Soporte", icon: Headphones },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Sync state with localStorage to persist preferences
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") {
      setIsCollapsed(true);
    }
  }, []);

  const handleToggle = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem("sidebar-collapsed", String(nextState));
  };

  return (
    <aside className={isCollapsed ? "sidebar collapsed" : "sidebar"}>
      <button 
        className="collapse-toggle" 
        onClick={handleToggle} 
        aria-label={isCollapsed ? "Expandir menú" : "Colapsar menú"}
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
      
      <Link className="brand" href="/dashboard" title="Glamouroso CRM">
        <img
          className="brand-logo brand-logo-full"
          src="/branding/glamouroso-logo-azul-sobre-blanco.svg"
          alt="Glamouroso"
        />
        <img
          className="brand-logo brand-logo-mark"
          src="/branding/glamouroso-logo-g-azul.svg"
          alt="Glamouroso"
        />
        <span className="brand-kicker">CRM WhatsApp</span>
      </Link>
      
      <nav className="nav-list">
        {items.map((section) => (
          <div key={section.label}>
            <div className="nav-section">{section.label}</div>
            <div className="nav-list">
              {section.links.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link 
                    className={active ? "nav-item active" : "nav-item"} 
                    href={item.href} 
                    key={item.href}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon size={18} style={{ minWidth: "18px" }} />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      
      <button
        className="logout"
        onClick={() => {
          logout();
          router.push("/login");
        }}
        title="Cerrar sesión"
      >
        <LogOut size={16} style={{ minWidth: "16px" }} />
        <span className="nav-label">Cerrar sesion</span>
      </button>
    </aside>
  );
}
