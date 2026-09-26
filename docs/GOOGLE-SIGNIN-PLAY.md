# Login Google Android (Play Store) — DomiClick

Paquete: `com.domiclick.app`

## Por qué el APK por WhatsApp sí y Play no

Play **vuelve a firmar** la app. El SHA-1 de Play debe estar en Firebase.

| Origen | SHA-1 | Uso |
|--------|-------|-----|
| Firma de subida (AAB/APK local) | `4F:39:E7:7E:DB:43:70:D0:2E:0C:C8:20:B7:CB:42:95:8D:E5:45:FC` | APK suelto / lo que subes a Play |
| **Firma de la app (Play) — clave nueva** | `21:44:2E:25:0C:2D:CC:A0:A1:3B:85:59:6D:81:1F:29:71:69:3A:8F` | App instalada desde Play (tras cambio de clave) |
| Firma Play (clave anterior) | `EF:83:6F:F1:68:3A:10:DF:00:AE:4C:86:8E:AD:06:A8:BC:8F:F7:49` | Builds antiguas / clave previa |
| Cert. deployment_cert.der | `F9:32:6E:B0:91:22:2B:16:08:3F:9A:EF:B9:7F:21:9C:D1:5A:3C:F0` | Certificado descargado (si aplica) |
| Debug | `54:78:DD:F5:4E:D9:A9:55:25:3C:FD:01:7C:4A:04:2A:41:60:B8:D8` | `npx cap run` |

SHA-256 clave nueva Play:

```
8B:1D:D4:45:99:23:40:15:44:CE:05:2A:1C:0A:D3:AE:C3:C0:71:80:EA:A0:84:D2:B1:BD:7E:0D:8B:B3:F7:ED
```

Todos estos SHA están registrados en Firebase (proyecto `gen-lang-client-0954482957`).

### Tras cambiar la clave de firma de Play

1. Registrar SHA-1 + SHA-256 de la **Firma de la app** actual en Firebase.
2. Esperar 10–15 min (OAuth clients se regeneran solos).
3. Subir AAB nuevo (≥ **1.0.27**, `versionCode` 28) con `google-services.json` actualizado.
4. Desinstalar e instalar **solo desde Play** (no APK suelto + Play mezclados).
5. Abrir Perfil → **Entrar con Google** una sola vez.

Artefactos locales: `client-web/releases/domiclick-1.0.27.aab` / `.apk`.

### OAuth Web Client ID (Capacitor)

```
712322107034-sf5vmu7ml9ct8g34uavef428ij16jln7.apps.googleusercontent.com
```

Ver también: [FIREBASE-ANDROID-SHA.md](./FIREBASE-ANDROID-SHA.md)
