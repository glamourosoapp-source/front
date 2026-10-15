import { Check } from "lucide-react";

export type RestockStep = "review" | "transit" | "received";

const STEPS: Array<{ key: RestockStep; label: string }> = [
  { key: "review", label: "Revisar y enviar" },
  { key: "transit", label: "En camino" },
  { key: "received", label: "Recibido" },
];

/**
 * Los 3 pasos del surtido a fábrica, con el actual resaltado: Revisar y enviar
 * → En camino → Recibido. Lo usan la pestaña de la sucursal, la revisión, la
 * recepción y la hoja del pedido.
 */
export function RestockSteps({ current, compact = false }: { current: RestockStep; compact?: boolean }) {
  const index = STEPS.findIndex((step) => step.key === current);
  return (
    <ol className={`restock-steps${compact ? " is-compact" : ""}`} aria-label="Pasos del pedido a fábrica">
      {STEPS.map((step, i) => {
        const state = i < index ? "is-done" : i === index ? "is-current" : "";
        return (
          <li key={step.key} className={state} aria-current={i === index ? "step" : undefined}>
            <span className="restock-steps-dot">{i < index ? <Check size={13} /> : i + 1}</span>
            <span className="restock-steps-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
