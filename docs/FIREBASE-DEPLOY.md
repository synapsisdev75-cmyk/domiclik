# Deploy DomiClick en Firebase Hosting

Proyecto Firebase: **gen-lang-client-0954482957** (DomiClik)

Hay **dos sitios**. Un dominio solo sirve la app del sitio al que está conectado.

| Sitio Firebase | App | URLs |
|----------------|-----|------|
| `gen-lang-client-0954482957` | Landing clientes (`client-web/`) | `https://gen-lang-client-0954482957.web.app` · `domiclick.com` · `www.domiclick.com` |
| `domiclick-ops` | Torre / central (`/` raíz) | `https://domiclick-ops.web.app` · `ops.domiclick.com` |

Si `ops.domiclick.com` está en el sitio de landing, **siempre** verás clientes-landing. Hay que quitarlo de ahí y conectarlo a `domiclick-ops`.

---

## 1. Conectar `ops.domiclick.com` (obligatorio)

1. Firebase → Hosting → sitio **`gen-lang-client-0954482957`** → Dominios → **eliminar** `ops.domiclick.com`.
2. En el mismo Hosting, cambia el dropdown al sitio **`domiclick-ops`**.
3. **Agregar dominio personalizado** → `ops.domiclick.com`.
4. En Hostinger, CNAME:

| Host | Tipo | Valor |
|------|------|-------|
| `ops` | CNAME | `domiclick-ops.web.app` |

No uses `gen-lang-client-0954482957.web.app` para `ops`. Eso es el landing.

Prueba inmediata (sin esperar DNS): https://domiclick-ops.web.app

---

## 2. DNS landing (`domiclick.com`)

| Host | Tipo | Valor |
|------|------|-------|
| `@` | A | IPs que muestra Firebase en el sitio landing |
| `www` | CNAME | `gen-lang-client-0954482957.web.app` |

---

## 3. Firebase Auth — dominios autorizados

- `domiclick.com`
- `www.domiclick.com`
- `ops.domiclick.com`
- `domiclick-ops.web.app`
- `gen-lang-client-0954482957.web.app`
- `localhost`

## 4. Google Cloud OAuth — orígenes JS

- `https://domiclick.com`
- `https://www.domiclick.com`
- `https://ops.domiclick.com`
- `https://domiclick-ops.web.app`
- `https://gen-lang-client-0954482957.web.app`
- `http://localhost:5174`
- `http://localhost:3000`

URIs de redirección: cada origen + `/__/auth/handler`.

---

## 5. Deploy

```bash
npx firebase use gen-lang-client-0954482957
npm run build:all
npx firebase deploy --only hosting
```

Solo landing: `npx firebase deploy --only hosting:landing`  
Solo torre: `npx firebase deploy --only hosting:ops`
