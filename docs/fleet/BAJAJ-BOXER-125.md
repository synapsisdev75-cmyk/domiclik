# Bajaj Boxer 125 — Referencia técnica DomiClick

Documento de investigación para cálculo de combustible, galones por turno y mantenimiento en la flota.

**Fuentes:** Manual de mantenimiento periódico Boxer X125 (Bajaj Auto), reportes de usuarios en Colombia, fichas de distribuidores (Grupo UMA / Bajaj Cali).  
**Nota:** El dato comercial de **370 km/galón** corresponde a la **Boxer CT 100**, no a la **125**.

---

## Motor y tanque

| Dato | Valor |
|------|--------|
| Cilindrada | 124.6 cc |
| Tanque | **10.5 L** (Boxer CT/X 125 Colombia) |
| Aceite motor | **20W50 API SL JASO MA** · ~**0.9 L** |
| Combustible | Gasolina corriente |

---

## Rendimiento de combustible (investigación)

No hay cifra oficial homologada L/100 km para la 125. Reportes de usuarios y pruebas en Colombia:

| Escenario | km/L | km/galón (×3.785) |
|-----------|------|-------------------|
| Ciudad ligera | 40–45 | 151–170 |
| **Mix domicilios (operativo DomiClick)** | **40** | **151** |
| Carretera ~70 km/h | 38–42 | 144–159 |
| Carga pesada / muchas paradas | 35 | 132 |
| Marketing CT **100** (no 125) | ~97 | 370 |

### Fórmula DomiClick (al cerrar turno)

```
km recorrido  = km salida − km entrada
litros        = km recorrido ÷ km/L
galones       = km recorrido ÷ km/galón   (= litros ÷ 3.785)
costo COP     = galones × precio galón
```

### Ejemplo turno 80 km (Boxer 125, 40 km/L, galón $16.500)

| Métrica | Valor |
|---------|--------|
| Km recorrido | 80 km |
| Litros | 80 ÷ 40 = **2.0 L** |
| Galones | 80 ÷ 151 ≈ **0.53 gal** |
| Costo | 0.53 × 16.500 ≈ **$8.745 COP** |
| Consumo por km | 0.025 L/km · 0.0033 gal/km · ~$109 COP/km |

### Rango del día (80 km)

| Escenario | Galones | Costo (@ $16.500/gal) |
|-----------|---------|------------------------|
| Optimista (170 km/gal) | 0.47 | $7.765 |
| **Promedio (151 km/gal)** | **0.53** | **$8.745** |
| Pesado (132 km/gal) | 0.61 | $10.065 |

---

## Mantenimiento programado (manual Bajaj Boxer 125)

| Servicio | Intervalo |
|----------|-----------|
| **1.er servicio** | **750 km** o **30 días** (lo que ocurra primero) |
| Servicios siguientes | cada **5.000 km** |
| **Aceite motor** | 1.er servicio y luego **cada 5.000 km** |
| Cadena | Limpiar/lubricar **cada 5.000 km** |
| Filtro de aire | Limpiar **5.000 km** · Reemplazar **15.000 km** |
| Bujía | Reemplazar **15.000 km** |
| Bowl sedimentos combustible | Limpiar **5.000 km** |
| Float bowl carburador | Limpiar **10.000 km** |

### Recomendación flota domicilios (uso intensivo)

Para reparto diario con carga y arranques frecuentes, muchos talleres sugieren **aceite cada 3.000 km**. El sistema alerta a los **5.000 km** (fabricante) y puede registrarse cambio anticipado en **Control de motos → Mantenimiento**.

---

## Integración en el sistema

- Catálogo: `src/lib/motoFuel.ts` → id `bajaj-boxer-125`
- Default flota: **151 km/gal**, aceite **5.000 km**
- Métricas visibles en: **Ajustes → Control de motos**, **Asistencia**, perfil transportista, cierre de turno en tablet

Cuando registres el modelo exacto en el perfil (`Boxer 125`, `Boxer CT 125`, etc.), el sistema aplica automáticamente estas constantes.
