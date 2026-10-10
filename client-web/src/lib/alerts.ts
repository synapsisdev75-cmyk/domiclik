/**
 * Alertas DomiClick (cabina) — Web Audio + vibración.
 */

type AlertKind = 'delivery' | 'message' | 'assigned' | 'panic';

const CABIN_SETTINGS_KEY = 'domiclick_cabin_alert_settings_v1';

export type CabinAlertSettings = {
  sound: boolean;
  vibrate: boolean;
};

export function readCabinAlertSettings(): CabinAlertSettings {
  try {
    const raw = localStorage.getItem(CABIN_SETTINGS_KEY);
    if (!raw) return { sound: true, vibrate: true };
    const parsed = JSON.parse(raw) as Partial<CabinAlertSettings>;
    return {
      sound: parsed.sound !== false,
      vibrate: parsed.vibrate !== false,
    };
  } catch {
    return { sound: true, vibrate: true };
  }
}

export function writeCabinAlertSettings(next: CabinAlertSettings): void {
  try {
    localStorage.setItem(CABIN_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
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
  },
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

/** Pedido nuevo asignado: ping medio + eco. */
export function playOrderAssignedSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 440, duration: 0.12, startAt: t, type: 'sine', gain: 0.2 });
  beep(ctx, { freq: 554.37, duration: 0.16, startAt: t + 0.14, type: 'sine', gain: 0.2 });
  beep(ctx, { freq: 659.25, duration: 0.2, startAt: t + 0.32, type: 'triangle', gain: 0.18 });
}

/** Mensaje / aceptación: doble tono tipo radio. */
export function playMessageSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  beep(ctx, { freq: 880, duration: 0.08, startAt: t, type: 'square', gain: 0.14 });
  beep(ctx, { freq: 1174.66, duration: 0.1, startAt: t + 0.1, type: 'square', gain: 0.16 });
  beep(ctx, { freq: 880, duration: 0.08, startAt: t + 0.22, type: 'square', gain: 0.14 });
}

export function vibrateAlert(kind: AlertKind) {
  if (!readCabinAlertSettings().vibrate) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    if (kind === 'message') {
      navigator.vibrate([80, 40, 80]);
    } else if (kind === 'assigned') {
      navigator.vibrate([120, 60, 120, 60, 180]);
    } else if (kind === 'panic') {
      navigator.vibrate([300, 100, 300, 100, 300]);
    } else {
      navigator.vibrate([40, 60, 40]);
    }
  } catch {
    /* ignore */
  }
}

function withSound(play: () => void) {
  if (!readCabinAlertSettings().sound) return;
  unlockAlertAudio();
  play();
}

export function alertOrderAssigned() {
  withSound(playOrderAssignedSound);
  vibrateAlert('assigned');
}

export function alertOrderAccepted() {
  withSound(playMessageSound);
  vibrateAlert('message');
}

export function alertNewMessage() {
  withSound(playMessageSound);
  vibrateAlert('message');
}

/** Aviso de cierre de turno: tono grave, una sola vez. */
export function alertShiftClose() {
  withSound(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    beep(ctx, { freq: 330, duration: 0.22, startAt: t, type: 'triangle', gain: 0.22 });
    beep(ctx, { freq: 262, duration: 0.28, startAt: t + 0.26, type: 'triangle', gain: 0.22 });
  });
  if (!readCabinAlertSettings().vibrate) return;
  try {
    navigator.vibrate?.([180, 80, 180, 80, 280]);
  } catch {
    /* ignore */
  }
}
