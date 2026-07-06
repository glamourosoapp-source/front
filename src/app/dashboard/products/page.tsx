"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@mui/material";
import { DataTable } from "@/components/ui/DataTable";
import { ListPagination } from "@/components/ui/ListPagination";
import { ProductDetailDialog } from "@/components/products/ProductDetailDialog";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { httpClient } from "@/services/http-client";
import { usePermissions } from "@/lib/permissions";
import { ListResponse, Product } from "@/types";
import { toast } from "sonner";

interface ProductCategory {
  id: string;
  name: string;
  externalCode?: string;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export default function ProductsPage() {
  const { can } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [search, setSearch] = useState("");
  const [available, setAvailable] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const response = await httpClient.get<ListResponse<Product>>("/products", {
          search,
          available: available || undefined,
          categoryId: categoryId || undefined,
          page: targetPage,
          limit,
        });
        setProducts(response.items);
        setTotal(response.total);
        setPage(response.page);
        setTotalPages(response.totalPages);
      } catch {
        toast.error("No se pudo cargar el catalogo. Verifica que el backend este corriendo.");
      } finally {
        setLoading(false);
      }
    },
    [available, categoryId, limit, search]
  );

  useEffect(() => {
    httpClient.get<ProductCategory[]>("/products/categories").then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  function applyFilters() {
    if (page === 1) {
      load(1);
      return;
    }
    setPage(1);
  }

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
  }

  function handleLimitChange(nextLimit: number) {
    setLimit(nextLimit);
    setPage(1);
  }

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setOpen(true);
  }

  async function openProductDetail(product: Product) {
    setDetailOpen(true);
    setDetailLoading(true);
    setSelectedProduct(product);
    try {
      const fullProduct = await httpClient.get<Product>(`/products/${product.id}`);
      setSelectedProduct(fullProduct);
    } catch {
      toast.error("No se pudo cargar la ficha del producto");
      setDetailOpen(false);
      setSelectedProduct(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeProductDetail() {
    setDetailOpen(false);
    setSelectedProduct(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const presentacion = String(form.get("presentacion") || "").trim();
    const productGroupKey = String(form.get("productGroupKey") || "").trim();
    const unitType = String(form.get("unitType") || "").trim();
    const unitsPerPackageRaw = String(form.get("unitsPerPackage") || "").trim();
    const variants: Record<string, string> = {};
    if (presentacion) variants.presentacion = presentacion;
    if (productGroupKey) variants.productGroupKey = productGroupKey;

    const payload = {
      name: String(form.get("name")),
      sku: String(form.get("sku") || ""),
      unit: String(form.get("unit") || "pieza"),
      unitType: unitType || null,
      unitsPerPackage: unitsPerPackageRaw ? Number(unitsPerPackageRaw) : null,
      price: Number(form.get("price")),
      wholesalePrice: Number(form.get("wholesalePrice") || 0),
      cost: Number(form.get("cost") || 0),
      stock: Number(form.get("stock") || 0),
      minStock: Number(form.get("minStock") || 0),
      description: String(form.get("description") || ""),
      categoryId: String(form.get("categoryId") || "") || null,
      isAvailable: String(form.get("isAvailable") || "true") === "true",
      variants,
    };
    try {
      if (editing) {
        await httpClient.put(`/products/${editing.id}`, payload);
        toast.success("Producto actualizado con éxito");
      } else {
        await httpClient.post("/products", payload);
        toast.success("Producto creado con éxito");
      }
      setOpen(false);
      await load(page);
    } catch {
      toast.error("Error al guardar el producto");
    }
  }

  async function remove(product: Product) {
    try {
      await httpClient.delete(`/products/${product.id}`);
      toast.success(`Producto ${product.name} eliminado con éxito`);
      const nextPage = products.length === 1 && page > 1 ? page - 1 : page;
      if (nextPage !== page) {
        setPage(nextPage);
      } else {
        await load(page);
      }
    } catch {
      toast.error("Error al eliminar el producto");
    }
  }

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div>
          <h1 className="page-title">Catalogo</h1>
          <p className="page-kicker">Control de productos, precios, unidades y disponibilidad para ventas.</p>
        </div>
        {can("products", "create") ? (
          <Button variant="contained" onClick={openCreate}>Nuevo producto</Button>
        ) : null}
      </div>
      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2>Inventario visible</h2>
            <p className="page-kicker">Productos listos para cotizacion y pedidos.</p>
          </div>
          <span className="pill">{total.toLocaleString("es-MX")} productos</span>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_190px_190px_auto]">
          <input className="input" placeholder="Buscar producto o SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas las categorias</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <select className="input" value={available} onChange={(e) => setAvailable(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="true">Disponible</option>
            <option value="false">Inactivo</option>
          </select>
          <Button variant="outlined" onClick={applyFilters} disabled={loading}>
            {loading ? "Cargando..." : "Filtrar"}
          </Button>
        </div>
        <DataTable
          rows={products}
          getKey={(row) => row.id}
          getDeleteLabel={(row) => row.name}
          onRowClick={openProductDetail}
          onEdit={can("products", "update") ? openEdit : undefined}
          onDelete={can("products", "delete") ? remove : undefined}
          columns={[
            { key: "name", label: "Producto" },
            { key: "category", label: "Categoria", render: (r) => r.category?.name || "—" },
            { key: "unit", label: "Unidad" },
            { key: "price", label: "Menudeo", render: (r) => `$${Number(r.price).toFixed(2)}` },
            {
              key: "wholesalePrice",
              label: "Mayoreo",
              render: (r) => (r.wholesalePrice ? `$${Number(r.wholesalePrice).toFixed(2)}` : "—"),
            },
            { key: "stock", label: "Stock" },
            { key: "isAvailable", label: "Estado", render: (r) => <span className="pill">{r.isAvailable ? "Disponible" : "Inactivo"}</span> },
          ]}
        />
        <ListPagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
          limitOptions={PAGE_SIZE_OPTIONS}
        />
      </section>

      <ProductDetailDialog
        open={detailOpen}
        product={selectedProduct}
        loading={detailLoading}
        onClose={closeProductDetail}
        onEdit={openEdit}
      />

      <ProductFormDialog
        open={open}
        editing={editing}
        categories={categories}
        onClose={() => setOpen(false)}
        onSubmit={save}
      />
    </div>
  );
}
