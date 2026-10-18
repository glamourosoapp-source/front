"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import type { InventoryCount } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";

export interface CountBranch {
  id: string;
  name: string;
  code?: string | null;
}

/**
 * Confirmación antes de iniciar un conteo: la lista se arma al azar al
 * presionar Iniciar, así que se inicia ya en la tienda. Si la sucursal ya
 * tenía uno en curso, el servidor devuelve ese y se continúa.
 */
export function StartCountDialog({ branch, onClose }: { branch: CountBranch | null; onClose: () => void }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const start = async () => {
    if (!branch) return;
    setStarting(true);
    try {
      const count = await httpClient.post<InventoryCount>("/pos/counts", { branchId: branch.id });
      router.push(`/supervisor/conteos/${count.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "No se pudo iniciar el conteo"));
      setStarting(false);
    }
  };

  return (
    <Dialog open={Boolean(branch)} onClose={() => (starting ? null : onClose())} fullWidth maxWidth="xs">
      <DialogTitle>Iniciar conteo</DialogTitle>
      <DialogContent dividers>
        <p style={{ marginTop: 0 }}>
          Conteo de inventario en <strong>{branch ? [branch.code, branch.name].filter(Boolean).join(" · ") : ""}</strong>.
        </p>
        <p style={{ marginBottom: 0 }}>
          La lista se arma al azar en este momento; cuéntala en la tienda. Cuenta lo que hay en el anaquel y la bodega,
          sin ver lo que dice el sistema.
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={starting}>
          Ahora no
        </Button>
        <Button variant="contained" startIcon={<ClipboardCheck size={16} />} onClick={() => void start()} disabled={starting}>
          {starting ? "Armando la lista…" : "Iniciar conteo"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
