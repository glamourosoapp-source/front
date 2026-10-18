"use client";

import { useState } from "react";
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { toast } from "sonner";
import type { InventoryCountItem } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { signedMoney, signedQty } from "./count-labels";

const QUICK_REASONS = ["Error de conteo", "Producto en otra ubicación de la tienda", "Venta de la caja sin subir"];

/**
 * Revertir el ajuste de un renglón: el Back crea el movimiento contrario en el
 * kardex (el original no se borra) y marca el renglón como revertido. El motivo
 * es obligatorio (3 a 300 caracteres, igual que `revertInventoryCountItemSchema`).
 */
export function RevertItemDialog({
  countId,
  item,
  onClose,
  onReverted,
}: {
  countId: string;
  item: InventoryCountItem;
  onClose: () => void;
  onReverted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const trimmed = reason.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 300;
  const variance = Number(item.varianceQty ?? 0);

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      await httpClient.post(`/pos/counts/${countId}/items/${item.id}/revert`, { reason: trimmed });
      toast.success(`Ajuste de ${item.name} revertido`);
      onReverted();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo revertir el ajuste"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Revertir ajuste</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <div>
          <strong style={{ color: "var(--glam-navy)" }}>{item.name}</strong>
          <div className="page-kicker" style={{ margin: 0 }}>
            Ajuste aplicado al cerrar: <strong>{signedQty(item.varianceQty, item.unit)}</strong>
            {item.varianceAmount != null ? ` · ${signedMoney(item.varianceAmount)}` : ""}
          </div>
        </div>
        <Alert severity="warning">
          Se registra el movimiento contrario en el kardex ({signedQty(-variance, item.unit)}): la existencia regresa a
          lo que había antes del ajuste. El ajuste original no se borra y queda el motivo.
        </Alert>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {QUICK_REASONS.map((text) => (
            <Chip key={text} label={text} size="small" variant="outlined" onClick={() => setReason(text)} />
          ))}
        </div>
        <TextField
          label="Motivo"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          multiline
          minRows={2}
          required
          autoFocus
          inputProps={{ maxLength: 300 }}
          helperText={trimmed.length && !valid ? "Escribe al menos 3 caracteres" : `${trimmed.length}/300`}
          error={Boolean(trimmed.length) && !valid}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" color="warning" onClick={() => void submit()} disabled={!valid || saving}>
          {saving ? "Revirtiendo..." : "Revertir ajuste"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
