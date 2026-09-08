# Seguridad de datos — DomiClick
# Play Console NO acepta CSV personalizado. Debes usar la plantilla de Google.

## PASO 1 — Descargar plantilla oficial
1. En Play Console → Seguridad de los datos
2. Arriba a la derecha: **Exportar a CSV** o **Descargar CSV de muestra**
3. Abre ese archivo en Excel (NO uses play-store-seguridad-datos-domiclick.csv para importar)

## PASO 2 — Columnas del CSV de Google (encabezado fijo)
Question ID (machine readable),Response (machine readable),Response value,Answer requirement,Human-friendly question label

## PASO 3 — Qué poner en "Response value"
- TRUE = Sí / seleccionado
- FALSE o vacío = No

---

## RESPUESTAS PARA DOMICLICK

### Preguntas generales (busca estas filas en el CSV)

| Human-friendly label (aprox.) | Response value |
|-------------------------------|----------------|
| Does your app collect or share any of the required user data types? → Yes | TRUE |
| Is all of the user data collected by your app encrypted in transit? → Yes | TRUE |
| Do you provide a way for users to request that their data is deleted? → Yes | TRUE |
| Account deletion URL | https://domiclick.com/delete-account.html |
| Account creation methods → OAuth | TRUE |

### Tipos de datos — marcar TRUE en PSL_DATA_TYPES

| Categoría | Tipo (Response) | TRUE? |
|-----------|-----------------|-------|
| Personal info | PSL_NAME | TRUE |
| Personal info | PSL_EMAIL | TRUE |
| Personal info | PSL_USER_ID | TRUE |
| Personal info | PSL_PHONE | TRUE |
| Location | PSL_PRECISE_LOCATION | TRUE |
| Location | PSL_APPROX_LOCATION | FALSE (dejar vacío) |
| Photos and videos | PSL_PHOTOS | TRUE |
| App activity | PSL_APP_INTERACTIONS | TRUE (si aparece) |

### NO marcar (dejar vacío / FALSE)
- PSL_FINANCIAL_INFO, PSL_HEALTH, PSL_CONTACTS, PSL_SMS, PSL_AUDIO, PSL_FILES
- PSL_APPROX_LOCATION
- PSL_ADVERTISING, PSL_ANALYTICS (en propósitos, salvo que uses analytics)

---

## Por cada dato marcado TRUE — detalle

### NOMBRE (PSL_NAME)
- Collected: TRUE | Shared: FALSE
- Ephemeral: FALSE
- Required: TRUE (PSL_DATA_USAGE_USER_CONTROL_REQUIRED)
- Purpose collected: PSL_APP_FUNCTIONALITY = TRUE
- Purpose collected: resto = vacío

### EMAIL (PSL_EMAIL)
- Igual que Nombre
- Purpose: PSL_APP_FUNCTIONALITY + PSL_ACCOUNT_MANAGEMENT = TRUE

### TELÉFONO (PSL_PHONE)
- Collected: TRUE | Shared: TRUE (compartido con repartidor)
- Required: TRUE
- Purpose collected: PSL_APP_FUNCTIONALITY = TRUE
- Purpose shared: PSL_APP_FUNCTIONALITY = TRUE

### UBICACIÓN PRECISA (PSL_PRECISE_LOCATION)
- Collected: TRUE | Shared: TRUE (repartidor en envío)
- Required: TRUE
- Purpose: PSL_APP_FUNCTIONALITY = TRUE

### FOTOS (PSL_PHOTOS)
- Collected: TRUE | Shared: FALSE
- Required: FALSE → PSL_DATA_USAGE_USER_CONTROL_OPTIONAL = TRUE
- Purpose: PSL_APP_FUNCTIONALITY = TRUE

---

## PASO 4 — Importar
1. Guarda el CSV de Google (plantilla editada)
2. Play Console → Seguridad de los datos → **Importar desde CSV**
3. Sube el archivo

## URL eliminación (campo web, no siempre en CSV)
https://domiclick.com/delete-account.html
