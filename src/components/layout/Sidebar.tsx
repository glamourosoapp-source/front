"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  Boxes,
  ChevronDown,
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
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { ADMIN_ROLES } from "@glamouroso/shared/constants";

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  links: NavLink[];
};

type NavSection = {
  id: string;
  label: string;
  links?: NavLink[];
  groups?: NavGroup[];
};

const sections: NavSection[] = [
  {
    id: "operacion",
    label: "Operacion",
    links: [
      { href: "/dashboard", label: "Overview", icon: BarChart3 },
      { href: "/dashboard/orders", label: "Pedidos", icon: PackageCheck },
      { href: "/dashboard/customers", label: "Clientes", icon: Users },
      { href: "/dashboard/products", label: "Catalogo", icon: Boxes },
    ],
  },
  {
    id: "whatsapp-ia",
    label: "WhatsApp IA",
    links: [
      { href: "/dashboard/conversations", label: "Conversaciones", icon: MessageCircle },
      { href: "/dashboard/prospects", label: "Prospectos IA", icon: Sparkles },
      { href: "/dashboard/outreach", label: "Outreach", icon: Megaphone },
    ],
    groups: [
      {
        id: "agente-ia",
        label: "Agente IA",
        icon: Bot,
        links: [
          { href: "/dashboard/agent", label: "Metricas IA", icon: BarChart3 },
          { href: "/dashboard/faqs", label: "FAQs IA", icon: Bot },
        ],
      },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    links: [
      { href: "/dashboard/notifications", label: "Notificaciones", icon: Bell },
      { href: "/dashboard/settings", label: "Configuracion", icon: Settings, adminOnly: true },
      { href: "#", label: "Soporte", icon: Headphones },
    ],
  },
];

function isLinkActive(pathname: string, href: string) {
  if (href === "#") return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function sectionHasActive(pathname: string, section: NavSection) {
  const links = [
    ...(section.links ?? []),
    ...(section.groups?.flatMap((group) => group.links) ?? []),
  ];
  return links.some((link) => isLinkActive(pathname, link.href));
}

function groupHasActive(pathname: string, group: NavGroup) {
  return group.links.some((link) => isLinkActive(pathname, link.href));
}

function getDefaultOpenSections(pathname: string) {
  const open: Record<string, boolean> = {};
  for (const section of sections) {
    open[section.id] = sectionHasActive(pathname, section);
  }
  return open;
}

function getDefaultOpenGroups(pathname: string) {
  const open: Record<string, boolean> = {};
  for (const section of sections) {
    for (const group of section.groups ?? []) {
      open[group.id] = groupHasActive(pathname, group);
    }
  }
  return open;
}

function getAllNavLinks(sectionList: NavSection[]) {
  const links: NavLink[] = [];
  for (const section of sectionList) {
    links.push(...(section.links ?? []));
    for (const group of section.groups ?? []) {
      links.push(...group.links);
    }
  }
  return links;
}

function filterSectionsByRole(role: string | undefined): NavSection[] {
  const isAdmin = !!role && ADMIN_ROLES.includes(role);
  if (isAdmin) return sections;
  return sections
    .map((section) => ({
      ...section,
      links: section.links?.filter((link) => !link.adminOnly),
    }))
    .filter((section) => (section.links?.length ?? 0) > 0 || (section.groups?.length ?? 0) > 0);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const visibleSections = filterSectionsByRole(user?.role);
  const allNavLinks = getAllNavLinks(visibleSections);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    getDefaultOpenSections(pathname),
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    getDefaultOpenGroups(pathname),
  );

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") {
      setIsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const section of sections) {
        if (sectionHasActive(pathname, section)) {
          next[section.id] = true;
        }
      }
      return next;
    });
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const section of sections) {
        for (const group of section.groups ?? []) {
          if (groupHasActive(pathname, group)) {
            next[group.id] = true;
          }
        }
      }
      return next;
    });
  }, [pathname]);

  const handleToggle = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem("sidebar-collapsed", String(nextState));
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderNavLink = (item: NavLink, nested = false) => {
    const Icon = item.icon;
    const active = isLinkActive(pathname, item.href);

    return (
      <Link
        className={active ? "nav-item active" : "nav-item"}
        data-nested={nested ? "true" : undefined}
        href={item.href}
        key={item.href}
        title={isCollapsed ? item.label : undefined}
      >
        <Icon size={18} style={{ minWidth: "18px" }} />
        <span className="nav-label">{item.label}</span>
      </Link>
    );
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

      <nav className="nav-scroll" aria-label="Navegación principal">
        {isCollapsed ? (
          <div className="nav-list">
            {allNavLinks.map((item) => renderNavLink(item))}
          </div>
        ) : (
          visibleSections.map((section) => {
            const isOpen = openSections[section.id] ?? false;
            const sectionActive = sectionHasActive(pathname, section);

            return (
              <div className="nav-block" key={section.id}>
                <button
                  type="button"
                  className={sectionActive ? "nav-section-toggle active" : "nav-section-toggle"}
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isOpen}
                >
                  <span className="nav-section-label">{section.label}</span>
                  <ChevronDown
                    size={14}
                    className={isOpen ? "nav-section-chevron open" : "nav-section-chevron"}
                  />
                </button>

                {isOpen ? (
                  <div className="nav-list">
                    {section.links?.map((item) => renderNavLink(item))}
                    {section.groups?.map((group) => {
                      const GroupIcon = group.icon;
                      const groupOpen = openGroups[group.id] ?? false;
                      const groupActive = groupHasActive(pathname, group);

                      return (
                        <div className="nav-group" key={group.id}>
                          <button
                            type="button"
                            className={groupActive ? "nav-group-toggle active" : "nav-group-toggle"}
                            onClick={() => toggleGroup(group.id)}
                            aria-expanded={groupOpen}
                          >
                            <GroupIcon size={18} style={{ minWidth: "18px" }} />
                            <span className="nav-label">{group.label}</span>
                            <ChevronDown
                              size={14}
                              className={groupOpen ? "nav-group-chevron open" : "nav-group-chevron"}
                            />
                          </button>
                          {groupOpen ? (
                            <div className="nav-sublist">
                              {group.links.map((item) => renderNavLink(item, true))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </nav>

      <div className="sidebar-footer">
        <figure className="sidebar-family" aria-hidden="true">
          <img
            src="/branding/familia-glamouroso.svg"
            alt=""
            width={232}
            height={178}
          />
        </figure>

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
      </div>
    </aside>
  );
}
