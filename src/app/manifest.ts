import type { MetadataRoute } from "next";

/**
 * PWA del punto de venta: se instala en la PC de la sucursal y la caja queda
 * como una app del escritorio, con la G de Glamouroso, sin barra de direcciones
 * ni pestañas que distraigan al cajero.
 *
 * Tres cosas que son requisito y no adorno:
 *
 * - **Iconos PNG con `sizes` real.** Chrome no instala con solo SVG, y si el
 *   `sizes` declarado no coincide con el archivo descarta el icono. Se generan
 *   desde `src/app/icon.svg` con `bun run icons:pos`.
 * - **Sin `scope` propio.** Dejarlo en `/pos` sacaría `/login` de la app: al
 *   caducar el token la caja navega ahí y Chrome lo abriría en una pestaña
 *   aparte. El scope se queda en la raíz.
 * - **`standalone` pelado, sin `window-controls-overlay`.** Recuperaría los
 *   ~32 px de la barra de título, pero entonces el contenido sube hasta el
 *   borde y la barra superior de la caja quedaría debajo de los botones de
 *   cerrar y minimizar: habría que maquetarla con `env(titlebar-area-*)`. No
 *   vale 32 px de alto a cambio de ese riesgo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/pos",
    name: "Glamouroso · Punto de venta",
    short_name: "Glamouroso POS",
    description:
      "Caja del punto de venta de Glamouroso: cobro en efectivo, venta por litro y ticket térmico.",
    start_url: "/pos",
    display: "standalone",
    orientation: "landscape",
    background_color: "#262d60",
    theme_color: "#262d60",
    categories: ["business", "productivity"],
    lang: "es-MX",
    dir: "ltr",
    icons: [
      { src: "/icons/pos-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/pos-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/pos-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/pos-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Clic derecho en el icono del escritorio o de la barra de tareas.
    shortcuts: [
      {
        name: "Abrir la caja",
        short_name: "Caja",
        url: "/pos",
        icons: [{ src: "/icons/pos-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Impresión de tickets",
        short_name: "Impresión",
        url: "/pos/configuracion",
        icons: [{ src: "/icons/pos-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
