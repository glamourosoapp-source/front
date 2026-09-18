"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { CloudOff, RefreshCw, Trash2 } from "lucide-react";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { formatMoney } from "@/lib/format-money";
import type { Branch, PosSyncRejection } from "@/types";
import type { BranchSyncState, PosSaleEventPayload } from "@glamouroso/shared/pos-sync";
import { toast } from "sonner";

/**
 * Requiere atención: ventas que la caja cobró y el servidor no pudo aplicar.
 *
 * Existen porque el dinero ya entró al cajón. El servidor no las descarta ni las
 * reintenta en bucle —si el producto ya no existe, insistir no lo devuelve— así
 * que esperan aquí a que alguien decida: arreglar la causa y reintentar, o
 * descartar con un motivo escrito.
 *
 * Solo administración de sucursales, nunca el mostrador: decidir que una venta
 * cobrada no entra al sistema no es una decisión del cajero.
 */
export function BranchSyncTab({ branch }: { branch: Branch }) {
  const { can } = usePermissions();
  const canResolve = can("posBranches", "update");

  const [rows, setRows] = useState<PosSyncRejection[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ row: PosSyncRejection; action: "retry" | "discard" } | null>(
    null
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await httpClient.get<PosSyncRejection[]>("/pos/sync/rejections", { branchId: branch.id })
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudieron cargar los eventos pendientes"));
    } finally {
      setLoading(false);
    }
  }, [branch.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve() {
    if (!confirm) return;
    if (confirm.action === "discard" && notes.trim().length < 3) {
      toast.error("Escribe por qué se descarta esta venta");
      return;
    }
    setSaving(true);
    try {
      await httpClient.post(`/pos/sync/rejections/${confirm.row.id}/resolve`, {
        action: confirm.action,
        notes: notes.trim() || null,
      });
      toast.success(confirm.action === "retry" ? "Venta aplicada" : "Evento descartado");
      setConfirm(null);
      setNotes("");
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo resolver el evento"));
    } finally {
      setSaving(false);
    }
  }

  const sync = (branch.syncState ?? {}) as BranchSyncState;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SyncSummary sync={sync} />

      <div className="card">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Requiere atención</h3>
          <Button size="small" startIcon={<RefreshCw size={15} />} onClick={() => void load()}>
            Actualizar
          </Button>
        </div>

        {loading ? (
          <p className="page-kicker">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="page-kicker" style={{ margin: 0 }}>
            Nada pendiente: todo lo que cobró esta caja entró al sistema.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((row) => (
              <RejectionCard
                key={row.id}
                row={row}
                canResolve={canResolve}
                onRetry={() => {
                  setNotes("");
                  setConfirm({ row, action: "retry" });
                }}
                onDiscard={() => {
                  setNotes("");
                  setConfirm({ row, action: "discard" });
                }}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {confirm?.action === "retry" ? "Reintentar esta venta" : "Descartar esta venta"}
        </DialogTitle>
        <DialogContent dividers>
          <p style={{ marginTop: 0 }}>
            {confirm?.action === "retry"
              ? "Se vuelve a aplicar tal como se cobró. Si la causa sigue ahí (un producto borrado, por ejemplo), volverá a fallar."
              : "La venta no entrará al sistema. El ticket ya se imprimió y el dinero ya está en la caja, así que el corte de ese día no la va a incluir."}
          </p>
          <TextField
            label={confirm?.action === "discard" ? "Motivo (obligatorio)" : "Nota (opcional)"}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color={confirm?.action === "discard" ? "error" : "primary"}
            disabled={saving}
            onClick={() => void resolve()}
          >
            {confirm?.action === "retry" ? "Reintentar" : "Descartar"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

/** Lo que la caja reportó la última vez que habló con el servidor. */
function SyncSummary({ sync }: { sync: BranchSyncState }) {
  const pending = sync.pendingCount ?? 0;
  if (!sync.lastSeenAt) {
    return (
      <div className="card">
        <p className="page-kicker" style={{ margin: 0 }}>
          Esta sucursal todavía no ha reportado su caja. Aparecerá aquí en cuanto cobre por primera vez.
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <Metric
        label="Ventas sin subir"
        value={String(pending)}
        tone={pending > 0 ? "warn" : "ok"}
      />
      <Metric
        label="Último contacto"
        value={new Date(sync.lastSeenAt).toLocaleString("es-MX")}
      />
      <Metric
        label="Desde"
        value={sync.oldestPendingAt ? new Date(sync.oldestPendingAt).toLocaleString("es-MX") : "—"}
      />
      <Metric label="Computadora" value={sync.deviceId ? sync.deviceId.slice(0, 8) : "—"} />
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div>
      <span className="pos-total-label">{label}</span>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: tone === "warn" ? "#b45309" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function RejectionCard({
  row,
  canResolve,
  onRetry,
  onDiscard,
}: {
  row: PosSyncRejection;
  canResolve: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const payload = row.payload as unknown as Partial<PosSaleEventPayload>;
  return (
    <div
      style={{
        border: "1px solid #f1d4d4",
        borderRadius: 10,
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <CloudOff size={16} color="#c62828" />
        <strong>{payload.ticketNumber ?? "(sin folio)"}</strong>
        {payload.total != null ? <Chip size="small" label={formatMoney(Number(payload.total))} /> : null}
        <Chip size="small" variant="outlined" label={row.eventType} />
        <span className="page-kicker">
          {new Date(row.occurredAt).toLocaleString("es-MX")}
          {row.cashier?.name ? ` · ${row.cashier.name}` : ""}
        </span>
      </div>
      <div style={{ color: "#c62828", fontWeight: 600 }}>{row.reason}</div>
      {payload.items?.length ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)" }}>
          {payload.items.map((item, index) => (
            <li key={index}>
              {item.quantity} × {formatMoney(Number(item.unitPrice))} = {formatMoney(Number(item.total))}
            </li>
          ))}
        </ul>
      ) : null}
      {canResolve ? (
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="small" variant="contained" startIcon={<RefreshCw size={14} />} onClick={onRetry}>
            Reintentar
          </Button>
          <Button size="small" color="error" startIcon={<Trash2 size={14} />} onClick={onDiscard}>
            Descartar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
