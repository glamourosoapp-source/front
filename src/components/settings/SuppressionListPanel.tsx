"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";
import { formatMxPhone } from "@/utils/format-phone";
import { SUPPRESSION_REASON } from "@glamouroso/shared/constants";
import type { SuppressionsResponse, SuppressionRow } from "@glamouroso/shared/schemas/campaign";
import { toast } from "sonner";

const REASON_LABELS: Record<string, string> = {
  [SUPPRESSION_REASON.OPT_OUT]: "Pidió no ser contactado",
  [SUPPRESSION_REASON.MANUAL]: "Agregado manualmente",
  [SUPPRESSION_REASON.PROVIDER_BLOCK]: "Bloqueado por Meta",
};

const SOURCE_LABELS: Record<string, string> = {
  agent: "Agente IA",
  dashboard: "Dashboard",
  webhook: "Webhook",
};

/**
 * Lista de exclusión ("no contactar"): teléfonos que jamás reciben mensajes
 * fríos. Los opt-outs del cliente no se pueden quitar desde aquí (el Back lo
 * bloquea); los agregados a mano sí.
 */
export function SuppressionListPanel() {
  const { can } = usePermissions();
  const canManage = can("outreach", "update");
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<SuppressionRow | null>(null);
  const [removing, setRemoving] = useState(false);

  // Debounce + seq guard: sin esto hay un request por tecla y una respuesta
  // fuera de orden deja la lista filtrada con un término anterior.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const response = await httpClient.get<SuppressionsResponse>("/outreach/suppressions", {
        search: debouncedSearch,
      });
      if (seq !== loadSeq.current) return;
      setRows(response.items);
      setTotal(response.total);
    } catch (error) {
      if (seq !== loadSeq.current) return;
      toast.error(getApiErrorMessage(error, "Error al cargar la lista de exclusión"));
    }
  }, [debouncedSearch]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPhone.trim()) return;
    setBusy(true);
    try {
      await httpClient.post("/outreach/suppressions", {
        phone: newPhone.trim(),
        notes: newNotes.trim() || null,
      });
      toast.success("Teléfono agregado a la lista de no contactar");
      setNewPhone("");
      setNewNotes("");
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Error al agregar el teléfono"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(row: SuppressionRow) {
    setRemoving(true);
    try {
      await httpClient.delete(`/outreach/suppressions/${row.id}`);
      toast.success(`${formatMxPhone(row.phone)} salió de la lista`);
      setConfirmRemove(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo quitar de la lista"));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2>Lista de exclusión (no contactar)</h2>
        <span className="pill">{total} teléfonos</span>
      </div>
      <p className="page-kicker mt-1">
        Estos números nunca reciben prospección ni campañas. Los opt-outs del propio cliente
        (&quot;ya no me escribas&quot;) son permanentes y no se pueden quitar.
      </p>

      {canManage && (
        <form onSubmit={handleAdd} className="mt-3 flex flex-wrap items-center gap-2">
          <TextField
            size="small"
            label="Teléfono"
            placeholder="33 1234 5678"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
          />
          <TextField
            size="small"
            label="Nota (opcional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            sx={{ minWidth: 220 }}
          />
          <Button type="submit" variant="outlined" size="small" disabled={busy || !newPhone.trim()}>
            Agregar
          </Button>
        </form>
      )}

      <div className="mt-3 mb-2">
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Buscar teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <p className="page-kicker">Sin teléfonos en la lista.</p>
      ) : (
        <div className="grid gap-1">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2"
              style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid rgba(230,235,243,0.6)" }}
            >
              <span className="flex items-center gap-2">
                <strong>{formatMxPhone(row.phone)}</strong>
                <span className="pill-muted">{REASON_LABELS[row.reason] || row.reason}</span>
                <span style={{ color: "var(--muted)" }}>
                  {SOURCE_LABELS[row.source] || row.source}
                  {row.notes ? ` · ${row.notes}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span style={{ color: "var(--muted)" }}>
                  {new Date(row.createdAt).toLocaleDateString("es-MX")}
                </span>
                {canManage && row.reason !== SUPPRESSION_REASON.OPT_OUT && (
                  <Button size="small" color="error" variant="text" onClick={() => setConfirmRemove(row)}>
                    Quitar
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(confirmRemove)} onClose={() => (removing ? null : setConfirmRemove(null))}>
        <DialogTitle>Quitar de la lista de exclusión</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmRemove ? formatMxPhone(confirmRemove.phone) : ""} volverá a poder recibir
            prospección y campañas de WhatsApp. ¿Quitarlo de la lista?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(null)} disabled={removing}>
            Cancelar
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={removing}
            onClick={() => confirmRemove && handleRemove(confirmRemove)}
          >
            {removing ? "Quitando..." : "Quitar"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
