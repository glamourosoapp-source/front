"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Box, Button, Chip, Tab, Tabs } from "@mui/material";
import { ArrowLeft, Pencil, ReceiptText, ShieldAlert, Store, Trash2 } from "lucide-react";
import { BRANCH_TYPES, type BranchType } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import type { BranchOverview } from "@/types";
import { toast } from "sonner";
import { BranchFormDialog } from "./BranchFormDialog";
import { BranchHealthChip } from "./BranchHealthChip";
import { BRANCH_TYPE_COPY } from "./pos-labels";
import { BranchOverviewTab } from "./tabs/BranchOverviewTab";
import { BranchSalesTab } from "./tabs/BranchSalesTab";
import { BranchRestockTab } from "./tabs/BranchRestockTab";
import { BranchCutsTab } from "./tabs/BranchCutsTab";
import { BranchInventoryTab } from "./tabs/BranchInventoryTab";
import { BranchUsersTab } from "./tabs/BranchUsersTab";
import { BranchCustomersTab } from "./tabs/BranchCustomersTab";

type TabKey = "resumen" | "ventas" | "pedidos" | "cortes" | "inventario" | "usuarios" | "clientes";

/**
 * Detalle de una sucursal o franquicia: resumen, ventas, pedidos a fábrica,
 * cortes, inventario con stock mínimo, usuarios y clientes registrados. La
 * pestaña va en la URL (`?tab=`) para poder enlazarla desde otros módulos.
 */
export function BranchDetailPage({ type }: { type: BranchType }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const { subscribe } = useRealtime();
  const copy = BRANCH_TYPE_COPY[type];
  const isFranchise = type === BRANCH_TYPES.FRANCHISE;
  const canView = can("posBranches", "view");
  const canUpdate = can("posBranches", "update");
  const canDelete = can("posBranches", "delete");

  const [data, setData] = useState<BranchOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const tabs: Array<{ key: TabKey; label: string }> = isFranchise
    ? [
        { key: "resumen", label: "Resumen" },
        { key: "pedidos", label: "Pedidos a fábrica" },
        { key: "usuarios", label: "Usuarios" },
      ]
    : [
        { key: "resumen", label: "Resumen" },
        { key: "ventas", label: "Ventas" },
        { key: "pedidos", label: "Pedidos a fábrica" },
        { key: "cortes", label: "Cortes" },
        { key: "inventario", label: "Inventario y mínimos" },
        { key: "usuarios", label: "Usuarios" },
        { key: "clientes", label: "Clientes" },
      ];
  const requested = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = requested && tabs.some((t) => t.key === requested) ? requested : "resumen";

  const load = useCallback(async () => {
    try {
      setData(await httpClient.get<BranchOverview>(`/pos/branches/${params.id}/overview`));
    } catch (error) {
      toast.error(getApiErrorMessage(error, `No se pudo cargar la ${copy.singular}`));
      router.push(copy.listHref);
    } finally {
      setLoading(false);
    }
  }, [params.id, router, copy.singular, copy.listHref]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  useEffect(() => {
    return subscribe((event) => {
      if (
        (event.type === "pos_sales_changed" || event.type === "restock_orders_changed") &&
        event.branchId === params.id
      ) {
        void load();
      }
    });
  }, [subscribe, params.id, load]);

  function selectTab(next: TabKey) {
    const query = new URLSearchParams(searchParams.toString());
    if (next === "resumen") query.delete("tab");
    else query.set("tab", next);
    const qs = query.toString();
    router.replace(`${copy.listHref}/${params.id}${qs ? `?${qs}` : ""}`);
  }

  async function remove() {
    if (!data) return;
    const ok = window.confirm(
      `¿Eliminar ${data.branch.name}? Solo se puede si no tiene ventas ni usuarios; si ya operó, desactívala.`
    );
    if (!ok) return;
    try {
      await httpClient.delete(`/pos/branches/${data.branch.id}`);
      toast.success(`${copy.Singular} eliminada`);
      router.push(copy.listHref);
    } catch (error) {
      toast.error(getApiErrorMessage(error, `No se pudo eliminar la ${copy.singular}`));
    }
  }

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Sin acceso</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              El detalle de {copy.plural} necesita el permiso de Sucursales del punto de venta.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="page-stack">
        <p className="page-kicker">Cargando {copy.singular}...</p>
      </div>
    );
  }

  const { branch, stats } = data;
  // Si la fila cambió de tipo (franquicia que adoptó el POS), mandarla a su módulo.
  if (branch.type !== type) {
    const target = branch.type === BRANCH_TYPES.FRANCHISE ? BRANCH_TYPE_COPY.franchise : BRANCH_TYPE_COPY.branch;
    router.replace(`${target.listHref}/${branch.id}`);
    return null;
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <Link
            href={copy.listHref}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--glam-navy)]"
          >
            <ArrowLeft size={16} />
            Volver a {copy.plural}
          </Link>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Store size={22} style={{ color: "var(--glam-blue)" }} />
            {branch.code} · {branch.name}
            <BranchHealthChip health={stats.health} size="large" />
            {!branch.isActive ? <Chip label="Inactiva" size="small" /> : null}
          </h1>
          <p className="page-kicker">
            {[branch.street, branch.colony, branch.city].filter(Boolean).join(", ") || "Sin domicilio capturado"}
            {branch.phone ? ` · ${branch.phone}` : ""}
          </p>
        </div>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          {canUpdate ? (
            <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={() => setEditOpen(true)}>
              Editar datos
            </Button>
          ) : null}
          {/* Una franquicia no tiene caja: su ticket no se imprime en ningún lado. */}
          {canUpdate && !isFranchise ? (
            <Button
              variant="outlined"
              startIcon={<ReceiptText size={16} />}
              component={Link}
              href={`/dashboard/pos/ticket?branch=${branch.id}`}
            >
              Ticket impreso
            </Button>
          ) : null}
          {canDelete ? (
            <Button color="error" startIcon={<Trash2 size={16} />} onClick={() => void remove()}>
              Eliminar
            </Button>
          ) : null}
        </Box>
      </div>

      <Tabs value={tab} onChange={(_e, value) => selectTab(value as TabKey)} variant="scrollable" allowScrollButtonsMobile>
        {tabs.map((item) => (
          <Tab key={item.key} value={item.key} label={item.label} />
        ))}
      </Tabs>

      {tab === "resumen" ? <BranchOverviewTab branch={branch} stats={stats} /> : null}
      {tab === "ventas" ? <BranchSalesTab branchId={branch.id} /> : null}
      {tab === "pedidos" ? <BranchRestockTab branch={branch} /> : null}
      {tab === "cortes" ? <BranchCutsTab branchId={branch.id} /> : null}
      {tab === "inventario" ? <BranchInventoryTab branchId={branch.id} /> : null}
      {tab === "usuarios" ? <BranchUsersTab branch={branch} /> : null}
      {tab === "clientes" ? <BranchCustomersTab branchId={branch.id} /> : null}

      <BranchFormDialog
        open={editOpen}
        branch={branch}
        defaultType={type}
        onClose={() => setEditOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
