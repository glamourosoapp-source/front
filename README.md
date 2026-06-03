# Glamouroso Dashboard (Front)

Next.js 15. Incluye el contrato compartido en `shared/` (duplicado también en el repo Back; mantener ambos alineados).

## Desarrollo local

```bash
bun install
bun run dev
```

## Verificación

```bash
bun run build
cd shared && bunx tsc --noEmit
```

## Despliegue (Vercel u otro)

- Root del proyecto: esta carpeta (`Front/`).
- Variable requerida: `NEXT_PUBLIC_API_BASE_URL` (URL pública del Back, con sufijo `/api`).
