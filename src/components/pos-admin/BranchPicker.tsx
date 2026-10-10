"use client";

import { useMemo, useRef, useState } from "react";
import { Button, Popover } from "@mui/material";
import { Check, ChevronDown, Search, Store, X } from "lucide-react";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import type { Branch } from "@/types";

/** Sucursales con caja: las franquicias no venden en el punto de venta. */
export function posBranches(branches: Branch[]): Branch[] {
  return branches
    .filter((branch) => branch.type !== BRANCH_TYPES.FRANCHISE)
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "es"));
}

/** "Todas las sucursales", "Zapopan Centro", "Zapopan y Tonalá" o "4 sucursales". */
export function branchSelectionLabel(branches: Branch[], selected: string[]): string {
  if (!selected.length) return "Todas las sucursales";
  const names = selected.map((id) => branches.find((branch) => branch.id === id)?.name ?? "Sucursal");
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.length} sucursales`;
}

/**
 * Filtro de sucursales de Cortes: **una, varias o todas**. Un botón dice lo
 * elegido y abre la lista con buscador y casillas; los cambios se aplican con
 * "Aplicar", para no lanzar las consultas del corte en cada casilla. Lista
 * vacía = todas, igual que en el Back (`branchIds`).
 */
export function BranchPicker({
  branches,
  value,
  onChange,
}: {
  branches: Branch[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(value);
  const [search, setSearch] = useState("");

  const options = useMemo(() => posBranches(branches), [branches]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (branch) => branch.name.toLowerCase().includes(term) || branch.code.toLowerCase().includes(term)
    );
  }, [options, search]);

  const openPicker = () => {
    setDraft(value);
    setSearch("");
    setOpen(true);
  };
  const toggle = (id: string) =>
    setDraft((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  // Marcar todas una por una es lo mismo que "todas": se guarda vacío.
  const apply = () => {
    onChange(draft.length === options.length ? [] : draft);
    setOpen(false);
  };

  const allSelected = !draft.length;
  const label = branchSelectionLabel(branches, value);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`branch-trigger${open ? " is-open" : ""}${value.length ? " has-value" : ""}`}
        onClick={openPicker}
        aria-haspopup="dialog"
      >
        <Store size={16} />
        <span className="branch-trigger-text">
          <small>Sucursal</small>
          <span>{label}</span>
        </span>
        {value.length > 1 ? <span className="branch-trigger-count">{value.length}</span> : null}
        {value.length ? (
          <span
            role="button"
            tabIndex={0}
            className="branch-trigger-clear"
            aria-label="Ver todas las sucursales"
            onClick={(event) => {
              event.stopPropagation();
              onChange([]);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onChange([]);
              }
            }}
          >
            <X size={14} />
          </span>
        ) : (
          <ChevronDown size={15} className="branch-trigger-caret" />
        )}
      </button>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { className: "period-popover branch-popover", elevation: 0 } }}
      >
        <div className="branch-picker">
          <div className="branch-search">
            <Search size={16} />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o código"
              aria-label="Buscar sucursal"
            />
          </div>

          <button
            type="button"
            className={`branch-option is-all${allSelected ? " is-checked" : ""}`}
            onClick={() => setDraft([])}
          >
            <span className="branch-check">{allSelected ? <Check size={13} /> : null}</span>
            <span className="branch-option-text">
              <b>Todas las sucursales</b>
              <small>{options.filter((branch) => branch.isActive).length} activas</small>
            </span>
          </button>

          <div className="branch-list" role="listbox" aria-multiselectable="true">
            {visible.map((branch) => {
              const checked = draft.includes(branch.id);
              return (
                <button
                  key={branch.id}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  className={`branch-option${checked ? " is-checked" : ""}${branch.isActive ? "" : " is-inactive"}`}
                  onClick={() => toggle(branch.id)}
                >
                  <span className="branch-check">{checked ? <Check size={13} /> : null}</span>
                  <span className="branch-option-text">
                    <b>{branch.name}</b>
                    <small>
                      {branch.code}
                      {branch.isActive ? "" : " · inactiva"}
                    </small>
                  </span>
                </button>
              );
            })}
            {!visible.length ? <p className="branch-empty">Ninguna sucursal coincide con “{search}”.</p> : null}
          </div>

          <footer className="branch-footer">
            <span className="branch-footer-count">
              {allSelected ? "Todas" : `${draft.length} de ${options.length}`}
            </span>
            <div className="period-footer-actions">
              <Button onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="contained" onClick={apply}>
                Aplicar
              </Button>
            </div>
          </footer>
        </div>
      </Popover>
    </>
  );
}
