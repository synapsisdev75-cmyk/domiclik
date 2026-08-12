/**
 * Purga colecciones operativas de demos en Firestore (DB nombrada DomiClick).
 * Uso: npx tsx scripts/purge-demo-data.ts
 */
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  memoryLocalCache,
  collection,
  getDocs,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const dbId = firebaseConfig.firestoreDatabaseId;
const db = initializeFirestore(app, { localCache: memoryLocalCache() }, dbId);

const COLLECTIONS = ['drivers', 'orders', 'messages', 'chats', 'location_history'] as const;

async function wipeCollection(name: string) {
  const snap = await getDocs(collection(db, name));
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const label =
      (data.fullName as string) ||
      (data.trackingCode as string) ||
      (data.customerName as string) ||
      d.id;
    await deleteDoc(doc(db, name, d.id));
    console.log(`  ✗ ${name}/${d.id} (${label})`);
    n++;
  }
  console.log(`→ ${name}: ${n} documentos eliminados\n`);
  return n;
}

async function main() {
  console.log(`Purgando Firestore DB: ${dbId}\n`);
  let total = 0;
  for (const col of COLLECTIONS) {
    total += await wipeCollection(col);
  }
  console.log(`Listo. Total eliminados: ${total}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error purgando:', err);
  process.exit(1);
});
