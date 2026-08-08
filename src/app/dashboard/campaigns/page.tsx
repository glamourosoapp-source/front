import { redirect } from "next/navigation";

/** Ruta legacy: las campanas viven ahora en el modulo unificado Prospeccion. */
export default function CampaignsRedirectPage() {
  redirect("/dashboard/prospeccion?tab=campanas");
}
