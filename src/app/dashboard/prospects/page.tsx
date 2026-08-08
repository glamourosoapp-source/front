import { redirect } from "next/navigation";

/** Ruta legacy: Prospectos IA vive ahora en el modulo unificado Prospeccion. */
export default function ProspectsRedirect() {
  redirect("/dashboard/prospeccion?tab=buscar");
}
