"use client";

import { FormEvent } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";
import { PRODUCT_UNITS } from "@glamouroso/shared";
import { Product } from "@/types";

interface ProductCategory {
  id: string;
  name: string;
}

interface ProductFormDialogProps {
  open: boolean;
  editing: Product | null;
  categories: ProductCategory[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}

export function ProductFormDialog({ open, editing, categories, onClose, onSubmit }: ProductFormDialogProps) {
  const presentation = editing?.variants?.presentacion;
  const productGroupKey = editing?.variants?.productGroupKey;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" key={editing?.id ?? "new"}>
      <form onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 700, color: "var(--glam-navy)" }}>
          {editing ? "Editar producto" : "Nuevo producto"}
        </DialogTitle>
        <DialogContent className="form-grid" dividers sx={{ pt: 2 }}>
          <p className="form-section-title">Informacion general</p>
          <TextField name="name" label="Nombre del producto" defaultValue={editing?.name || ""} fullWidth required />
          <TextField name="sku" label="SKU" defaultValue={editing?.sku || ""} fullWidth />
          <TextField select name="categoryId" label="Categoria" defaultValue={editing?.category?.id || ""} fullWidth>
            <MenuItem value="">Sin categoria</MenuItem>
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
            ))}
          </TextField>
          <TextField select name="isAvailable" label="Estado" defaultValue={String(editing?.isAvailable ?? true)} fullWidth>
            <MenuItem value="true">Disponible</MenuItem>
            <MenuItem value="false">Inactivo</MenuItem>
          </TextField>
          <TextField
            name="description"
            label="Descripcion"
            defaultValue={editing?.description || ""}
            fullWidth
            multiline
            minRows={3}
            sx={{ gridColumn: "1 / -1" }}
          />

          <p className="form-section-title">Precios</p>
          <TextField name="price" label="Precio menudeo" type="number" inputProps={{ min: 0, step: "0.01" }} defaultValue={editing?.price ?? ""} fullWidth required />
          <TextField name="wholesalePrice" label="Precio mayoreo" type="number" inputProps={{ min: 0, step: "0.01" }} defaultValue={editing?.wholesalePrice ?? ""} fullWidth />
          <TextField name="cost" label="Costo" type="number" inputProps={{ min: 0, step: "0.01" }} defaultValue={editing?.cost ?? 0} fullWidth />

          <p className="form-section-title">Inventario y unidad</p>
          <TextField select name="unit" label="Unidad de venta" defaultValue={editing?.unit || "pieza"} fullWidth>
            {PRODUCT_UNITS.map((unit) => (
              <MenuItem key={unit} value={unit}>{unit}</MenuItem>
            ))}
          </TextField>
          <TextField name="stock" label="Stock actual" type="number" inputProps={{ min: 0, step: "0.01" }} defaultValue={editing?.stock ?? 0} fullWidth />
          <TextField name="minStock" label="Stock minimo" type="number" inputProps={{ min: 0, step: "0.01" }} defaultValue={editing?.minStock ?? 0} fullWidth />

          <p className="form-section-title">Empaque y presentacion</p>
          <TextField name="unitType" label="Tipo de empaque" placeholder="Ej. caja, botella" defaultValue={editing?.unitType || ""} fullWidth />
          <TextField
            name="unitsPerPackage"
            label="Unidades por empaque"
            type="number"
            inputProps={{ min: 1, step: 1 }}
            defaultValue={editing?.unitsPerPackage ?? ""}
            fullWidth
          />
          <TextField name="presentacion" label="Presentacion" placeholder="Ej. 1L, 5L, 400ml" defaultValue={presentation ? String(presentation) : ""} fullWidth />
          <TextField
            name="productGroupKey"
            label="Linea de producto"
            placeholder="Ej. MAX COLOR"
            defaultValue={productGroupKey ? String(productGroupKey) : ""}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained">Guardar</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
