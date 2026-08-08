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
- Impresión: clases `.print-only` + `@media print` en `globals.css`; exports Excel/PDF paginan de a 200.
