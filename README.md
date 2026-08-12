# DomiClick

Plataforma de mensajería y paquetería en motocicleta para **Villavicencio, Meta**.

## Stack conectado

| Servicio | Estado | Detalle |
|----------|--------|---------|
| **Firebase Auth** | Conectado | Email + Google (`firebase-applet-config.json`) |
| **Cloud Firestore** | Conectado | DB: `ai-studio-domiclick-84da0121-...` |
| **Firebase Storage** | Conectado | Bucket: `gen-lang-client-0954482957.firebasestorage.app` |
| **Google Maps** | Listo | Map ID `7959bb6afa37dd5e9db669a8` + Leaflet tiles |

## Requisitos

- Node.js 18+
- Cuenta Firebase (proyecto ya configurado en el repo)
- Clave de [Google Maps Platform](https://console.cloud.google.com/google/maps-apis) (opcional; el mapa funciona con tiles sin clave)

## Instalación

```bash
npm install
cp .env.example .env.local
```

Edita `.env.local` y agrega tu clave de Maps:

```
VITE_GOOGLE_MAPS_PLATFORM_KEY=AIza...
```

## Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo (puerto 3000) |
| `npm run build` | Build de producción |
| `npm run lint` | Typecheck TypeScript |
| `npm run preview` | Preview del build |

## Firebase

Configuración en `firebase-applet-config.json`:

- **Project ID:** `gen-lang-client-0954482957`
- **Storage:** fotos de motorizados (`drivers/`) y evidencia de pedidos (`orders/`)
- Reglas: `firestore.rules`, `storage.rules`

## Arquitectura (circuito cerrado)

- **Admin** — despacho, flota, pedidos, chat con transportistas
- **Transportista** — pedidos asignados, GPS, chat con central
- **Página de ventas** — proyecto aparte; envía cliente + dirección por el **tubo**

Ver: [docs/TUBO-VENTAS.md](docs/TUBO-VENTAS.md)

```bash
npm run dev         # UI circuito cerrado :3000
npm run server      # Tubo API :8787
npm run dev:client  # Landing clientes :5174 (client-web/)
```

Ver también: [client-web/README.md](client-web/README.md)

**Deploy / dominios (producción):** [docs/DEPLOY-DOMINIOS.md](docs/DEPLOY-DOMINIOS.md) — subdominios `pedir` / `ops` / `api`, DNS, Firebase y variables.
