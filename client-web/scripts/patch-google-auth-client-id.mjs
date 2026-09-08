/**
 * Tras npm install, el plugin deja default_web_client_id = WILL_BE_OVERRIDDEN
 * y Google Sign-In nativo falla al instante. Restauramos el Web Client ID real.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(
  root,
  'node_modules/@capacitor-firebase/authentication/android/src/main/res/values/strings.xml',
);
const WEB_CLIENT_ID =
  '712322107034-sf5vmu7ml9ct8g34uavef428ij16jln7.apps.googleusercontent.com';

if (!existsSync(target)) {
  console.warn('[patch-google-auth] plugin no instalado, se omite');
  process.exit(0);
}

const xml = `<resources>
    <string name="default_web_client_id" translatable="false">${WEB_CLIENT_ID}</string>
</resources>
`;
writeFileSync(target, xml, 'utf8');
console.log('[patch-google-auth] default_web_client_id OK');
