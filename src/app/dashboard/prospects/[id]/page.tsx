import { redirect } from "next/navigation";

/** Ruta legacy: el detalle de prospecto vive ahora bajo Prospeccion. */
export default async function ProspectDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/prospeccion/${id}`);
}
