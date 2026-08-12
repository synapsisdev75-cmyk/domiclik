# Deploy paso a paso — Landing en Vercel

La URL `pedir.domiclik.vercel.app` **no existe sola**. Vercel te da algo como:

`https://domiclik-pedir.vercel.app`

(o el nombre que elijas al crear el proyecto).  
`pedir.tudominio.com` solo funciona si compras/conectas tu propio dominio.

---

## Antes de empezar

Necesitas:

1. Cuenta en [vercel.com](https://vercel.com) (login con GitHub: `synapsisdev75-cmyk`).
2. El repo ya en GitHub: https://github.com/synapsisdev75-cmyk/domiclik
3. (Recomendado) La **API** en otro host (Railway/Render). Sin API, la web abre pero **no crea pedidos**.

Local sigue siendo:

- Landing: http://localhost:5174  
- API: http://localhost:8787  

---

## Parte A — Publicar la landing (clientes)

### 1. Entrar a Vercel

1. Abre https://vercel.com/new  
2. **Import** el repo `synapsisdev75-cmyk/domiclik`  
3. Si pide permisos de GitHub, acéptalos.

### 2. Configurar el proyecto

| Campo | Valor |
|--------|--------|
| **Project Name** | `domiclik-pedir` (o el que quieras) |
| **Root Directory** | `client-web` ← **Importante** (botón *Edit*) |
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### 3. Variables de entorno (Environment Variables)

Añade estas (Production + Preview):

```env
VITE_DOMICLICK_API_URL=https://TU-API-AQUI.up.railway.app
VITE_DOMICLICK_INGEST_TOKEN=EL-MISMO-TOKEN-SECRETO-DE-LA-API
VITE_DOMICLICK_SITE_ID=clientes-landing
VITE_DOMICLICK_WHATSAPP=57XXXXXXXXXX
VITE_DOMICLICK_PHONE=+57XXXXXXXXXX
```

Notas:

- Si **aún no** tienes API en la nube, deja temporalmente `VITE_DOMICLICK_API_URL=http://localhost:8787` solo para ver el diseño; el formulario **no funcionará** desde internet hacia tu PC.
- El token debe coincidir con `DOMICLICK_INGEST_TOKEN` del servidor.

### 4. Deploy

Pulsa **Deploy**. Espera 1–2 minutos.

Al terminar verás:

`https://domiclik-pedir.vercel.app`  
(ese es tu “pedir” real en Vercel)

### 5. Firebase Auth (si usas Google)

Consola Firebase → Authentication → Settings → **Authorized domains** → agrega:

- `domiclik-pedir.vercel.app`  
- (y más adelante) `pedir.tudominio.com`

---

## Parte B — Publicar la API (obligatoria para pedidos)

La API es Node (`server/index.ts`). Vercel no es lo ideal para ese Express; usa **Railway** o **Render**.

### Opción rápida: Railway

1. https://railway.app → New Project → Deploy from GitHub → repo `domiclik`  
2. Settings → **Start Command**: `npx tsx server/index.ts`  
3. Variables (mismas Firebase que tu `.env` local +):

```env
DOMICLICK_API_PORT=8787
PORT=8787
DOMICLICK_INGEST_TOKEN=EL-MISMO-TOKEN-SECRETO
DOMICLICK_AUTHORIZED_SITES=clientes-landing,ventas-local
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_FIRESTORE_DATABASE_ID=...
```

4. Genera dominio público (ej. `domiclik-api.up.railway.app`).  
5. Prueba: `https://TU-API/api/v1/health` → debe devolver `ok`.  
6. Vuelve a Vercel → Environment Variables → actualiza:

`VITE_DOMICLICK_API_URL=https://TU-API...`

7. En Vercel: **Redeploy** (las `VITE_*` se incrustan en el build).

---

## Parte C — (Opcional) Central ops en otro proyecto Vercel

| Campo | Valor |
|--------|--------|
| Root Directory | `.` (raíz del monorepo) |
| Build | `npm run build` |
| Output | `dist` |
| Name | `domiclik-ops` |

Variables: todas las `VITE_FIREBASE_*` + Maps del `.env`.

URL típica: `https://domiclik-ops.vercel.app`

---

## Parte D — Dominio bonito (cuando tengas dominio propio)

Ejemplo: compraste `domiclik.co`

1. En Vercel → proyecto pedir → **Domains** → agrega `pedir.domiclik.co`  
2. En tu DNS (Cloudflare/GoDaddy): CNAME `pedir` → `cname.vercel-dns.com`  
3. Espera propagación HTTPS.

Eso **sí** da `https://pedir.domiclik.co`  
(no `pedir.domiclik.vercel.app`, que Vercel no crea así).

---

## Checklist de prueba

1. `https://TU-API/api/v1/health` → ok  
2. `https://domiclik-pedir.vercel.app` → hero + formulario  
3. Crear pedido de prueba → aparece en Central  
4. `/seguimiento/DMC-xxxx` → estado + PIN  
5. Asistente chat abre y escribe  

---

## Errores comunes

| Síntoma | Causa |
|---------|--------|
| `ERR_CONNECTION_CLOSED` en `pedir.domiclik.vercel.app` | Ese host no existe; usa la URL que Vercel te dio |
| Página blanca / 404 al refrescar `/seguimiento/...` | Falta `client-web/vercel.json` (ya está en el repo) |
| Formulario falla / CORS | API no desplegada o `VITE_DOMICLICK_API_URL` mal |
| `unauthorized-domain` en Google | Falta el dominio en Firebase Authorized domains |
| Token inválido | Token distinto entre Vercel y API |

---

## Resumen en una frase

Importa el repo en Vercel con **Root = `client-web`**, configura las `VITE_*`, despliega, y apunta `VITE_DOMICLICK_API_URL` a tu API en Railway/Render. La URL real será `*.vercel.app`, no `pedir.domiclik.vercel.app`.
