# Deploy DomiClick — dominios y checklist

No hace falta comprar un segundo dominio. Con **un dominio** y **subdominios** alcanza.

> **Guía Vercel paso a paso (landing):** ver [`DEPLOY-VERCEL.md`](./DEPLOY-VERCEL.md).  
> La URL `pedir.domiclik.vercel.app` no existe hasta que crees el proyecto; Vercel da `https://nombre-proyecto.vercel.app`.

Sustituye `tudominio.com` por el tuyo (ej. `domiclick.co`).

---

## Mapa de URLs (producción)

| Pieza | URL recomendada | Qué es |
|-------|-----------------|--------|
| **Landing clientes** | `https://www.tudominio.com` o `https://pedir.tudominio.com` | Pedir entrega + seguimiento |
| **Central (Admin / Transportista)** | `https://ops.tudominio.com` | Circuito cerrado |
| **API Tubo** | `https://api.tudominio.com` | Ingest pedidos + tracking público |

### Rutas del cliente (landing)

| Ruta | Ejemplo |
|------|---------|
| Inicio / solicitar | `https://pedir.tudominio.com/` |
| Buscar seguimiento | `https://pedir.tudominio.com/seguimiento` |
| Estado del pedido | `https://pedir.tudominio.com/seguimiento/DMC-4521` |

### Ruta operativa (central)

| Ruta | Ejemplo |
|------|---------|
| Login / panel | `https://ops.tudominio.com/` |
| Radar segunda pantalla | `https://ops.tudominio.com/?view=map-wall` |

---

## Checklist DNS

En tu proveedor de dominio (GoDaddy, Namecheap, Cloudflare, etc.):

1. `pedir` → CNAME al host de la landing (Vercel/Netlify/…).
2. `ops` → CNAME al host del panel DomiClick.
3. `api` → CNAME / A al host donde corre `npm run server` (Railway, Render, Fly, VPS, Azure…).
4. (Opcional) `www` → misma landing que `pedir`, o redirige `www` → `pedir`.

Espera propagación DNS (minutos a unas horas) y activa HTTPS (casi todos los hosts lo dan gratis).

---

## Checklist Firebase

Consola → proyecto **DomiClik** → Authentication → Settings → **Authorized domains**. Agrega:

- `localhost`
- `pedir.tudominio.com`
- `ops.tudominio.com`
- `www.tudominio.com` (si lo usas)

Authentication → Sign-in method → **Google** y **Email/Password** activos.

---

## Checklist variables de entorno

### A) API (`api.tudominio.com`) — proceso del monorepo, proceso `server`

```env
DOMICLICK_API_PORT=8787
DOMICLICK_INGEST_TOKEN=GENERA-UN-TOKEN-LARGO-Y-SECRETO
DOMICLICK_AUTHORIZED_SITES=clientes-landing,ventas-local

# Firebase (mismas VITE_FIREBASE_* del .env o el JSON del proyecto)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=gen-lang-client-0954482957.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=gen-lang-client-0954482957
VITE_FIREBASE_STORAGE_BUCKET=gen-lang-client-0954482957.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=712322107034
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_FIRESTORE_DATABASE_ID=ai-studio-domiclick-84da0121-61e4-47a2-8b6c-8091bdbe34ff
```

Arranque: `npm run server` (o el comando de start de tu host).

### B) Landing (`pedir.tudominio.com`) — carpeta `client-web/`

```env
VITE_DOMICLICK_API_URL=https://api.tudominio.com
VITE_DOMICLICK_INGEST_TOKEN=EL-MISMO-TOKEN-DE-LA-API
VITE_DOMICLICK_SITE_ID=clientes-landing
VITE_DOMICLICK_WHATSAPP=57XXXXXXXXXX
VITE_DOMICLICK_PHONE=+57XXXXXXXXXX
```

Build: `cd client-web && npm run build` → publicar carpeta `dist/`.

### C) Central (`ops.tudominio.com`) — raíz del monorepo

```env
APP_URL=https://ops.tudominio.com
VITE_DOMICLICK_API_URL=https://api.tudominio.com
# + todas las VITE_FIREBASE_* y Maps
VITE_GOOGLE_MAPS_PLATFORM_KEY=...
GOOGLE_MAPS_PLATFORM_KEY=...
VITE_GOOGLE_MAPS_MAP_ID=7959bb6afa37dd5e9db669a8
DOMICLICK_INGEST_TOKEN=EL-MISMO-TOKEN
DOMICLICK_AUTHORIZED_SITES=clientes-landing,ventas-local
```

Build: `npm run build` → publicar carpeta `dist/`.

---

## Checklist hosts sugeridos (barato / simple)

| Pieza | Host típico |
|-------|-------------|
| Landing + Central (front estático) | Vercel, Netlify o Cloudflare Pages (2 proyectos) |
| API Tubo (Node/Express) | Railway, Render, Fly.io o un VPS |

En Vercel/Netlify: un proyecto apunta a raíz (`vite build`), otro a `client-web` (`npm run build` en esa carpeta).

---

## Prueba final (en orden)

1. `https://api.tudominio.com/api/v1/health` → responde `ok: true`.
2. `https://pedir.tudominio.com/` → abre hero + formulario.
3. Crear un pedido de prueba → aparece en `https://ops.tudominio.com/` (Solicitudes).
4. Con código `DMC-xxxx` → `https://pedir.tudominio.com/seguimiento/DMC-xxxx`.
5. Login Google en landing y en ops (sin `unauthorized-domain`).
6. Transportista en móvil: GPS vivo + pestaña Asistencia (huella/Face ID).

---

## Local (recordatorio)

```bash
npm run server      # API  :8787
npm run dev         # Ops   :3000
npm run dev:client  # Landing :5174
```

- Cliente: http://localhost:5174  
- Central: http://localhost:3000  
- API: http://localhost:8787  

---

## ¿Cuándo sí comprar otro dominio?

Solo si quieres marca 100 % separada (ej. landing `domiclick.co` y central en otro).  
Para la mayoría: **un dominio + `pedir` / `ops` / `api` es suficiente**.
