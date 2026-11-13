import { useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { subscribeCustomerOrders } from '../lib/firebase';
import {
  alertDriverArrived,
  alertOrderCancelled,
  alertOrderPickedUp,
  unlockAlertAudio,
} from '../lib/alerts';
import { notifyKindForStatus, subscribeCustomerNotifications } from '../lib/orderNotify';

const PLAYED_KEY = 'domiclick_played_order_alerts_v1';

function readPlayed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(PLAYED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writePlayed(ids: Set<string>) {
  try {
    sessionStorage.setItem(PLAYED_KEY, JSON.stringify([...ids].slice(-80)));
  } catch {
    /* ignore */
  }
}

function showLocalNotice(title: string, body: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: `${title}:${body.slice(0, 40)}` });
  } catch {
    /* ignore */
  }
}

export function OrderStatusAlerts() {
  const { profile } = useAuth();
  const primed = useRef(false);

  useEffect(() => {
    const unlock = () => unlockAlertAudio();
    window.addEventListener('pointerdown', unlock);
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    if (typeof window !== 'undefined' && /cabina/i.test(window.location.pathname)) return;
    primed.current = false;
    const played = readPlayed();
    const unsubOrders = subscribeCustomerOrders(
      profile.uid,
      (list) => {
        if (!primed.current) {
          for (const order of list) played.add(`${order.orderId}:${order.status}`);
          writePlayed(played);
          primed.current = true;
          return;
        }
        for (const order of list) {
          const key = `${order.orderId}:${order.status}`;
          if (played.has(key)) continue;
          played.add(key);
          const kind = notifyKindForStatus(order.status);
          if (!kind) continue;
          if (kind === 'picked_up') alertOrderPickedUp();
          else if (kind === 'at_destination') alertDriverArrived();
          else if (kind === 'cancelled') alertOrderCancelled();
        }
        writePlayed(played);
      },
      profile.email,
    );

    const unsubNotes = subscribeCustomerNotifications(profile.uid, (rows) => {
      for (const row of rows) {
        const key = `note:${row.id}`;
        if (played.has(key)) continue;
        if (!primed.current) {
          played.add(key);
          continue;
        }
        played.add(key);
        if (row.kind === 'cancelled') alertOrderCancelled();
        else if (row.kind === 'picked_up') alertOrderPickedUp();
        else if (row.kind === 'at_destination') alertDriverArrived();
        showLocalNotice(row.title, row.body);
      }
      writePlayed(played);
    });

    return () => {
      unsubOrders();
      unsubNotes();
    };
  }, [profile?.uid, profile?.email]);

  return null;
}
