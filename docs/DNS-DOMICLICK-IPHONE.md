# Arreglar domiclick.com en iPhone (Safari)

## El error que ves

> **Safari no puede abrir la página porque no encuentra el servidor.**

Eso aparece al abrir **`domiclick.com`** desde WhatsApp. **No es un bug del código** ni del deploy de Firebase: el iPhone **no encuentra el servidor** porque el DNS del dominio está mal configurado.

---

## Diagnóstico (agosto 2026)

| Dominio | Problema |
|---------|----------|
| `domiclick.com` | Solo IPv6, **sin registro A (IPv4)** → falla en iPhone con 4G |
| `www.domiclick.com` | Apunta a sitio viejo `domiclick-96bd8.web.app` |
| `ops.domiclick.com` | Apunta a sitio viejo `domiclick-96bd8.web.app` |
| `domiclick-ops.web.app` | ✅ Funciona siempre |
| `gen-lang-client-0954482957.web.app` | ✅ Funciona siempre |

---

## Solución inmediata (sin tocar DNS)

**Deja de compartir `domiclick.com` en WhatsApp.** Usa estos enlaces:

| Para qué | Enlace |
|----------|--------|
| **Torre / admin / motorizados** | `https://domiclick-ops.web.app` |
| **Monitor radar (pantalla secundaria)** | `https://domiclick-ops.web.app/?view=map-wall` |
| **Clientes (pedidos)** | `https://gen-lang-client-0954482957.web.app` |

Prueba en el iPhone: si `domiclick-ops.web.app` abre bien, confirma que el problema es solo DNS de `domiclick.com`.

---

## Arreglo permanente en Hostinger

Entra a **Hostinger → Dominios → domiclick.com → DNS / Zona DNS**.

### 1. Raíz `domiclick.com` (obligatorio para iPhone)

Agrega registro **A**:

| Tipo | Nombre / Host | Valor | TTL |
|------|---------------|-------|-----|
| **A** | `@` | `199.36.158.100` | 3600 |

Firebase puede pedir otra IP al conectar el dominio en consola — usa la que muestre **Firebase → Hosting → Dominios personalizados**.

Si ya hay un registro **AAAA** solo con IPv6, déjalo o bórralo según indique Firebase; lo crítico es tener **A con IPv4**.

### 2. `www` (landing clientes)

| Tipo | Nombre | Valor |
|------|--------|-------|
| **CNAME** | `www` | `gen-lang-client-0954482957.web.app` |

**Elimina** cualquier CNAME de `www` que apunte a `domiclick-96bd8.web.app`.

### 3. `ops` (torre de control)

| Tipo | Nombre | Valor |
|------|--------|-------|
| **CNAME** | `ops` | `domiclick-ops.web.app` |

**Elimina** CNAME de `ops` que apunte a `domiclick-96bd8.web.app`.

### 4. Firebase Console

1. [Firebase Hosting](https://console.firebase.google.com/project/gen-lang-client-0954482957/hosting)
2. Sitio **`gen-lang-client-0954482957`** → conectar `domiclick.com` y `www.domiclick.com`
3. Sitio **`domiclick-ops`** → conectar `ops.domiclick.com`

Espera **15 min – 48 h** de propagación DNS.

---

## Verificar

Desde PC:

```powershell
nslookup -type=A domiclick.com 8.8.8.8
```

Debe mostrar `199.36.158.100` (o la IP de Firebase).

En iPhone Safari: abrir `https://domiclick.com` — debe cargar la landing, no el error de servidor.

---

## Resumen

- El deploy a Firebase **está bien**.
- El iPhone falla porque **`domiclick.com` no tiene IPv4 en DNS**.
- Mientras arreglas Hostinger, comparte **`domiclick-ops.web.app`**.
