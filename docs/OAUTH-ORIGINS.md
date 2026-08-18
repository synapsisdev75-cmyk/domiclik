# Google OAuth — corregir `origin_mismatch`

Si al iniciar sesión aparece **Error 400: origin_mismatch**, falta registrar el dominio desde el que abren la app.

## Client ID OAuth (Web)

`712322107034-sf5vmu7ml9ct8g34uavef428ij16jln7.apps.googleusercontent.com`

Abre: [Google Cloud Console → Credenciales](https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0954482957)

Edita el **Client ID OAuth 2.0 (Aplicación web)** y agrega **todos** estos orígenes:

### Orígenes de JavaScript autorizados

```
https://domiclick.com
https://www.domiclick.com
https://gen-lang-client-0954482957.web.app
https://gen-lang-client-0954482957.firebaseapp.com
http://localhost:5174
http://localhost:3000
http://127.0.0.1:5174
```

### URIs de redirección autorizados

```
https://gen-lang-client-0954482957.firebaseapp.com/__/auth/handler
https://domiclick.com/__/auth/handler
https://www.domiclick.com/__/auth/handler
http://localhost:5174/__/auth/handler
http://localhost:3000/__/auth/handler
```

Guarda y espera **2–5 minutos** antes de probar de nuevo.

## Firebase Auth — dominios autorizados

Firebase Console → Authentication → Settings → **Authorized domains**:

- `domiclick.com`
- `www.domiclick.com`
- `gen-lang-client-0954482957.web.app`
- `gen-lang-client-0954482957.firebaseapp.com`
- `localhost`

## Cómo probar

1. Abre la URL exacta que usarán los testers (ej. `https://domiclick.com` o `https://gen-lang-client-0954482957.web.app`).
2. Toca **Iniciar sesión con Google**.
3. En móvil el flujo redirige a Google y vuelve solo (no popup).

Si el error persiste, copia la URL del navegador (sin rutas largas) y confirma que ese origen está en la lista de arriba.
