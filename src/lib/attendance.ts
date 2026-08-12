/**
 * Asistencia con biometría del móvil (WebAuthn / huella / Face ID).
 */
import type { AttendancePunchType } from '../types';

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

export type PunchIntent = AttendancePunchType;
