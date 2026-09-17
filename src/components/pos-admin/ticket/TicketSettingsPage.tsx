"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Button, MenuItem, TextField } from "@mui/material";
import { Printer, Receipt, ShieldAlert, Store } from "lucide-react";
import {
  resolveTicketSettings,
  type OrganizationTicketSettings,
  type PosSettings,
  type TicketSettings,
} from "@glamouroso/shared";
import { BRANCH_TYPES } from "@glamouroso/shared/constants";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { sampleSale } from "@/lib/pos/sample-ticket";
import {
  branchPayload,
  draftFromSettings,
  groupsFromRaw,
  organizationPayload,
  settingsFromDraft,
  TICKET_GROUP_FIELDS,
  type TicketDraft,
  type TicketGroupKey,
  type TicketGroupState,
} from "@/lib/pos/ticket-settings-form";
import { PosTicketSheet } from "@/components/pos/PosTicketSheet";
import type { Branch } from "@/types";
import { toast } from "sonner";
import { TicketSettingsForm } from "./TicketSettingsForm";
import { TicketPreviewPanel } from "./TicketPreviewPanel";

/** "org" edita el ticket que heredan todas las sucursales; si no, es el id de una. */
type Scope = "org" | string;

/**
 * Configuración del ticket de venta.
 *
 * Dos niveles en una sola pantalla: el ticket de la empresa (datos de
 * facturación, tipografía y qué se imprime) y el de cada sucursal, que hereda
 * todo salvo lo que decida personalizar. La vista previa se arma en el cliente
 * con el mismo código que imprime la caja.
 */
export function TicketSettingsPage() {
  const { can } = usePermissions();
  // La ficha de una sucursal enlaza aquí con `?branch=<id>` para abrir su ticket.
  const requestedBranch = useSearchParams().get("branch");
  const canView = can("settings", "view");
  const canUpdateOrg = can("settings", "update");
  const canSeeBranches = can("posBranches", "view");
  const canUpdateBranch = can("posBranches", "update");

  const [scope, setScope] = useState<Scope>("org");
  const [orgTicket, setOrgTicket] = useState<OrganizationTicketSettings | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [draft, setDraft] = useState<TicketDraft | null>(null);
  const [groups, setGroups] = useState<TicketGroupState | null>(null);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const isOrgScope = scope === "org";
  const canSave = isOrgScope ? canUpdateOrg : canUpdateBranch;

  /** Ticket heredado por una sucursal: el de la empresa, ya resuelto. */
  const inheritedDraft = useMemo(
    () => (orgTicket ? draftFromSettings(orgTicket) : null),
    [orgTicket]
  );

  useEffect(() => {
    if (!canView) return;
    async function load() {
      try {
        const [settings, list] = await Promise.all([
          httpClient.get<PosSettings>("/settings/pos"),
          canSeeBranches
            ? httpClient.get<{ items: Branch[] }>("/pos/branches?limit=100&isActive=true")
            : Promise.resolve({ items: [] as Branch[] }),
        ]);
        setOrgTicket(settings.ticket);
        setWalkInName(settings.walkInCustomerName);
        setBranches(list.items ?? []);
      } catch (error) {
        toast.error(getApiErrorMessage(error, "No se pudo cargar la configuración del ticket"));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [canView, canSeeBranches]);

  /** Carga el borrador del nivel elegido: la empresa o una sucursal. */
  const openScope = useCallback(
    async (next: Scope) => {
      if (!orgTicket) return;
      setScope(next);
      if (next === "org") {
        const nextDraft = draftFromSettings(orgTicket);
        setBranch(null);
        setGroups(null);
        setDraft(nextDraft);
        setBaseline(JSON.stringify({ draft: nextDraft, walkInName }));
        return;
      }
      try {
        const detail = await httpClient.get<Branch>(`/pos/branches/${next}`);
        // El ticket que ve la caja: lo propio de la sucursal sobre lo de la empresa.
        const resolved = resolveTicketSettings({ ticket: orgTicket }, detail.ticketSettings);
        const nextDraft = draftFromSettings(resolved);
        const nextGroups = groupsFromRaw(detail.ticketSettings as Record<string, unknown> | null);
        setBranch(detail);
        setDraft(nextDraft);
        setGroups(nextGroups);
        setBaseline(JSON.stringify({ draft: nextDraft, groups: nextGroups }));
      } catch (error) {
        toast.error(getApiErrorMessage(error, "No se pudo cargar la sucursal"));
        setScope("org");
      }
    },
    [orgTicket, walkInName]
  );

  // Al terminar de cargar abre el nivel pedido en la URL, o el de la empresa.
  useEffect(() => {
    if (orgTicket && !draft) void openScope(requestedBranch || "org");
  }, [orgTicket, draft, openScope, requestedBranch]);

  function patch(changes: Partial<TicketDraft>) {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  }

  /**
   * Apagar un grupo devuelve sus campos a lo que dicta la empresa: así la vista
   * previa muestra de inmediato lo que verá la caja tras guardar.
   */
  function toggleGroup(group: TicketGroupKey, enabled: boolean) {
    setGroups((current) => (current ? { ...current, [group]: enabled } : current));
    if (!enabled && inheritedDraft) {
      const restored: Partial<TicketDraft> = {};
      for (const field of TICKET_GROUP_FIELDS[group]) {
        restored[field] = inheritedDraft[field] as never;
      }
      patch(restored);
    }
  }

  const previewSettings: TicketSettings | null = draft ? settingsFromDraft(draft) : null;
  // En el nivel empresa el ticket se muestra con una sucursal real de ejemplo,
  // para que se vea de dónde salen el domicilio y el teléfono heredados. Se
  // prefiere una sucursal con caja: una franquicia no imprime tickets.
  const previewSale = useMemo(() => {
    const example =
      branch ?? branches.find((item) => item.type === BRANCH_TYPES.BRANCH) ?? branches[0] ?? null;
    return sampleSale({ branch: example });
  }, [branch, branches]);

  const dirty =
    draft !== null &&
    baseline !== JSON.stringify(isOrgScope ? { draft, walkInName } : { draft, groups });

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      if (isOrgScope) {
        const result = await httpClient.put<PosSettings>("/settings/pos", {
          ticket: organizationPayload(draft),
          walkInCustomerName: walkInName.trim(),
        });
        setOrgTicket(result.ticket);
        setWalkInName(result.walkInCustomerName);
        const nextDraft = draftFromSettings(result.ticket);
        setDraft(nextDraft);
        setBaseline(JSON.stringify({ draft: nextDraft, walkInName: result.walkInCustomerName }));
        toast.success("Ticket de la empresa guardado");
      } else {
        const resolved = await httpClient.put<TicketSettings>(
          `/pos/branches/${scope}/ticket-settings`,
          branchPayload(draft, groups ?? ({} as TicketGroupState))
        );
        const nextDraft = draftFromSettings(resolved);
        setDraft(nextDraft);
        setBaseline(JSON.stringify({ draft: nextDraft, groups }));
        toast.success(`Ticket de ${branch?.name ?? "la sucursal"} guardado`);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo guardar el ticket"));
    } finally {
      setSaving(false);
    }
  }

  /** Cambiar de nivel descarta el borrador: mejor avisar antes de perderlo. */
  function changeScope(next: Scope) {
    if (next === scope) return;
    if (dirty && !window.confirm("Hay cambios sin guardar en este ticket. ¿Los descartas?")) return;
    void openScope(next);
  }

  /**
   * Prueba por el diálogo del navegador: imprime la misma hoja de respaldo que
   * usa la caja sin agente. El ticket de prueba nunca toca la venta real.
   */
  function printTest() {
    setPrinting(true);
    // La hoja se monta por portal; hay que dejar pintar antes de abrir el diálogo.
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 120);
  }

  if (!canView) {
    return (
      <div className="page-stack">
        <div className="panel p-5 flex items-center gap-3">
          <ShieldAlert size={20} style={{ color: "var(--glam-blue)" }} />
          <div>
            <h2 style={{ margin: 0 }}>Solo administradores</h2>
            <p className="page-kicker" style={{ margin: 0 }}>
              El ticket de venta lo configura quien administra el sistema.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Ticket de venta</h1>
          <p className="page-kicker">
            Datos de facturación, tamaño de letra y qué se imprime. Cada sucursal hereda esta
            configuración y puede personalizar lo que necesite.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            startIcon={<Printer size={16} />}
            onClick={printTest}
            disabled={!previewSettings}
          >
            Imprimir prueba
          </Button>
          <Button variant="contained" onClick={() => void save()} disabled={!dirty || saving || !canSave}>
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </div>

      <div className="panel p-5">
        <div className="form-grid">
          <TextField
            select
            label="¿Qué ticket estás editando?"
            value={scope}
            onChange={(event) => void changeScope(event.target.value)}
            fullWidth
            disabled={loading}
            helperText={
              isOrgScope
                ? "Es el ticket que heredan todas las sucursales."
                : "Solo se guarda lo que marques como personalizado; el resto sigue a la empresa."
            }
          >
            <MenuItem value="org">
              <Receipt size={14} style={{ marginRight: 8, verticalAlign: "-2px" }} />
              Predeterminado de la empresa
            </MenuItem>
            {branches.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                <Store size={14} style={{ marginRight: 8, verticalAlign: "-2px" }} />
                {item.code} · {item.name}
              </MenuItem>
            ))}
          </TextField>
          {isOrgScope ? (
            <TextField
              label="Cliente de mostrador"
              value={walkInName}
              onChange={(event) => setWalkInName(event.target.value)}
              fullWidth
              disabled={!canUpdateOrg}
              helperText="Nombre que se imprime cuando la venta no se registra a un cliente."
            />
          ) : (
            <TextField
              label="Domicilio y teléfono de la sucursal"
              value={
                [branch?.street, branch?.colony, branch?.city, branch?.phone]
                  .filter(Boolean)
                  .join(" · ") || "Sin capturar"
              }
              fullWidth
              disabled
              helperText={
                <>
                  Se editan en la ficha de la sucursal.{" "}
                  <Link href={`/dashboard/pos/sucursales/${scope}`}>Abrir la sucursal</Link>
                </>
              }
            />
          )}
        </div>
      </div>

      {!canSave ? (
        <Alert severity="info">
          Puedes revisar la configuración, pero no guardarla: te falta el permiso de{" "}
          {isOrgScope ? "configuración del sistema" : "editar sucursales"}.
        </Alert>
      ) : null}

      {!isOrgScope && branches.length === 0 && canSeeBranches ? (
        <Alert severity="warning">Todavía no hay sucursales activas.</Alert>
      ) : null}

      {loading || !draft || !previewSettings ? (
        <div className="panel p-5">Cargando la configuración del ticket...</div>
      ) : (
        <div className="ticket-settings">
          <TicketSettingsForm
            draft={draft}
            onChange={patch}
            groups={groups ?? undefined}
            onToggleGroup={toggleGroup}
            disabled={!canSave}
          />
          <div className="ticket-settings__preview">
            <TicketPreviewPanel
              sale={previewSale}
              settings={previewSettings}
              walkInCustomerName={walkInName}
            />
          </div>
        </div>
      )}

      {/* La hoja solo existe mientras se imprime la prueba. */}
      {printing && previewSettings ? (
        <PosTicketSheet
          sale={previewSale}
          settings={previewSettings}
          walkInCustomerName={walkInName}
        />
      ) : null}
    </div>
  );
}
