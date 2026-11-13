/**
 * Alertas DomiClick — sonidos distintos + vibración (móvil).
 * Usa Web Audio API (sin archivos mp3).
 */

type AlertKind =
  | 'delivery'
  | 'message'
  | 'assigned'
  | 'panic'
  | 'cancelled'
  | 'payment'
  | 'payment_paid'
  | 'payment_waiting';

export type TowerOpsToast = {
  id: string;
  kind: 'delivered' | 'cancelled';
  title: string;
  body: string;
};

const towerToastListeners = new Set<(toast: TowerOpsToast) => void>();

/** Banner visible en la torre cuando cierra un encargo. */
export function pushTowerOpsToast(input: Omit<TowerOpsToast, 'id'>) {
  const toast: TowerOpsToast = {
    ...input,
    id: `ops_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
  towerToastListeners.forEach((fn) => {
    try {
      fn(toast);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeTowerOpsToasts(fn: (toast: TowerOpsToast) => void): () => void {
  towerToastListeners.add(fn);
  return () => {
    towerToastListeners.delete(fn);
  };
}

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

/** Desbloquea audio tras el primer clic/toque (políticas del navegador). */
export function unlockAlertAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
}

function beep(
  ctx: AudioContext,
  opts: {
    freq: number;
    duration: number;
    startAt: number;
    type?: OscillatorType;
    gain?: number;
  }
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type || 'sine';
  osc.frequency.setValueAtTime(opts.freq, opts.startAt);
  const g = opts.gain ?? 0.18;
  gain.gain.setValueAtTime(0.0001, opts.startAt);
  gain.gain.exponentialRampToValueAtTime(g, opts.startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, opts.startAt + opts.duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(opts.startAt);
  osc.stop(opts.startAt + opts.duration + 0.02);
}

/** Entrega finalizada: acorde ascendente corto (éxito). */
export function playDeliveryCompleteSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 523.25, duration: 0.12, startAt: t, type: 'triangle', gain: 0.2 }); // C5
  beep(ctx, { freq: 659.25, duration: 0.12, startAt: t + 0.11, type: 'triangle', gain: 0.2 }); // E5
  beep(ctx, { freq: 783.99, duration: 0.22, startAt: t + 0.22, type: 'triangle', gain: 0.22 }); // G5
}

/** Mensaje nuevo: doble tono más grave (radio). */
export function playMessageSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 880, duration: 0.08, startAt: t, type: 'square', gain: 0.12 });
  beep(ctx, { freq: 1174.66, duration: 0.1, startAt: t + 0.1, type: 'square', gain: 0.14 });
  beep(ctx, { freq: 880, duration: 0.08, startAt: t + 0.22, type: 'square', gain: 0.12 });
}

let radioAlarm: number | null = null;

/** Suena sin parar hasta que stopRadioAlarm. */
export function startRadioAlarm() {
  unlockAlertAudio();
  if (radioAlarm != null) return;
  playMessageSound();
  radioAlarm = window.setInterval(() => playMessageSound(), 1400);
}

export function stopRadioAlarm() {
  if (radioAlarm == null) return;
  window.clearInterval(radioAlarm);
  radioAlarm = null;
}

let pendingOrderAlarm: number | null = null;
let unpaidPaymentAlarm: number | null = null;

/** Torre: suena mientras haya pedidos sin asignar detectados en esta sesión. */
export function startPendingOrderAlarm() {
  unlockAlertAudio();
  if (pendingOrderAlarm != null) return;
  playNewClientOrderSound();
  pendingOrderAlarm = window.setInterval(() => playNewClientOrderSound(), 2200);
}

export function stopPendingOrderAlarm() {
  if (pendingOrderAlarm == null) return;
  window.clearInterval(pendingOrderAlarm);
  pendingOrderAlarm = null;
}

/** True si el loop de pedidos sin asignar está activo. */
export function isPendingOrderAlarmRunning() {
  return pendingOrderAlarm != null;
}

/**
 * Sonido 1 — ticket esperando pago (pasarela/comprobante).
 * Ritmo “caja / monedas”: distinto al pedido nuevo y al pago OK.
 */
export function playUnpaidPaymentWaitingSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 740, duration: 0.09, startAt: t, type: 'square', gain: 0.2 });
  beep(ctx, { freq: 980, duration: 0.09, startAt: t + 0.12, type: 'square', gain: 0.22 });
  beep(ctx, { freq: 740, duration: 0.09, startAt: t + 0.24, type: 'square', gain: 0.2 });
  beep(ctx, { freq: 1180, duration: 0.16, startAt: t + 0.38, type: 'triangle', gain: 0.18 });
}

/** Loop mientras haya tickets en pending_review no silenciados. */
export function startUnpaidPaymentAlarm() {
  unlockAlertAudio();
  if (unpaidPaymentAlarm != null) return;
  playUnpaidPaymentWaitingSound();
  unpaidPaymentAlarm = window.setInterval(() => playUnpaidPaymentWaitingSound(), 2600);
}

export function stopUnpaidPaymentAlarm() {
  if (unpaidPaymentAlarm == null) return;
  window.clearInterval(unpaidPaymentAlarm);
  unpaidPaymentAlarm = null;
}

const mutedUnpaidIds = new Set<string>();
const unpaidMuteListeners = new Set<(tick: number) => void>();
let unpaidMuteTick = 0;

function notifyUnpaidMute() {
  unpaidMuteTick += 1;
  unpaidMuteListeners.forEach((fn) => fn(unpaidMuteTick));
}

/** Silencia la alarma de pedidos que esperan pago. */
export function muteUnpaidOrderAlarms(ids: string[]) {
  ids.forEach((id) => {
    if (id) mutedUnpaidIds.add(id);
  });
  stopUnpaidPaymentAlarm();
  notifyUnpaidMute();
}

/** Quita el silencio: vuelve a sonar el tono de “esperando pago”. */
export function unmuteUnpaidOrderAlarms(ids?: string[]) {
  if (!ids || ids.length === 0) {
    mutedUnpaidIds.clear();
  } else {
    ids.forEach((id) => mutedUnpaidIds.delete(id));
  }
  notifyUnpaidMute();
}

export function isUnpaidOrderMuted(id: string): boolean {
  return mutedUnpaidIds.has(id);
}

export function pruneUnpaidMutes(stillUnpaidIds: string[]) {
  const live = new Set(stillUnpaidIds);
  let changed = false;
  for (const id of [...mutedUnpaidIds]) {
    if (!live.has(id)) {
      mutedUnpaidIds.delete(id);
      changed = true;
    }
  }
  if (changed) notifyUnpaidMute();
}

export function subscribeUnpaidMute(callback: (tick: number) => void): () => void {
  unpaidMuteListeners.add(callback);
  return () => unpaidMuteListeners.delete(callback);
}

/** Pedido asignado (opcional): ping medio. */
export function playOrderAssignedSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 440, duration: 0.1, startAt: t, type: 'sine', gain: 0.16 });
  beep(ctx, { freq: 554.37, duration: 0.16, startAt: t + 0.12, type: 'sine', gain: 0.16 });
}

/** Botón de pánico: sirena urgente (torre de control). */
export function playPanicSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    beep(ctx, { freq: 880, duration: 0.14, startAt: t + i * 0.28, type: 'square', gain: 0.28 });
    beep(ctx, { freq: 660, duration: 0.14, startAt: t + i * 0.28 + 0.14, type: 'square', gain: 0.26 });
  }
}

/** Vibración distinta según tipo (solo dispositivos que lo soporten). */
/** Pedido nuevo del cliente (torre): tres pings claros. */
export function playNewClientOrderSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 660, duration: 0.12, startAt: t, type: 'square', gain: 0.22 });
  beep(ctx, { freq: 880, duration: 0.12, startAt: t + 0.16, type: 'square', gain: 0.24 });
  beep(ctx, { freq: 1174.66, duration: 0.18, startAt: t + 0.32, type: 'triangle', gain: 0.22 });
}

/**
 * Sonido 2 — pago confirmado (única vez).
 * Campana clara / “caja OK”, distinto al loop de esperando pago.
 */
export function playPaymentPaidSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 1046.5, duration: 0.1, startAt: t, type: 'sine', gain: 0.22 }); // C6
  beep(ctx, { freq: 1318.5, duration: 0.12, startAt: t + 0.1, type: 'triangle', gain: 0.2 }); // E6
  beep(ctx, { freq: 1568, duration: 0.2, startAt: t + 0.22, type: 'sine', gain: 0.24 }); // G6
  beep(ctx, { freq: 2093, duration: 0.28, startAt: t + 0.4, type: 'triangle', gain: 0.16 }); // C7
}

/** Fallback / cancelación de pasarela (una vez). */
export function playPaymentEventSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 1396.91, duration: 0.07, startAt: t, type: 'sine', gain: 0.2 });
  beep(ctx, { freq: 1760, duration: 0.09, startAt: t + 0.08, type: 'triangle', gain: 0.18 });
  beep(ctx, { freq: 2093, duration: 0.14, startAt: t + 0.18, type: 'sine', gain: 0.16 });
}

export function vibrateAlert(kind: AlertKind) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    if (kind === 'delivery') {
      navigator.vibrate([40, 60, 40, 60, 120]); // ritmo de éxito
    } else if (kind === 'cancelled') {
      navigator.vibrate([120, 80, 120, 80, 200]);
    } else if (kind === 'message') {
      navigator.vibrate([80, 40, 80]); // doble pulso radio
    } else if (kind === 'panic') {
      navigator.vibrate([300, 100, 300, 100, 300, 100, 500]);
    } else if (kind === 'assigned') {
      navigator.vibrate([100, 50, 100, 50, 200]);
    } else if (kind === 'payment_waiting') {
      navigator.vibrate([70, 50, 70, 50, 70]);
    } else if (kind === 'payment_paid' || kind === 'payment') {
      navigator.vibrate([40, 40, 40, 40, 160]);
    } else {
      navigator.vibrate([50, 30, 50]);
    }
  } catch {
    /* ignore */
  }
}

/** Encargo cancelado / sin éxito: tono descendente (distinto al éxito). */
export function playOrderCancelledSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 660, duration: 0.14, startAt: t, type: 'sawtooth', gain: 0.2 });
  beep(ctx, { freq: 494, duration: 0.16, startAt: t + 0.14, type: 'sawtooth', gain: 0.2 });
  beep(ctx, { freq: 370, duration: 0.28, startAt: t + 0.3, type: 'triangle', gain: 0.22 });
}

export function alertDeliveryComplete() {
  unlockAlertAudio();
  playDeliveryCompleteSound();
  vibrateAlert('delivery');
}

export function alertOrderCancelled() {
  unlockAlertAudio();
  playOrderCancelledSound();
  vibrateAlert('cancelled');
}

export function alertNewMessage() {
  unlockAlertAudio();
  playMessageSound();
  vibrateAlert('message');
}

export function alertOrderAssigned() {
  unlockAlertAudio();
  playOrderAssignedSound();
  vibrateAlert('assigned');
}

/** Torre: llegó un pedido nuevo del cliente (landing / app). */
export function alertNewClientOrder() {
  unlockAlertAudio();
  playNewClientOrderSound();
  vibrateAlert('assigned');
}

/** Torre: pago confirmado (sonido 2, una sola vez). */
export function alertPaymentPaid() {
  unlockAlertAudio();
  stopUnpaidPaymentAlarm();
  playPaymentPaidSound();
  vibrateAlert('payment_paid');
}

/** Torre: pago cancelado/rechazado/expirado en pasarela (una sola vez). */
export function alertPaymentEvent() {
  unlockAlertAudio();
  stopUnpaidPaymentAlarm();
  playPaymentEventSound();
  vibrateAlert('payment');
}

export function alertPanic() {
  unlockAlertAudio();
  playPanicSound();
  vibrateAlert('panic');
}
