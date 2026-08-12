# DomiClick — Landing de clientes

App Vite + React para solicitar entregas y consultar seguimiento.
**No** forma parte del circuito cerrado Admin/Transportista.

## Arranque

```bash
# Desde la raíz del monorepo — Tubo API
npm run server

# Landing clientes
cd client-web
cp .env.example .env
npm install
npm run dev
```

Abre [http://localhost:5174](http://localhost:5174).

## Variables

| Variable | Descripción |
|----------|-------------|
| `VITE_DOMICLICK_API_URL` | Base del tubo (default `http://localhost:8787`) |
| `VITE_DOMICLICK_INGEST_TOKEN` | Bearer token (mismo que `DOMICLICK_INGEST_TOKEN`) |
| `VITE_DOMICLICK_SITE_ID` | Debe ser `clientes-landing` y estar en `DOMICLICK_AUTHORIZED_SITES` |
| `VITE_DOMICLICK_WHATSAPP` | Número WhatsApp Central |
| `VITE_DOMICLICK_PHONE` | Teléfono Central |

En el `.env.local` de la raíz, incluye `clientes-landing` en sitios autorizados:

```
DOMICLICK_AUTHORIZED_SITES=ventas-local,clientes-landing
```

## Rutas

| Ruta | Contenido |
|------|-----------|
| `/` | Hero DomiClick + formulario de solicitud |
| `/seguimiento` | Buscar por código |
| `/seguimiento/:code` | Estado público del pedido |

## Google Auth + calificaciones

La landing usa el mismo proyecto Firebase que DomiClick:

1. Authentication → proveedor **Google** activo
2. Authorized domains: `localhost` (y tu dominio de producción)
3. El cliente inicia sesión con Google; nombre/email rellenan el formulario
4. Tras una entrega (`delivered`), en `/seguimiento/:code` puede calificar 1–5★

Perfiles se guardan en Firestore `customers/{uid}`. Reseñas en `driver_reviews`.
