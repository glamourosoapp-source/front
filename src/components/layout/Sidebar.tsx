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
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PermissionModule } from "@glamouroso/shared";
import { useAuthStore } from "@/stores/auth.store";
import { usePermissions } from "@/lib/permissions";

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  module?: PermissionModule;
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
      { href: "/dashboard", label: "Overview", icon: BarChart3, module: "dashboard" },
      { href: "/dashboard/orders", label: "Pedidos", icon: PackageCheck, module: "orders" },
      { href: "/dashboard/customers", label: "Clientes", icon: Users, module: "customers" },
      { href: "/dashboard/products", label: "Catalogo", icon: Boxes, module: "products" },
    ],
  },
  {
    id: "whatsapp-ia",
    label: "WhatsApp IA",
    links: [
      { href: "/dashboard/conversations", label: "Conversaciones", icon: MessageCircle, module: "conversations" },
      { href: "/dashboard/prospects", label: "Prospectos IA", icon: Sparkles, module: "prospects" },
      { href: "/dashboard/outreach", label: "Outreach", icon: Megaphone, module: "outreach" },
    ],
    groups: [
      {
        id: "agente-ia",
        label: "Agente IA",
        icon: Bot,
        links: [
          { href: "/dashboard/agent", label: "Metricas IA", icon: BarChart3, module: "agent" },
          { href: "/dashboard/faqs", label: "FAQs IA", icon: Bot, module: "faqs" },
        ],
      },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    links: [
      { href: "/dashboard/notifications", label: "Notificaciones", icon: Bell, module: "notifications" },
      { href: "/dashboard/users", label: "Usuarios", icon: UserCog, module: "users" },
      { href: "/dashboard/settings", label: "Configuracion", icon: Settings, module: "settings" },
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

const DEFAULT_COLLAPSED_SECTIONS = new Set(["sistema"]);

function getDefaultOpenSections(pathname: string) {
  const open: Record<string, boolean> = {};
  for (const section of sections) {
    open[section.id] = DEFAULT_COLLAPSED_SECTIONS.has(section.id)
      ? sectionHasActive(pathname, section)
      : true;
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

type CanFn = (module: PermissionModule) => boolean;

/** Un link es visible si no está atado a un módulo (ej. Soporte) o el usuario puede verlo. */
function isLinkVisible(link: NavLink, can: CanFn): boolean {
  return !link.module || can(link.module);
}

function filterSectionsByPermissions(can: CanFn): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      links: section.links?.filter((link) => isLinkVisible(link, can)),
      groups: section.groups
        ?.map((group) => ({ ...group, links: group.links.filter((link) => isLinkVisible(link, can)) }))
        .filter((group) => group.links.length > 0),
    }))
    .filter((section) => (section.links?.length ?? 0) > 0 || (section.groups?.length ?? 0) > 0);
}

const CONVERSATIONS_PATH = "/dashboard/conversations";

function isConversationsRoute(pathname: string) {
  return pathname === CONVERSATIONS_PATH || pathname.startsWith(`${CONVERSATIONS_PATH}/`);
}

function readCollapsedPreference() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("sidebar-collapsed") === "true";
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const { can } = usePermissions();
  const visibleSections = filterSectionsByPermissions(can);
  const allNavLinks = getAllNavLinks(visibleSections);
  // Inbox a 3 columnas: colapsar al entrar da mas ancho util.
  const [isCollapsed, setIsCollapsed] = useState(() => isConversationsRoute(pathname));
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    getDefaultOpenSections(pathname),
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    getDefaultOpenGroups(pathname),
  );

  useEffect(() => {
    if (isConversationsRoute(pathname)) {
      setIsCollapsed(true);
      return;
    }
    setIsCollapsed(readCollapsedPreference());
  }, [pathname]);

  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const section of sections) {
        if (DEFAULT_COLLAPSED_SECTIONS.has(section.id) && sectionHasActive(pathname, section)) {
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
    // En conversaciones el colapso es automatico al entrar; solo persistimos
    // la preferencia del usuario fuera de esa pantalla (o si la fuerza aqui).
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
            const collapsible = DEFAULT_COLLAPSED_SECTIONS.has(section.id);
            const isOpen = collapsible ? (openSections[section.id] ?? false) : true;

            return (
              <div className="nav-block" key={section.id}>
                {collapsible ? (
                  <button
                    type="button"
                    className="nav-section-toggle"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="nav-section">{section.label}</span>
                    <ChevronDown
                      size={12}
                      className={isOpen ? "nav-section-chevron open" : "nav-section-chevron"}
                    />
                  </button>
                ) : (
                  <span className="nav-section">{section.label}</span>
                )}

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
