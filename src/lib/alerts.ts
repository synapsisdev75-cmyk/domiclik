/**
 * Alertas DomiClick — sonidos distintos + vibración (móvil).
 * Usa Web Audio API (sin archivos mp3).
 */

type AlertKind = 'delivery' | 'message' | 'assigned';

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

/** Pedido asignado (opcional): ping medio. */
export function playOrderAssignedSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 440, duration: 0.1, startAt: t, type: 'sine', gain: 0.16 });
  beep(ctx, { freq: 554.37, duration: 0.16, startAt: t + 0.12, type: 'sine', gain: 0.16 });
}

/** Vibración distinta según tipo (solo dispositivos que lo soporten). */
export function vibrateAlert(kind: AlertKind) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    if (kind === 'delivery') {
      navigator.vibrate([40, 60, 40, 60, 120]); // ritmo de éxito
    } else if (kind === 'message') {
      navigator.vibrate([80, 40, 80]); // doble pulso radio
    } else {
      navigator.vibrate([50, 30, 50]);
    }
  } catch {
    /* ignore */
  }
}

export function alertDeliveryComplete() {
  unlockAlertAudio();
  playDeliveryCompleteSound();
  vibrateAlert('delivery');
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
