# Registrar app Android DomiClick en Firebase + SHA

Paquete (obligatorio, sin cambiar):

```
com.domiclick.app
```

Alias sugerido: `DomiClick Android`

## SHA de la firma de subida (upload key)

```
SHA-1:   4F:39:E7:7E:DB:43:70:D0:2E:0C:C8:20:B7:CB:42:95:8D:E5:45:FC
SHA-256: C3:81:71:DE:23:AB:B4:5E:5D:79:40:98:4B:F2:AD:A7:D4:96:0A:72:82:EE:CC:FF:5A:E5:A8:47:04:F6:D8:FA
```

## SHA de Play App Signing (obligatorio si la app viene de Play Store)

```
SHA-1: EF:83:6F:F1:68:3A:10:DF:00:AE:4C:86:8E:AD:06:A8:BC:8F:F7:49
```

1. Play Console → DomiClick → **Integridad de la app**.
2. **Firma de apps de Play** → certificado **Firma de la app**.
3. Confirma que el SHA-1 coincida con el de arriba (si cambió, pégalo en Firebase).
4. Firebase → app Android → Agregar huella.

Sin el SHA de Play, Google Sign-In falla en la versión instalada desde Play (a veces se ve como “cancelado”).

## Debug (pruebas locales APK)

```
SHA-1: 54:78:DD:F5:4E:D9:A9:55:25:3C:FD:01:7C:4A:04:2A:41:60:B8:D8
```

## OAuth Web Client ID (Capacitor / Firebase)

```
712322107034-sf5vmu7ml9ct8g34uavef428ij16jln7.apps.googleusercontent.com
```

## Pantalla de consentimiento OAuth (Google Cloud)

Si está en **Prueba**, cada Gmail que use la app debe estar en **Usuarios de prueba**.
Si no, tras elegir la cuenta Android puede marcar el acceso como “cancelado”.
Publícala en **Producción** (scopes básicos email/profile no requieren verificación).

## Authorized domains (Firebase Auth)

- `domiclick.com`
- `www.domiclick.com`
- `domiclick-ops.web.app`
- `ops.domiclick.com`
- `localhost`
- `gen-lang-client-0954482957.firebaseapp.com`

Ver también: [APPLE-SIGNIN.md](./APPLE-SIGNIN.md)
