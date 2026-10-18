"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Tab, Tabs } from "@mui/material";
import { ShieldAlert } from "lucide-react";
import { usePermissions } from "@/lib/permissions";
import { CountsListTab } from "./CountsListTab";
import { CountsStatsTab } from "./CountsStatsTab";
import { COUNTS_HREF } from "./count-labels";
import "./counts.css";

type View = "conteos" | "indicadores";

/** Mensaje de "Sin acceso" con el mismo patrón que el resto del punto de venta. */
export function CountsNoAccess() {
  return (
    <div className="page-stack">
      <div className="panel p-5 flex items-center gap-3">
        <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
        <div>
          <h2 style={{ margin: 0 }}>Sin acceso</h2>
          <p className="page-kicker" style={{ margin: 0 }}>
            Los conteos de inventario necesitan el permiso de Conteos del punto de venta.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Punto de venta → Conteos: los inventarios cíclicos que el supervisor hace en
 * sus visitas. **Conteos** lista cada uno (clic abre el detalle con los ajustes
 * y la reversa); **Indicadores** compara exactitud y merma por sucursal (pide
 * `posCounts:update`, igual que el Back). La pestaña va en `?vista=` y la
 * sucursal elegida desde Indicadores en `?sucursal=`.
 */
export function CountsPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canView = can("posCounts", "view");
  const canSeeStats = can("posCounts", "update");
  const view: View = canSeeStats && searchParams.get("vista") === "indicadores" ? "indicadores" : "conteos";
  const branchId = searchParams.get("sucursal") ?? "";

  function go(next: View, branch?: string) {
    const query = new URLSearchParams();
    if (next === "indicadores") query.set("vista", next);
    if (next === "conteos" && branch) query.set("sucursal", branch);
    const qs = query.toString();
    router.replace(`${COUNTS_HREF}${qs ? `?${qs}` : ""}`);
  }

  if (!canView) return <CountsNoAccess />;

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Conteos de inventario</h1>
          <p className="page-kicker">
            Cada visita del supervisor cuenta a ciegas una lista sorpresa de renglones de la sucursal y, al cerrar, la
            diferencia se ajusta por kardex. Aquí revisas cada ajuste y, si fue un error de conteo, lo reviertes con
            motivo.
          </p>
        </div>
      </div>

      {canSeeStats ? (
        <Tabs value={view} onChange={(_event, value) => go(value as View)}>
          <Tab value="conteos" label="Conteos" />
          <Tab value="indicadores" label="Indicadores" />
        </Tabs>
      ) : null}

      {view === "conteos" ? (
        <CountsListTab initialBranchId={branchId} />
      ) : (
        <CountsStatsTab onOpenBranch={(id) => go("conteos", id)} />
      )}
    </div>
  );
}
