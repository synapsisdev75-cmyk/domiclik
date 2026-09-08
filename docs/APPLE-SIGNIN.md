# DomiClick — Sign in with Apple (iPhone) + datos para Firebase

## Ya creado en Firebase

| Campo | Valor |
|--------|--------|
| Bundle ID (Apple) | `com.domiclick.app` |
| Alias | DomiClick iOS |
| Firebase App ID | `1:712322107034:ios:125a848a1e8d4d121ac123` |
| Google iOS Client ID | `712322107034-fum7t5pep7nde8qc9fbs1588q404o33c.apps.googleusercontent.com` |
| REVERSED_CLIENT_ID | `com.googleusercontent.apps.712322107034-fum7t5pep7nde8qc9fbs1588q404o33c` |
| Archivo plist | `client-web/ios-config/GoogleService-Info.plist` |

En la pantalla de Firebase que mostraste, usa exactamente:

```
com.domiclick.app
```

Alias: `DomiClick`  
ID App Store: déjalo vacío hasta publicar en App Store.

---

## URLs y firmas que debes configurar

### 1) Firebase Authentication → Sign-in method → Apple

1. Abre [Authentication → Sign-in method](https://console.firebase.google.com/project/gen-lang-client-0954482957/authentication/providers).
2. Activa **Apple**.
3. Guarda.

### 2) Apple Developer (cuenta de pago)

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list).
2. **Identifiers → App IDs** → crea/usa:
   - **Bundle ID:** `com.domiclick.app`
   - Capability: **Sign In with Apple** (ON)
3. **Identifiers → Services IDs** → crea p. ej. `com.domiclick.app.signin`:
   - Description: `DomiClick Sign In`
   - Enable **Sign In with Apple** → Configure:
     - **Domains:**
       - `domiclick.com`
       - `gen-lang-client-0954482957.firebaseapp.com`
     - **Return URLs** (obligatorias):
       - `https://gen-lang-client-0954482957.firebaseapp.com/__/auth/handler`
       - `https://domiclick.com/__/auth/handler`
       - `https://www.domiclick.com/__/auth/handler`
4. **Keys** → crea una key con **Sign In with Apple** vinculada al App ID `com.domiclick.app`.
   - Guarda **Key ID** y el archivo `.p8`.
5. Anota tu **Team ID** (arriba a la derecha en developer.apple.com).

### 3) Firebase Apple provider (consola)

Si Firebase pide configuración OAuth de Apple (web):

- Services ID: `com.domiclick.app.signin` (el que creaste)
- Apple Team ID: el de tu cuenta
- Key ID + contenido del `.p8`

### 4) URL scheme iOS (cuando generes el proyecto Xcode)

En `Info.plist` / URL Types agrega:

```
com.googleusercontent.apps.712322107034-fum7t5pep7nde8qc9fbs1588q404o33c
```

Copia `GoogleService-Info.plist` a la raíz del target iOS.

### 5) Capacitor iOS (en Mac)

```bash
cd client-web
npx cap add ios
# copia ios-config/GoogleService-Info.plist → ios/App/App/GoogleService-Info.plist
npx cap sync ios
npx cap open ios
```

En Xcode: Signing Team + capability **Sign In with Apple**.

---

## Google en Play (por qué fallaba)

El mensaje *“cancelado o sin cuentas”* en Play suele ser **SHA-1 de Play App Signing** no reconocido.

### SHA que deben estar en Firebase (Android `com.domiclick.app`)

| Origen | SHA-1 |
|--------|--------|
| Play App Signing | `EF:83:6F:F1:68:3A:10:DF:00:AE:4C:86:8E:AD:06:A8:BC:8F:F7:49` |
| Upload / release keystore | `4F:39:E7:7E:DB:43:70:D0:2E:0C:C8:20:B7:CB:42:95:8D:E5:45:FC` |
| Debug | `54:78:DD:F5:4E:D9:A9:55:25:3C:FD:01:7C:4A:04:2A:41:60:B8:D8` |

Confirma el de Play en: Play Console → Integridad de la app → **Firma de la app**.

OAuth Web Client ID (no uses el Android como webClientId):

```
712322107034-sf5vmu7ml9ct8g34uavef428ij16jln7.apps.googleusercontent.com
```

Tras agregar SHA: espera 10–30 min, reinstala desde Play, asegúrate de tener una cuenta Google en el teléfono.

---

## Resumen rápido para la UI de Firebase “Registrar app Apple”

| Campo | Pegar esto |
|--------|------------|
| ID del paquete de Apple | `com.domiclick.app` |
| Alias | `DomiClick` |
| ID de App Store | (vacío por ahora) |
