"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mui/material";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { DataTable } from "@/components/ui/DataTable";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { Customer, ListResponse } from "@/types";
import { toast } from "sonner";

export default function CustomersPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await httpClient.get<ListResponse<Customer>>("/customers", { search, zone, limit: 100 });
      setCustomers(r.items);
    } catch {
      toast.error("Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setOpen(true);
  }

  async function remove(customer: Customer) {
    try {
      await httpClient.delete(`/customers/${customer.id}`);
      toast.success(`Cliente ${customer.name} eliminado con éxito`);
      await load();
    } catch {
      toast.error("Error al eliminar el cliente");
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-kicker">Directorio de clientes, historial de pedidos y compras acumuladas.</p>
        </div>
        {can("customers", "create") ? (
          <Button variant="contained" onClick={openCreate}>Nuevo cliente</Button>
        ) : null}
      </div>
      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Base de clientes</h2>
            <p className="page-kicker">Consulta rapida para ventas y soporte.</p>
          </div>
          <span className="pill">{customers.length} clientes</span>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_auto]">
          <input className="input" placeholder="Buscar nombre o WhatsApp" value={search} onChange={(e) => setSearch(e.target.value)} />
          <input className="input" placeholder="Zona" value={zone} onChange={(e) => setZone(e.target.value)} />
          <Button variant="outlined" onClick={load} disabled={loading}>{loading ? "Cargando..." : "Filtrar"}</Button>
        </div>
        <DataTable
          rows={customers}
          getKey={(row) => row.id}
          getDeleteLabel={(row) => row.name}
          onRowClick={(row) => router.push(`/dashboard/customers/${row.id}`)}
          onEdit={can("customers", "update") ? openEdit : undefined}
          onDelete={can("customers", "delete") ? remove : undefined}
          columns={[
            { key: "name", label: "Nombre" },
            { key: "phone", label: "WhatsApp" },
            { key: "colony", label: "Colonia" },
            { key: "postalCode", label: "CP" },
            { key: "zone", label: "Zona" },
            {
              key: "pricingTier",
              label: "Precio",
              render: (r) => (r.pricingTier === "wholesale" ? "Mayoreo" : "Menudeo"),
            },
            { key: "totalOrders", label: "Pedidos" },
            { key: "totalSpent", label: "Compra", render: (r) => `$${Number(r.totalSpent || 0).toFixed(2)}` },
          ]}
        />
      </section>

      <CustomerFormDialog
        open={open}
        customer={editing}
        onClose={() => setOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
