/**
 * Capgo Social Login always runs AuthorizationClient after Credential Manager.
 * That second UI often cancels as USER_CANCELLED after the user already picked
 * an account. Firebase Auth only needs the idToken — skip AuthorizationClient
 * for online mode whenever an idToken is present.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(
  root,
  'node_modules/@capgo/capacitor-social-login/android/src/main/java/ee/forgr/capacitor/social/login/GoogleProvider.java',
);

const MARKER = 'DOMICLICK_SKIP_AUTHORIZATION_CLIENT';

if (!existsSync(target)) {
  console.warn('[patch-capgo-google] plugin no instalado, se omite');
  process.exit(0);
}

let src = readFileSync(target, 'utf8');

const desired = `                    GoogleIdTokenCredential googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.getData());
                    String idToken = googleIdTokenCredential.getIdToken();

                    // ${MARKER}: Firebase Auth only needs idToken — skip AuthorizationClient
                    // (second UI often surfaces as USER_CANCELLED after account pick).
                    if (GoogleProvider.this.mode == GoogleProviderLoginType.ONLINE && idToken != null) {
                        Log.i(LOG_TAG, "Skipping AuthorizationClient; resolving online login with idToken only");
                        resolveOnlineLogin(call, response, resultObj, user, idToken, null);
                        return;
                    }

                    ListenableFuture<AuthorizationResult> future = getAuthorizationResult(forceRefreshToken);`;

if (src.includes(desired)) {
  console.log('[patch-capgo-google] ya aplicado (idToken-only)');
  process.exit(0);
}

// Replace older scoped skip if present
const oldSkip =
  /GoogleIdTokenCredential googleIdTokenCredential = GoogleIdTokenCredential\.createFrom\(credential\.getData\(\)\);\s*String idToken = googleIdTokenCredential\.getIdToken\(\);\s*(?:\/\/[^\n]*\n\s*)*if \(\s*GoogleProvider\.this\.mode == GoogleProviderLoginType\.ONLINE &&\s*idToken != null &&\s*isAuthenticationOnlyScopes\(GoogleProvider\.this\.scopes\)\s*\) \{\s*Log\.i\(LOG_TAG, "Skipping AuthorizationClient; resolving online login with idToken only"\);\s*resolveOnlineLogin\(call, response, resultObj, user, idToken, null\);\s*return;\s*\}\s*ListenableFuture<AuthorizationResult> future = getAuthorizationResult\(forceRefreshToken\);/m;

if (oldSkip.test(src)) {
  writeFileSync(target, src.replace(oldSkip, desired), 'utf8');
  console.log('[patch-capgo-google] actualizado a skip siempre con idToken');
  process.exit(0);
}

const needle = `                    GoogleIdTokenCredential googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.getData());
                    String idToken = googleIdTokenCredential.getIdToken();

                    ListenableFuture<AuthorizationResult> future = getAuthorizationResult(forceRefreshToken);`;

if (!src.includes(needle)) {
  if (src.includes(MARKER)) {
    console.log('[patch-capgo-google] marcador presente (variante distinta); OK');
    process.exit(0);
  }
  console.warn('[patch-capgo-google] patrón no encontrado; revisa versión del plugin');
  process.exit(0);
}

writeFileSync(target, src.replace(needle, desired), 'utf8');
console.log('[patch-capgo-google] AuthorizationClient skip OK');
src = readFileSync(target, 'utf8');

const cancelNeedle = `        if (e instanceof GetCredentialCancellationException) {
            call.reject("Google Sign-In cancelled by user", USER_CANCELLED_CODE, e);
            return;
        }`;

const cancelDesired = `        if (e instanceof GetCredentialCancellationException) {
            String sha1 = getSigningCertificateSha1(context);
            call.reject(
                "Google Sign-In cancelled by user. package=" +
                    context.getPackageName() +
                    " signingSha1=" +
                    (sha1 != null ? sha1 : "unknown") +
                    " webClientId=" +
                    maskClientId(clientId),
                USER_CANCELLED_CODE,
                e
            );
            return;
        }`;

if (src.includes('signingSha1=" +') && src.includes('GetCredentialCancellationException')) {
  console.log('[patch-capgo-google] cancel+SHA ya aplicado');
} else if (src.includes(cancelNeedle)) {
  writeFileSync(target, src.replace(cancelNeedle, cancelDesired), 'utf8');
  console.log('[patch-capgo-google] cancel+SHA OK');
} else {
  console.warn('[patch-capgo-google] patrón cancel no encontrado (puede estar ya parcheado)');
}
