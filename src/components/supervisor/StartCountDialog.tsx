"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, EyeOff, MapPin, Shuffle, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { INVENTORY_COUNT_DEFAULTS } from "@glamouroso/shared/constants";
import type { InventoryCount } from "@glamouroso/shared";
import { httpClient, getApiErrorMessage } from "@/services/http-client";
import { CountDialog } from "./CountDialog";

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

  const steps = [
    {
      icon: Shuffle,
      title: `${INVENTORY_COUNT_DEFAULTS.ITEMS} productos al azar`,
      text: "La lista se arma en cuanto lo inicias; nadie la conoce antes.",
    },
    {
      icon: Warehouse,
      title: "Anaquel y bodega",
      text: "Cuenta todo lo que hay en la tienda de cada producto.",
    },
    {
      icon: EyeOff,
      title: "Conteo ciego",
      text: "No verás lo que dice el sistema: anota solo lo que cuentas.",
    },
  ];

  return (
    <CountDialog
      open={Boolean(branch)}
      onClose={onClose}
      busy={starting}
      icon={ClipboardCheck}
      title="Iniciar conteo"
      subtitle={
        branch ? (
          <>
            {branch.code ? <span className="supd-code">{branch.code}</span> : null}
            {branch.name}
          </>
        ) : null
      }
      actions={
        <>
          <button type="button" className="supd-btn" onClick={onClose} disabled={starting}>
            Ahora no
          </button>
          <button type="button" className="supd-btn is-primary" onClick={() => void start()} disabled={starting}>
            <ClipboardCheck size={18} />
            {starting ? "Armando la lista…" : "Iniciar conteo"}
          </button>
        </>
      }
    >
      <ol className="supd-steps">
        {steps.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <span aria-hidden>
              <Icon size={18} />
            </span>
            <div>
              <strong>{title}</strong>
              <small>{text}</small>
            </div>
          </li>
        ))}
      </ol>
      <p className="supd-note">
        <MapPin size={16} />
        Inícialo ya estando en la tienda.
      </p>
    </CountDialog>
  );
}
