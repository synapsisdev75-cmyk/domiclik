# Informe arquitectónico y de desarrollo — DomiClick

**Cabina transportista · mapa en vivo · tour multi-parada**  
**Versiones:** 1.0.69 → 1.0.79 (versionCode 80)  
**Propósito:** transferencia de contexto para humanos o IA (p. ej. Gemini)

---

## 0. Propósito

Describe **qué** se construyó, **cómo** está arquitecturado, **qué archivos** importan, **decisiones** técnicas y **limitaciones**.  
Alcance: app cliente/transportista (`client-web` + Capacitor Android). No es informe comercial.

---

## 1. Contexto del producto

DomiClick = logística/domicilios (Villavicencio, Meta, Colombia).  
App Android del transportista (cabina): pedidos asignados, avance de estados (recogida/entrega/PIN), mapa en vivo, optimizar ruta con varios pedidos, abrir Google Maps para turn-by-turn.

| Dato | Valor |
|------|--------|
| App ID | `com.domiclick.app` |
| UI | React 19 + Vite + TypeScript + Tailwind |
| Mapa in-app | `@vis.gl/react-google-maps` |
| Datos | Firebase / Firestore |
| Empaque | Capacitor 8 → AAB/APK |
| Última build | 1.0.79 / versionCode 80 |

---

## 2. Arquitectura de alto nivel

```
Firebase (orders/driver)
    → DriverCabinPage (UI + GPS + tour state)
        → LiveTripMap (mapa DomiClick)
        → tour.ts (orden de paradas)
        → googleMapsNav.ts (deep link Google Maps nativo)
```

| Capa | Responsabilidad | Archivo |
|------|-----------------|--------|
| UI cabina | Tabs, hoja paradas, acciones | `src/pages/DriverCabinPage.tsx` |
| Mapa en vivo | Ruta, pines, moto, follow, gestos | `src/components/LiveTripMap.tsx` |
| Moto 3D/2.5D | GLB→PNG + rotación CSS | `src/components/MotoMarker3D.tsx` |
| Tour | Orden R/E, freeze lote, score calles | `src/lib/tour.ts` |
| Geo | `estimateTourRoute`, Directions/OSRM | `src/lib/geo.ts` |
| Maps externo | Deep links multi-parada | `src/lib/googleMapsNav.ts` |
| Orientación | Híbrido brújula/GPS | `driverOrientation.ts`, `headingSmooth.ts` |
| GPS track | Anti-saltos | `src/lib/gpsTrackFilter.ts` |
| Ubicación nativa | LiveLocator + fallback web | `src/lib/liveLocator.ts` |
| Cercanía | Aviso mismo lugar (~40 m) | `src/lib/nearbySamePlace.ts` |
| Dominio | Estados / advance | `src/lib/driverCabin.ts` |
| Offline | Cola sync | `src/lib/driverOffline.ts` |

---

## 3. Modelo de dominio (tour)

- Hasta **3 pedidos** abiertos → hasta **6 paradas** (R+E).
- **Identidad** del pedido: `R1/E1`…`R3/E3` (slot en `openOrders`).
- **Orden de visita**: `visitSeq` 1,2,3… (`tourStopsOrdered`, optimizado).
- **Constraint:** no entregar antes de recoger el mismo `orderId`.
- `tourPlanSignature`: si cambia el lote → replanifica; **GPS tick no reordena**.
- Sync: `planJoinedTourStops` · Async calles: `planJoinedTourStopsAsync`.

UI 1.0.79: hoja Inicio + lista numerada + Optimizar + Navegar tour.  
Pines: número grande (visita) + badge R/E (identidad).

---

## 4. Flujo GPS y mapa

1. Preferente: **LiveLocator** nativo (con permiso).
2. Fallback: `navigator.geolocation` (HTTPS obligatorio en web/LAN).
3. `gpsTrackFilter`: evita saltos / rebote native↔browser.
4. `followMe`: mapa sigue al conductor; gesto → `onFollowBreak`.
5. Rumbo: quieto → brújula (deadzone); movimiento → GPS.

**Decisión crítica:** se abandonó WebGLOverlayView / Map ID VECTOR forzado (mapa verde vacío en muchos Android). Producción: **mapa raster + AdvancedMarker + moto CSS**.

---

## 5. Integración Google Maps (externa)

DomiClick **no** controla pines A/B/C dentro de Google Maps.

- Una parada: `buildGoogleMapsNavigateToUrl(dest, origin)` con lat/lng.
- Tour: `buildGoogleMapsMultiStopUrl` → path  
  `https://www.google.com/maps/dir/lat,lng/lat,lng/.../data=!4m2!4m1!3e0`
- Motivo del path: URLs `api=1` con texto/`@label` **rompían** waypoints en móvil.
- Leyenda en cabina: `A=R1 · B=E1…`
- Banner **Volver a DomiClick** tras abrir Maps.

---

## 6. Timeline de features (no correcciones)

| Versión | Entrega |
|---------|---------|
| 1.0.69 | Pago visible, menú mapa, R1–E3 |
| 1.0.70 | Aviso mismo lugar |
| 1.0.73 | Tour unido desde GPS + freeze |
| 1.0.74–75 | Filtro GPS + Optimizar por calles |
| 1.0.77 | Ubicarme follow + gestos |
| 1.0.79 | Paradas numeradas Route4Me + export Maps |

Nota técnica (corrección, no feature): **1.0.76** LiveLocator — no iniciar FGS sin permiso runtime.

---

## 7. ADRs (decisiones)

1. Distintivos en DomiClick; Maps solo turn-by-turn.  
2. `visitSeq` + badge R/E; no renombrar A/B/C de Maps.  
3. Freeze de tour por signature; GPS no reordena.  
4. Multi-stop Maps = path lat,lng.  
5. Sin WebGLOverlayView en prod actual.  
6. Follow se rompe con gesto del usuario.

---

## 8. Limitaciones / pendiente

- Maps no permite pines R1/E1 personalizados.
- Exportar tour a Maps **no obliga** orden físico; solo DomiClick puede gatear confirmaciones.
- **No implementado:** candado estricto 1→2→3 (navegar/confirmar solo parada activa).
- Directions puede fallar en localhost (API key/referrer); producción OK.
- GPS web requiere HTTPS.

---

## 9. Build / publicar

```bash
cd client-web
npm run build
npx cap sync android
cd android
./gradlew :app:bundleRelease :app:assembleRelease
# Artefactos → client-web/releases/domiclick-<version>.*
```

Dev local con GPS: Vite HTTPS (p. ej. `:5174`) `/transportista?tab=mapa`.

---

## 10. TL;DR para Gemini

Se evolucionó la cabina DomiClick para **hasta 3 pedidos** con **tour optimizado (R antes de E)**, **mapa en vivo estable** (follow + rumbo + pines numerados) y **export fiable a Google Maps** por coordenadas. La UX tipo Route4Me vive **dentro de DomiClick**; Google Maps es motor de navegación, no fuente de verdad del orden operativo. Última entrega: **Android 1.0.79**.
