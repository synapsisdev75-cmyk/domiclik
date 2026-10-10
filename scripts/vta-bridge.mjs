#!/usr/bin/env node
/**
 * Puente sede VTA → DomiClick (ejemplo).
 *
 * Uso:
 *   node scripts/vta-bridge.mjs 12
 *   node scripts/vta-bridge.mjs 12 --at 2026-09-28T08:05:00-05:00
 *
 * Env:
 *   DOMICLICK_API_URL   (default http://localhost:8787)
 *   DOMICLICK_INGEST_TOKEN  o  VTA_INGEST_TOKEN
 *
 * Integra esto con el software VTA: cuando detecte una marca nueva,
 * llama este script o POST directo al endpoint.
 */
const api = (process.env.DOMICLICK_API_URL || 'http://localhost:8787').replace(/\/$/, '');
const token =
  process.env.VTA_INGEST_TOKEN ||
  process.env.DOMICLICK_INGEST_TOKEN ||
  'domiclick-dev-ingest-token';

const args = process.argv.slice(2).filter((a) => a !== '--');
const vtaUserId = args.find((a) => !a.startsWith('--'));
const atIdx = args.indexOf('--at');
const at = atIdx >= 0 ? args[atIdx + 1] : undefined;

if (!vtaUserId) {
  console.error('Uso: node scripts/vta-bridge.mjs <vtaUserId> [--at ISO]');
  process.exit(1);
}

const body = { vtaUserId, ...(at ? { at } : {}) };

const res = await fetch(`${api}/api/v1/attendance/vta-punch`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const json = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error('Error', res.status, json);
  process.exit(1);
}
console.log('OK', json);
