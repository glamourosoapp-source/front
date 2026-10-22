"use client";

import { useMemo, useState } from "react";
import { Checkbox, FormControlLabel, InputAdornment, Switch, TextField, Tooltip } from "@mui/material";
import { Search } from "lucide-react";
import { SUPERVISOR_CAPABILITIES, SUPERVISOR_CAPABILITY_LABELS, can } from "@glamouroso/shared";
import type { PermissionMap, SupervisorAccess, SupervisorCapability } from "@glamouroso/shared";
import type { Branch } from "@/types";

/** Permiso del perfil que hace falta para que cada casilla sirva de algo. */
const PROFILE_GATE: Record<SupervisorCapability, (permissions: PermissionMap | null | undefined) => boolean> = {
  status: (permissions) => can(permissions, "posSupervisor", "view"),
  counts: (permissions) => can(permissions, "posCounts", "view"),
  restock: (permissions) => can(permissions, "posRestock", "view"),
  // Cortes solo existe por la matriz: basta la app del supervisor.
  cuts: (permissions) => can(permissions, "posSupervisor", "view"),
};

/**
 * Matriz del supervisor de caja en la ficha del usuario: qué sucursales ve y
 * qué hace en cada una (Apertura, Conteos, Pedidos, Cortes). Apagada = sin
 * límite por sucursal, como los supervisores de antes (todas, sin Cortes).
 * El perfil sigue siendo el tope: la columna que el perfil no da se apaga.
 */
export function SupervisorAccessMatrix({
  value,
  onChange,
  branches,
  profilePermissions,
}: {
  value: SupervisorAccess | null;
  onChange: (next: SupervisorAccess | null) => void;
  /** Sucursales con caja (sin franquicias). */
  branches: Branch[];
  profilePermissions: PermissionMap | null | undefined;
}) {
  const [search, setSearch] = useState("");
  const limited = value !== null;
  const access = value ?? {};

  const enabled = useMemo(
    () =>
      Object.fromEntries(
        SUPERVISOR_CAPABILITIES.map((capability) => [capability, PROFILE_GATE[capability](profilePermissions)]),
      ) as Record<SupervisorCapability, boolean>,
    [profilePermissions],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return branches
      // Las inactivas solo si ya estaban en la matriz.
      .filter((branch) => branch.isActive !== false || access[branch.id]?.length)
      .filter(
        (branch) =>
          !term ||
          [branch.code, branch.name, branch.city ?? ""].some((text) => text.toLowerCase().includes(term)),
      );
  }, [branches, access, search]);

  const has = (branchId: string, capability: SupervisorCapability) =>
    Boolean(access[branchId]?.includes(capability));

  function toggle(branchId: string, capability: SupervisorCapability, on: boolean) {
    const current = new Set(access[branchId] ?? []);
    if (on) current.add(capability);
    else current.delete(capability);
    const next: SupervisorAccess = { ...access };
    const ordered = SUPERVISOR_CAPABILITIES.filter((item) => current.has(item));
    if (ordered.length) next[branchId] = ordered;
    else delete next[branchId];
    onChange(next);
  }

  /** La columna completa (sobre las sucursales a la vista). */
  function toggleColumn(capability: SupervisorCapability, on: boolean) {
    const next: SupervisorAccess = { ...access };
    for (const branch of rows) {
      const current = new Set(next[branch.id] ?? []);
      if (on) current.add(capability);
      else current.delete(capability);
      const ordered = SUPERVISOR_CAPABILITIES.filter((item) => current.has(item));
      if (ordered.length) next[branch.id] = ordered;
      else delete next[branch.id];
    }
    onChange(next);
  }

  const selectedCount = Object.keys(access).length;

  return (
    <div className="sup-matrix" style={{ gridColumn: "1 / -1" }}>
      <FormControlLabel
        control={<Switch checked={limited} onChange={(e) => onChange(e.target.checked ? {} : null)} />}
        label="Limitar sucursales de la app del supervisor"
      />
      <p className="page-kicker" style={{ margin: "0 0 8px" }}>
        {limited
          ? `Solo ve y hace lo marcado (${selectedCount} ${selectedCount === 1 ? "sucursal" : "sucursales"}). Cortes le agrega esa pestaña.`
          : "Apagado: ve todas las sucursales según su perfil, sin la pestaña Cortes."}
      </p>

      {limited ? (
        <>
          <TextField
            size="small"
            placeholder="Buscar sucursal o ciudad"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 1 }}
          />
          <div className="sup-matrix-scroll">
            <table className="table sup-matrix-table">
              <thead>
                <tr>
                  <th>Sucursal</th>
                  {SUPERVISOR_CAPABILITIES.map((capability) => {
                    const all = rows.length > 0 && rows.every((branch) => has(branch.id, capability));
                    const some = rows.some((branch) => has(branch.id, capability));
                    return (
                      <th key={capability} style={{ textAlign: "center" }}>
                        <Tooltip title={enabled[capability] ? "Marcar o quitar toda la columna" : "Su perfil no lo permite"}>
                          <span>
                            <Checkbox
                              size="small"
                              checked={all}
                              indeterminate={!all && some}
                              disabled={!enabled[capability] || !rows.length}
                              onChange={(e) => toggleColumn(capability, e.target.checked)}
                              inputProps={{ "aria-label": `${SUPERVISOR_CAPABILITY_LABELS[capability]}: todas` }}
                            />
                          </span>
                        </Tooltip>
                        <div>{SUPERVISOR_CAPABILITY_LABELS[capability]}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((branch) => (
                  <tr key={branch.id}>
                    <td>
                      <strong>{branch.code}</strong> · {branch.name}
                      {branch.city ? <span className="sup-matrix-city"> · {branch.city}</span> : null}
                    </td>
                    {SUPERVISOR_CAPABILITIES.map((capability) => (
                      <td key={capability} style={{ textAlign: "center" }}>
                        <Checkbox
                          size="small"
                          checked={has(branch.id, capability)}
                          disabled={!enabled[capability]}
                          onChange={(e) => toggle(branch.id, capability, e.target.checked)}
                          inputProps={{ "aria-label": `${branch.code} ${SUPERVISOR_CAPABILITY_LABELS[capability]}` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={SUPERVISOR_CAPABILITIES.length + 1} style={{ textAlign: "center", color: "var(--muted)" }}>
                      Ninguna sucursal con ese nombre.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
