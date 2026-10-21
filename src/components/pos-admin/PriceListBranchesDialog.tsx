"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Tooltip } from "@mui/material";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { FilterSearch } from "@/components/pos-admin/FilterBar";
import type { PriceList, PriceListBranch } from "@glamouroso/shared";

const GENERAL = "Precio general";

/**
 * Qué sucursales cobran con una lista. Marcar una sucursal que está en otra
 * lista la mueve aquí; desmarcarla en una lista de ciudad la regresa al precio
 * general. En "Precio general" no se desmarca: una sucursal sale de ahí al
 * asignarla a una ciudad.
 */
export function PriceListBranchesDialog({
  open,
  target,
  lists,
  branches,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = precio general del catálogo. */
  target: PriceList | null;
  lists: PriceList[];
  branches: PriceListBranch[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const targetId = target?.id ?? null;
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(Object.fromEntries(branches.map((b) => [b.id, b.priceListId])));
    setSearch("");
  }, [open, branches]);

  const listName = (id: string | null) => (id ? lists.find((l) => l.id === id)?.name ?? "Otra lista" : GENERAL);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return branches.filter(
      (b) => !needle || b.code.toLowerCase().includes(needle) || b.name.toLowerCase().includes(needle)
    );
  }, [branches, search]);

  const changes = branches.filter((b) => (draft[b.id] ?? null) !== b.priceListId);
  const inTarget = branches.filter((b) => (draft[b.id] ?? null) === targetId).length;

  function toggle(branch: PriceListBranch, checked: boolean) {
    setDraft((prev) => ({
      ...prev,
      // Desmarcar en una ciudad la regresa a su lista original si venía de otra
      // ciudad, o al precio general.
      [branch.id]: checked ? targetId : branch.priceListId === targetId ? null : branch.priceListId,
    }));
  }

  async function save() {
    if (!changes.length) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await httpClient.put("/pos/price-lists/assignments", {
        assignments: changes.map((b) => ({ branchId: b.id, priceListId: draft[b.id] ?? null })),
      });
      toast.success(
        changes.length === 1
          ? `${changes[0]!.code} ahora cobra con ${listName(draft[changes[0]!.id] ?? null)}`
          : `${changes.length} sucursales cambiaron de lista`
      );
      await onSaved();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron asignar las sucursales"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Sucursales con {target ? `precios de ${target.name}` : "el precio general"}
        <div className="page-kicker" style={{ margin: "4px 0 0", fontSize: 14 }}>
          {target
            ? "Marca las sucursales que cobran con esta lista. Si estaban en otra lista, se mueven aquí."
            : "Marca las sucursales que deben volver al precio del catálogo."}
        </div>
      </DialogTitle>
      <DialogContent dividers sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <div className="filter-bar is-plain">
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar sucursal por código o nombre" />
        </div>
        <div className="price-branch-list">
          {visible.map((branch) => {
            const current = draft[branch.id] ?? null;
            const checked = current === targetId;
            const lockedInGeneral = !target && branch.priceListId === null;
            const moved = current !== branch.priceListId;
            const box = (
              <Checkbox
                size="small"
                checked={checked}
                disabled={saving || lockedInGeneral}
                onChange={(e) => toggle(branch, e.target.checked)}
                inputProps={{ "aria-label": `${branch.code} ${branch.name}` }}
              />
            );
            return (
              <label key={branch.id} className={`price-branch-row ${checked ? "is-checked" : ""}`}>
                {lockedInGeneral ? (
                  <Tooltip title="Para cambiarla, asígnala desde la tarjeta de una ciudad">
                    <span>{box}</span>
                  </Tooltip>
                ) : (
                  box
                )}
                <span className="branch-code-badge">{branch.code}</span>
                <span className="price-branch-name">
                  {branch.name}
                  {!branch.isActive ? <span className="pill-muted" style={{ marginLeft: 6 }}>Inactiva</span> : null}
                </span>
                <span className="price-branch-current">
                  {moved ? (
                    <>
                      {listName(branch.priceListId)} <ArrowRight size={12} /> <strong>{listName(current)}</strong>
                    </>
                  ) : (
                    listName(current)
                  )}
                </span>
              </label>
            );
          })}
          {!visible.length ? <p className="page-kicker">Ninguna sucursal coincide.</p> : null}
        </div>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3 }}>
        <span className="page-kicker" style={{ margin: 0 }}>
          {inTarget} {inTarget === 1 ? "sucursal" : "sucursales"} · {changes.length}{" "}
          {changes.length === 1 ? "cambio" : "cambios"}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={() => void save()} disabled={saving || !changes.length}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </DialogActions>
    </Dialog>
  );
}
