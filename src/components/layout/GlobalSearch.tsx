"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMxPhone } from "@/utils/format-phone";
import type { ListResponse } from "@/types";

interface OrderHit {
  id: string;
  orderNumber: string;
  total?: number | string | null;
  customer?: { name?: string | null } | null;
}

interface CustomerHit {
  id: string;
  name: string;
  phone?: string | null;
  zone?: string | null;
}

interface ProductHit {
  id: string;
  name: string;
  sku?: string | null;
}

interface SearchHit {
  key: string;
  label: string;
  detail: string;
  href: string;
}

interface SearchSection {
  module: "orders" | "customers" | "products";
  title: string;
  hits: SearchHit[];
  allHref: string;
}

const MIN_CHARS = 2;
const LIMIT = 5;

/**
 * Buscador global del header: busca en pedidos, clientes y productos con los
 * endpoints de lista existentes (?search=) y muestra un dropdown agrupado.
 */
export function GlobalSearch() {
  const router = useRouter();
  const { can } = usePermissions();
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 300);
  const [sections, setSections] = useState<SearchSection[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const seqRef = useRef(0);

  const canOrders = can("orders");
  const canCustomers = can("customers");
  const canProducts = can("products");

  useEffect(() => {
    const query = debounced.trim();
    if (query.length < MIN_CHARS) {
      setSections([]);
      setLoading(false);
      return;
    }

    const seq = ++seqRef.current;
    setLoading(true);
    const encoded = encodeURIComponent(query);

    const lookups: Array<Promise<SearchSection | null>> = [];
    if (canOrders) {
      lookups.push(
        httpClient
          .get<ListResponse<OrderHit>>("/orders", { search: query, limit: LIMIT })
          .then((res) => ({
            module: "orders" as const,
            title: "Pedidos",
            allHref: `/dashboard/orders?search=${encoded}`,
            hits: res.items.map((order) => ({
              key: `order-${order.id}`,
              label: order.orderNumber,
              detail: [order.customer?.name, order.total != null ? `$${Number(order.total).toLocaleString("es-MX")}` : null]
                .filter(Boolean)
                .join(" · "),
              href: `/dashboard/orders/${order.id}`,
            })),
          }))
          .catch(() => null)
      );
    }
    if (canCustomers) {
      lookups.push(
        httpClient
          .get<ListResponse<CustomerHit>>("/customers", { search: query, limit: LIMIT })
          .then((res) => ({
            module: "customers" as const,
            title: "Clientes",
            allHref: `/dashboard/customers?search=${encoded}`,
            hits: res.items.map((customer) => ({
              key: `customer-${customer.id}`,
              label: customer.name,
              detail: [formatMxPhone(customer.phone) || null, customer.zone].filter(Boolean).join(" · "),
              href: `/dashboard/customers/${customer.id}`,
            })),
          }))
          .catch(() => null)
      );
    }
    if (canProducts) {
      lookups.push(
        httpClient
          .get<ListResponse<ProductHit>>("/products", { search: query, limit: LIMIT })
          .then((res) => ({
            module: "products" as const,
            title: "Productos",
            allHref: `/dashboard/products?search=${encoded}`,
            hits: res.items.map((product) => ({
              key: `product-${product.id}`,
              label: product.name,
              detail: product.sku || "",
              // Productos no tiene página de detalle: aterriza en la lista filtrada.
              href: `/dashboard/products?search=${encodeURIComponent(product.name)}`,
            })),
          }))
          .catch(() => null)
      );
    }

    Promise.all(lookups).then((results) => {
      if (seq !== seqRef.current) return;
      setSections(results.filter((s): s is SearchSection => Boolean(s)));
      setLoading(false);
      setOpen(true);
    });
  }, [debounced, canOrders, canCustomers, canProducts]);

  // Click fuera cierra el dropdown.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    setTerm("");
    router.push(href);
  }

  const firstHit = sections.flatMap((s) => s.hits)[0];
  const hasResults = sections.some((s) => s.hits.length > 0);
  const showPanel = open && term.trim().length >= MIN_CHARS;

  return (
    <div className="topbar-search-wrap" ref={rootRef}>
      <label className="topbar-search">
        <Search size={17} />
        <input
          placeholder="Buscar pedidos, clientes o productos..."
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            if (e.target.value.trim().length >= MIN_CHARS) setOpen(true);
          }}
          onFocus={() => term.trim().length >= MIN_CHARS && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && firstHit) go(firstHit.href);
          }}
          aria-label="Buscar pedidos, clientes o productos"
        />
      </label>

      {showPanel && (
        <div className="topbar-search-results" role="listbox">
          {loading && !hasResults ? (
            <p className="topbar-search-empty">Buscando…</p>
          ) : !hasResults ? (
            <p className="topbar-search-empty">Sin resultados para “{term.trim()}”.</p>
          ) : (
            sections
              .filter((section) => section.hits.length > 0)
              .map((section) => (
                <div key={section.module} className="topbar-search-section">
                  <div className="topbar-search-heading">
                    <span>{section.title}</span>
                    <button type="button" onClick={() => go(section.allHref)}>
                      Ver todos
                    </button>
                  </div>
                  {section.hits.map((hit) => (
                    <button
                      key={hit.key}
                      type="button"
                      className="topbar-search-hit"
                      onClick={() => go(hit.href)}
                    >
                      <strong>{hit.label}</strong>
                      {hit.detail && <span>{hit.detail}</span>}
                    </button>
                  ))}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
