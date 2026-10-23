"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

/** Entrada del menú "Más": el pedido es siempre el de la sucursal de la caja. */
export default function CashierRestockEntry() {
  const router = useRouter();
  const branchId = useAuthStore((s) => s.user?.branchId ?? null);

  useEffect(() => {
    if (branchId) router.replace(`/pos/pedido/${branchId}`);
  }, [branchId, router]);

  return <p className="page-kicker">{branchId ? "Calculando el pedido..." : "Este usuario no tiene sucursal."}</p>;
}
