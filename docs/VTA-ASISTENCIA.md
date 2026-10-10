# VTA → Asistencia DomiClick (entrada / salida)

Guía operativa para el control biométrico VTA (ej. VTA-70070 / 70075) vinculado a DomiClick.

## Objetivo

- Huella en el VTA = entrada o salida en DomiClick.
- Activa / desactiva la cabina del motorizado (`drivers.isActive`).
- La **tablet** sigue solo para fotos de odómetro y placa (QR). El PIN diario es respaldo si el VTA falla.

## Fase 0 — Usar el aparato ya (sin código)

1. Montar el VTA en sede con corriente y cable **RJ45** al router/switch.
2. En el menú del aparato → Configuración → RED:
   - IP fija en tu LAN (ej. `192.168.1.50`)
   - Máscara, gateway, puerto
3. Instalar el **software de PC** del vendedor (USB / CD / link). Si no te lo dieron, pídelo: sin software no hay export fácil.
4. En el software:
   - Crear un usuario por motorizado (anota el **ID numérico**).
   - Registrar 2 huellas por persona.
5. Probar entrada/salida en el VTA y verifica que salen en el software.
6. En DomiClick Ops → Flota → perfil del motorizado → campo **ID VTA** = ese número.

Mientras conectas el sync, la tablet PIN sigue funcionando.

## Fase 1 — Sync automático o CSV

### Opción A — API en vivo (PC de sede)

```bash
# Token = mismo DOMICLICK_INGEST_TOKEN del servidor (o VTA_INGEST_TOKEN)
curl -X POST "https://TU-API/api/v1/attendance/vta-punch" \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"vtaUserId\":\"12\"}"
```

DomiClick decide automáticamente:

- Sin entrada abierta hoy → `in` (cabina ON)
- Ya hay entrada sin salida → `out` (cabina OFF)

Script de ejemplo: [`scripts/vta-bridge.mjs`](../scripts/vta-bridge.mjs)

### Opción B — Importar CSV en Ops

En **Asistencia** → “Importar CSV VTA”.

Formato mínimo (cabecera recomendada):

```csv
vtaUserId,at
12,2026-09-28T08:05:00-05:00
12,2026-09-28T17:40:00-05:00
15,2026-09-28T08:12:00-05:00
```

También acepta columnas `UserID` / `ID` / `DateTime` / `Time` típicas de export del software.

## Operación diaria

1. Llegada → huella VTA → cabina ON.
2. Fotos moto → QR de la tablet (odómetro + placa).
3. Salida → huella VTA → cabina OFF.
4. Central ve marcas en Asistencia (método **Huella VTA**).

## Variables de entorno (servidor)

| Variable | Uso |
|----------|-----|
| `DOMICLICK_INGEST_TOKEN` | Token Bearer del tubo (también sirve para VTA) |
| `VTA_INGEST_TOKEN` | Opcional; si existe, se acepta además del ingest |

## Fuera de alcance (por ahora)

- Abrir puerta / candado eléctrico con el rele del VTA.
- Quitar la tablet por completo.
