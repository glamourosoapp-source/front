# Front — Dashboard del CRM Glamouroso

Next.js (App Router) + React + TypeScript + MUI + Zustand. Habla con el Back (`localhost:3002/api`) y corre en `localhost:3000`. Mapa general: [../AGENTS.md](../AGENTS.md), reglas de frontend: [../docs/FRONTEND.md](../docs/FRONTEND.md).

## Comandos

```bash
bun run dev      # next dev --turbopack en :3000
bun run build    # build de producción — ver PELIGRO abajo
bun run lint
cd shared && bunx tsc --noEmit
```

## PELIGRO: build vs dev server

**No correr `bun run build` mientras el dev server está activo**: comparten `.next` y el build de producción deja el dev server tirando 500 hasta regenerar `.next`. Verificar antes con `lsof -iTCP:3000 -sTCP:LISTEN`; si está corriendo, avisar o usar un worktree.

## Reglas

- `shared/` es copia duplicada del contrato con `Back/shared/`. **Mantener ambas en sync** en el mismo cambio.
- Permisos en UI: `usePermissions()` (`src/lib/permissions.ts`); el sidebar filtra por módulo y los botones se gatean por acción. Rol admin = bypass.
- Fechas DATEONLY (`YYYY-MM-DD`): nunca `new Date("YYYY-MM-DD")` para mostrar (corre el día por timezone) — usar `src/lib/format-date-only.ts`.
- Etiqueta "Creado por" en pedidos: `orderCreatorLabel` en `src/constants/orders.ts` (`source='whatsapp'` → "Agente IA").
- Impresión: clases `.print-only` + `@media print` en `globals.css`; exports Excel/PDF paginan de a 200. La hoja imprimible **debe montarse por portal como hijo directo de `<body>`** (ver `OrderPrintSheet`): el `@media print` saca del flujo todo lo demás con `body > *:not(.print-only) { display: none }`; si se anida en el layout, el alto del dashboard vuelve a generar una página en blanco. Para varias notas de golpe está `OrdersPrintSheets` (un solo `.print-only` con una nota por hijo y `breakAfter: page` salvo la última), que usa el botón "Imprimir pedidos" del listado (permiso `orderPrint`).
- **Vista previa de la nota**: `OrderNotePreviewDialog` monta el MISMO `OrderNote` en pantalla (hoja carta de 816px escalada con `transform` para caber en el diálogo) y lo baja como PNG con `src/lib/node-to-image.ts` (DOM → `<foreignObject>` → canvas, sin dependencias). **No llama a `POST /orders/print`**: no marca `printedAt` ni pinta la fila. Dos cuidados: la captura funciona porque la nota usa solo estilos inline (con clases de CSS habría que inlinear los computados antes de serializar), y las medidas se toman con callback refs, no con `useEffect`, porque el `Dialog` de MUI monta su contenido después del primer commit.
- **Impresión de notas**: imprimir (listado o detalle) pasa por `POST /orders/print`, que marca `printedAt`/`printedBy` **solo la primera vez**; el listado pinta esas filas de azul (`isRowHighlighted` de `DataTable`) y el detalle cambia el botón a "Reimprimir". Reimprimir está permitido para cualquiera con el permiso `orderPrint`: la marca azul indica "esta nota ya salió alguna vez", con la fecha y el usuario de la primera impresión.
- **`node_modules/@glamouroso/shared` es una COPIA, no un symlink**: tras tocar `shared/src` hay que correr `bun install` en `Front/` (y en `Back/`) o el cambio no llega ni al dev server ni al build.
