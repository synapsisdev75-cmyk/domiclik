/**
 * Crea el administrador fundador (activo) para arrancar la torre desde cero.
 * Uso: node scripts/seed-founder-admin.mjs
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, '..', 'firebase-applet-config.json'), 'utf8'));

const EMAIL = 'creativamenteoficcial@gmail.com';
const now = new Date().toISOString();

const app = initializeApp({
  apiKey: cfg.apiKey,
  authDomain: cfg.authDomain,
  projectId: cfg.projectId,
  storageBucket: cfg.storageBucket,
  messagingSenderId: cfg.messagingSenderId,
  appId: cfg.appId,
});

const dbId =
  cfg.firestoreDatabaseId && cfg.firestoreDatabaseId !== '(default)'
    ? cfg.firestoreDatabaseId
    : undefined;
const db = dbId ? getFirestore(app, dbId) : getFirestore(app);

const admin = {
  id: EMAIL,
  email: EMAIL,
  displayName: 'John Guevara',
  status: 'active',
  isFounder: true,
  requestedAt: now,
  activatedAt: now,
  activatedBy: 'sistema',
};

await setDoc(doc(db, 'admins', EMAIL), admin);
console.log(`Admin fundador creado: ${EMAIL} (status=active, isFounder=true)`);
console.log(`Base: ${cfg.projectId} / ${dbId || '(default)'}`);
