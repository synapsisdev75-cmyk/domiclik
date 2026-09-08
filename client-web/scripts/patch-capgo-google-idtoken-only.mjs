/**
 * Capgo Social Login always runs AuthorizationClient after Credential Manager.
 * That second UI often cancels as USER_CANCELLED after the user already picked
 * an account. Firebase Auth only needs the idToken — skip AuthorizationClient
 * when scopes are authentication-only (openid / email / profile).
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
if (src.includes(MARKER)) {
  console.log('[patch-capgo-google] ya aplicado');
  process.exit(0);
}

const needle = `                    GoogleIdTokenCredential googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.getData());
                    String idToken = googleIdTokenCredential.getIdToken();

                    ListenableFuture<AuthorizationResult> future = getAuthorizationResult(forceRefreshToken);`;

const replacement = `                    GoogleIdTokenCredential googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.getData());
                    String idToken = googleIdTokenCredential.getIdToken();

                    // ${MARKER}: Firebase Auth only needs idToken — skip AuthorizationClient
                    // (second UI often surfaces as USER_CANCELLED after account pick).
                    if (
                        GoogleProvider.this.mode == GoogleProviderLoginType.ONLINE &&
                        idToken != null &&
                        isAuthenticationOnlyScopes(GoogleProvider.this.scopes)
                    ) {
                        Log.i(LOG_TAG, "Skipping AuthorizationClient; resolving online login with idToken only");
                        resolveOnlineLogin(call, response, resultObj, user, idToken, null);
                        return;
                    }

                    ListenableFuture<AuthorizationResult> future = getAuthorizationResult(forceRefreshToken);`;

if (!src.includes(needle)) {
  console.warn('[patch-capgo-google] patrón no encontrado; revisa versión del plugin');
  process.exit(0);
}

writeFileSync(target, src.replace(needle, replacement), 'utf8');
console.log('[patch-capgo-google] AuthorizationClient skip OK');
