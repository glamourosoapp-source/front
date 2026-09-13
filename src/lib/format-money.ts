/**
 * Formato de moneda del panel: `$1,234.50`.
 *
 * Punto único: antes vivía duplicado en el Overview, el diálogo de top
 * productos y las dos gráficas del dashboard, cada uno con su propia variante.
 */
export function formatMoney(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  return `$${safe.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Igual que `formatMoney` pero sin decimales, para ejes y totales grandes. */
export function formatMoneyShort(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  return `$${safe.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

/**
 * Cantidades del POS: litros con hasta dos decimales y piezas sin decimales,
 * sin ceros de relleno ("2.5 L", "3 pz", "0.75 L").
 */
export function formatQuantity(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}
