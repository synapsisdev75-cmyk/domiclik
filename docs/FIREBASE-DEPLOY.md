# Deploy DomiClick en Firebase Hosting

Proyecto Firebase: **gen-lang-client-0954482957** (DomiClik)

## Mapa de sitios

| Sitio Firebase | URL | App |
|----------------|-----|-----|
| `domiclick-96bd8` | `domiclick.com` / `www.domiclick.com` | Landing clientes (`client-web/`) |
| `gen-lang-client-0954482957` | `ops.domiclick.com` (subdominio) | Central ops (`/` raíz) |

---

## 1. DNS en Hostinger (domiclick.com)

En Firebase → Hosting → `domiclick.com` → **Administrar dominio** copia los registros exactos que pide Firebase.

**Corrección importante:** tu `www` apunta bien a `domiclick-96bd8.web.app`. Para el dominio raíz `@` Firebase suele pedir **registros A** (IPv4), no solo AAAA:

| Host | Tipo | Valor |
|------|------|-------|
| `@` | A | *(IPs que muestra Firebase — suele ser 199.36.158.x)* |
| `@` | TXT | `hosting-site=gen-lang-client-0954482957` *(ya lo tienes)* |
| `www` | CNAME | `domiclick-96bd8.web.app` *(ya lo tienes)* |
| `ops` | CNAME | `gen-lang-client-0954482957.web.app` |

Espera 5–30 min y verifica que el certificado SSL pase de "Certificado de creación" a **Conectado**.

---

## 2. Firebase Auth — dominios autorizados

Authentication → Settings → **Authorized domains**, agrega:

- `domiclick.com`
- `www.domiclick.com`
- `ops.domiclick.com`
- `localhost`

---

## 3. Google Cloud OAuth

Client ID: `712322107034-sf5vmu7ml9ct8g34uavef428ij16jln7.apps.googleusercontent.com`

**Orígenes de JavaScript autorizados:**

- `https://domiclick.com`
- `https://www.domiclick.com`
- `https://ops.domiclick.com`
- `http://localhost:3000`

**URIs de redirección autorizados:**

- `https://domiclick.com`
- `https://www.domiclick.com`
- `https://ops.domiclick.com`
- `http://localhost:3000/`

---

## 4. Variables de entorno (local `.env`, no subir a Git)

```env
GOOGLE_OAUTH_CLIENT_SECRET=tu-secreto-de-google-cloud
VITE_FIREBASE_OAUTH_CLIENT_ID=712322107034-sf5vmu7ml9ct8g34uavef428ij16jln7.apps.googleusercontent.com
VITE_GOOGLE_MAPS_PLATFORM_KEY=...
VITE_DOMICLICK_API_URL=https://api.domiclick.com
DOMICLICK_INGEST_TOKEN=...
```

Para producción, configura el secreto OAuth en Firebase Functions:

```bash
npx firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET --project gen-lang-client-0954482957
```

---

## 5. Deploy (primera vez)

Inicia sesión con la cuenta Google que **es dueña del proyecto DomiClik**:

```bash
npx firebase login
npx firebase use gen-lang-client-0954482957
npx firebase target:apply hosting landing domiclick-96bd8
npx firebase target:apply hosting ops gen-lang-client-0954482957
```

Build + deploy:

```bash
npm run deploy:firebase
```

Solo hosting (sin functions):

```bash
npm run deploy:hosting
```

---

## 6. Subdominio ops en Firebase

1. Hosting → sitio `gen-lang-client-0954482957` → **Agregar dominio personalizado** → `ops.domiclick.com`
2. En Hostinger: CNAME `ops` → `gen-lang-client-0954482957.web.app`
3. Deploy ops: `npm run build && npx firebase deploy --only hosting:ops`

---

## 7. API (tubo de pedidos)

Firebase Hosting sirve frontends estáticos. La API Express (`server/`) va en **Railway, Render o Cloud Run**:

- URL sugerida: `https://api.domiclick.com`
- Variable en landing: `VITE_DOMICLICK_API_URL=https://api.domiclick.com`
