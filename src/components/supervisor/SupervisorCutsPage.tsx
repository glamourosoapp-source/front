"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { useSupervisorScope } from "@/lib/supervisor-scope";
import { FilterBar } from "@/components/pos-admin/FilterBar";
import { PeriodPicker, periodBounds } from "@/components/pos-admin/PeriodPicker";
import { BranchPicker } from "@/components/pos-admin/BranchPicker";
import { BranchCutRows, type BranchCutPeriod } from "@/components/pos-admin/BranchCutRows";
import type { Branch, ListResponse } from "@/types";

type Granularity = "day" | "week" | "month" | "range";

/** Hoy en la zona del negocio, que es la que usan los cortes. */
function todayInMexico(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

/**
 * Pestaña Cortes del supervisor de caja: la misma vista "Por sucursal" del
 * panel (hoy, ayer y semana de cada tienda, con su forma de pago), solo con
 * las sucursales donde su matriz (ficha del usuario) le da Cortes. El Back le
 * niega cualquier otra.
 */
export function SupervisorCutsPage() {
  const { ids } = useSupervisorScope();
  const allowedIds = useMemo(() => ids("cuts") ?? [], [ids]);
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  /** Sucursales elegidas entre las suyas; vacío = todas las suyas. */
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [anchor, setAnchor] = useState(todayInMexico());
  const [rangeTo, setRangeTo] = useState(todayInMexico());

  useEffect(() => {
    httpClient
      .get<ListResponse<Branch>>("/pos/branches", { limit: 200 })
      .then((res) => setAllBranches(res.items))
      .catch((error) => toast.error(getApiErrorMessage(error, "No se pudieron cargar las sucursales")));
  }, []);

  const branches = useMemo(
    () => allBranches.filter((branch) => allowedIds.includes(branch.id)),
    [allBranches, allowedIds],
  );

  const period = useMemo<BranchCutPeriod>(
    () =>
      granularity === "day"
        ? { mode: "day", day: anchor }
        : { mode: "range", ...periodBounds({ granularity, anchor, rangeTo }) },
    [granularity, anchor, rangeTo],
  );

  if (!allowedIds.length) {
    return (
      <div className="sup-page">
        <div className="sup-empty">No tienes sucursales asignadas para ver cortes.</div>
      </div>
    );
  }

  return (
    <div className="sup-page">
      <div className="sup-page-head">
        <div>
          <h1>Cortes</h1>
          <p>Lo que vendió cada sucursal y cómo se cobró. La semana va de viernes a jueves.</p>
        </div>
      </div>

      <FilterBar>
        {branches.length > 1 ? <BranchPicker branches={branches} value={branchIds} onChange={setBranchIds} /> : null}
        <PeriodPicker
          value={{ granularity, anchor, rangeTo }}
          onChange={(next) => {
            setGranularity(next.granularity);
            setAnchor(next.anchor);
            setRangeTo(next.rangeTo);
          }}
        />
      </FilterBar>

      {branches.length ? (
        <BranchCutRows
          branches={branches}
          branchIds={branchIds.length ? branchIds : branches.map((branch) => branch.id)}
          period={period}
          ticketsLink={false}
        />
      ) : (
        <p className="page-kicker">Cargando sucursales…</p>
      )}
    </div>
  );
}
