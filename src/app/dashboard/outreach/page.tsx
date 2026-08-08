import { redirect } from "next/navigation";

/** Ruta legacy: Outreach vive ahora en el modulo unificado Prospeccion. */
export default function OutreachRedirect() {
  redirect("/dashboard/prospeccion?tab=contactar");
}
