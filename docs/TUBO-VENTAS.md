# Tubo DomiClick ↔ Página de Ventas

DomiClick es software de **circuito cerrado** (Admin + Transportista).
La **página de ventas** es un proyecto aparte. Se comunican por este API.

## Arranque

```bash
# Terminal 1 — UI DomiClick (circuito cerrado)
npm run dev

# Terminal 2 — Tubo (ingest)
npm run server

# Terminal 3 — Landing clientes (opcional)
npm run dev:client
```

API: `http://localhost:8787`  
Landing: `http://localhost:5174` (`client-web/`, siteId `clientes-landing`)

**Producción (subdominios, DNS, env):** ver [DEPLOY-DOMINIOS.md](DEPLOY-DOMINIOS.md).

## Autenticación

```
Authorization: Bearer {DOMICLICK_INGEST_TOKEN}
X-DomiClick-Site: {sourceSiteId}
```

Sitios autorizados: `DOMICLICK_AUTHORIZED_SITES` en `.env.local`
(ej. `ventas-local,dulce-sorpresa,clientes-landing`).

## Landing de clientes (`client-web/`)

Envía pedidos con `sourceSiteId: clientes-landing` y las mismas cabeceras del tubo.
Variables: ver `client-web/.env.example`.

Seguimiento público (cliente): `GET /api/v1/tracking/:trackingCode`
(si el endpoint aún no está desplegado, la UI de `/seguimiento/:code` mostrará el error del API).

## Enviar pedido desde ventas

`POST /api/v1/inbound/orders`

```json
{
  "sourceSiteId": "ventas-local",
  "externalOrderId": "WEB-1001",
  "customerName": "Ana Pérez",
  "customerPhone": "+57 300 123 4567",
  "customerEmail": "ana@correo.com",
  "deliveryAddress": "Calle 38 # 29-10, Barzal, Villavicencio",
  "deliveryLat": 4.145,
  "deliveryLng": -73.633,
  "pickupAddress": "Tienda / Bodega",
  "description": "Pedido web",
  "declaredValue": 45000,
  "notes": ""
}
```

Respuesta `201`:

```json
{
  "ok": true,
  "orderId": "ord_...",
  "trackingCode": "DMC-4521",
  "status": "pending"
}
```

DomiClick Admin ve el pedido en tiempo real (Firestore `orders`) y lo asigna a un motorizado.
El chat Admin ↔ Transportista usa la colección `messages`.

## Ejemplo curl

```bash
curl -X POST http://localhost:8787/api/v1/inbound/orders \
  -H "Authorization: Bearer domiclick-dev-ingest-token" \
  -H "X-DomiClick-Site: ventas-local" \
  -H "Content-Type: application/json" \
  -d "{\"sourceSiteId\":\"ventas-local\",\"customerName\":\"Ana\",\"customerPhone\":\"3001234567\",\"deliveryAddress\":\"Barzal Alto\"}"
```

Contrato TypeScript compartible: `src/contracts/salesIngest.ts`
