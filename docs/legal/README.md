# Domiclick — objeto social y matriz operativa

Documentos fuente (carpeta `docs/legal/`):

- `Objeto Social Definitivo DOMICLICK.docx`
- `MATRIZ MAESTRA DE FUNCIONALIDADES Y BOTONES DOMICLICK.docx`

## Copy pública (SIC / consumidor)

La app **no** se presenta como empresa de mensajería postal. El mensaje de bienvenida habla de **software, encargos prepagados e intermediación**.

Frase oficial: *¡Pídelo, págalo y relájate! Domiclick va por tu pedido.*

## Flujo del repartidor (matriz)

1. Aceptar servicio  
2. Iniciar ruta  
3. Llegué al origen  
4. Confirmar recogida  
5. Iniciar entrega  
6. Llegué al destino  
7. Confirmar entrega (PIN del cliente)

## Cliente

- Buscador de origen/destino por nombre (calles, barrios, parques, hospitales).
- Número de factura / orden de compra para validar en el establecimiento.

## Push oficiales

Los 5 mensajes de asignación, sitio, en camino, cerca y entrega están en `src/lib/brandCopy.ts` y se muestran en el seguimiento del cliente.

## Perfiles (matriz)

| Perfil | App | Alcance |
| --- | --- | --- |
| Admin | Torre (`npm run dev`) | Nomina, cancelar, borrar, métricas, mapa |
| Central | Misma torre | Asignar, incidencias, radio, radar |
| Repartidor | Cabina motorizado | Flujo A→B con PIN, pánico, GPS |
| Usuario | `client-web` | Pedir, rastrear, PIN, calificar |
