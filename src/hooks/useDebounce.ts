import { useEffect, useState } from "react";

/**
 * Devuelve una copia del valor que solo se actualiza tras `delay` ms sin cambios.
 * Útil para filtros de texto que disparan peticiones HTTP.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
