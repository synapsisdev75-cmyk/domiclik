import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { findApprovedDriverByEmail } from './driverCabin';

let listenersReady = false;
let saveToken: ((token: string) => void) | null = null;

async function persistPushToken(uid: string, email: string | null | undefined, token: string) {
  const updatedAt = new Date().toISOString();
  await setDoc(
    doc(db, 'customers', uid),
    { fcmToken: token, fcmTokenUpdatedAt: updatedAt },
    { merge: true },
  );
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return;
  try {
    const driver = await findApprovedDriverByEmail(normalized);
    if (!driver) return;
    await setDoc(
      doc(db, 'drivers', driver.id),
      { fcmToken: token, fcmTokenUpdatedAt: updatedAt },
      { merge: true },
    );
  } catch (err) {
    console.warn('[push] no se guardó el token del transportista', err);
  }
}

/**
 * Pide el permiso de notificaciones en cuanto hay sesión.
 * Si ya está concedido, solo registra el token.
 */
export async function requestSessionNotificationPermission(uid: string, email?: string | null) {
  if (!Capacitor.isNativePlatform() || !uid) return;

  saveToken = (token) => {
    void persistPushToken(uid, email, token).catch((err) => {
      console.warn('[push] no se guardó el token', err);
    });
  };

  if (!listenersReady) {
    listenersReady = true;
    await PushNotifications.addListener('registration', (event) => {
      if (event.value) saveToken?.(event.value);
    });
    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registro', err);
    });
  }

  const current = await PushNotifications.checkPermissions();
  const perm =
    current.receive === 'granted' ? current : await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;
  await PushNotifications.register();
}
