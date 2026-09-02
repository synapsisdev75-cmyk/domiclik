/**
 * Asistencia: WebAuthn (móvil) + PIN diario kiosco tablet (rota 07:00).
 */
import type { AttendancePunchType } from '../types';

/** Hora local (0–23) en que rota el PIN diario de sede. */
export const ATTENDANCE_PIN_RESET_HOUR = 1;

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  bytes.forEach((b) => {
    str += String.fromCharCode(b);
  });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function'
  );
}

function randomChallenge(size = 32): BufferSource {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  return buf;
}

/** Registra biometría del dispositivo y devuelve credentialId. */
export async function registerDriverBiometric(
  driverId: string,
  displayName: string
): Promise<string> {
  if (!isWebAuthnAvailable()) {
    throw new Error('Este móvil no soporta biometría WebAuthn.');
  }

  const userId = new TextEncoder().encode(driverId.slice(0, 64));
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: {
        name: 'DomiClick Asistencia',
        id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
      },
      user: {
        id: userId,
        name: `${driverId}@domiclick.local`,
        displayName: displayName || driverId,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('Registro biométrico cancelado.');
  return bufferToBase64Url(credential.rawId);
}

/** Verifica biometría registrada antes de marcar entrada/salida. */
export async function verifyDriverBiometric(credentialId: string): Promise<boolean> {
  if (!isWebAuthnAvailable()) {
    throw new Error('Este móvil no soporta biometría WebAuthn.');
  }
  if (!credentialId) {
    throw new Error('Primero registra tu huella o Face ID.');
  }

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      timeout: 60000,
      userVerification: 'required',
      allowCredentials: [
        {
          type: 'public-key',
          id: base64UrlToBuffer(credentialId),
          transports: ['internal'],
        },
      ],
    },
  });

  return Boolean(assertion);
}

/**
 * Día operativo del PIN: de 01:00 a 00:59 del día siguiente (hora local de la tablet).
 * Antes de la 01:00 sigue vigente el PIN del día calendario anterior.
 */
export function getAttendancePinDayKey(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < ATTENDANCE_PIN_RESET_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Próxima rotación del PIN (07:00 del siguiente ciclo). */
export function getAttendancePinExpiresAt(pinDayKey: string): string {
  const [y, m, d] = pinDayKey.split('-').map(Number);
  const expires = new Date(y, m - 1, d + 1, ATTENDANCE_PIN_RESET_HOUR, 0, 0, 0);
  return expires.toISOString();
}

export function generateAttendancePin(digits = 6): string {
  const max = 10 ** digits;
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % max;
  return String(n).padStart(digits, '0');
}

export function dailyPinDocId(driverId: string, pinDayKey: string): string {
  return `${pinDayKey}_${driverId}`;
}

export type PunchIntent = AttendancePunchType;
