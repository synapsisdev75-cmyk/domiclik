/**
 * Resolución de ficha admin/secretaría para la torre de control.
 * npm run test:staff
 */
import assert from 'node:assert/strict';
import { findStaffAccount } from '../src/lib/staffAccount.ts';
import type { AdminAccount } from '../src/types.ts';

function acc(
  partial: Partial<AdminAccount> & Pick<AdminAccount, 'id' | 'email' | 'status'>
): AdminAccount {
  return {
    displayName: partial.displayName || partial.email,
    requestedAt: partial.requestedAt || '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function check(name: string, fn: () => void) {
  fn();
  console.log('ok', name);
}

check('prefiere cuenta activa aunque haya un pendiente más nuevo con id=email', () => {
  const found = findStaffAccount(
    [
      acc({
        id: 'macroreal2026@gmail.com',
        email: 'macroreal2026@gmail.com',
        status: 'pending',
        requestedAt: '2026-09-03T00:00:00.000Z',
      }),
      acc({
        id: 'auto-id-founder',
        email: 'macroreal2026@gmail.com',
        status: 'active',
        uid: 'uid-1',
        requestedAt: '2026-01-01T00:00:00.000Z',
      }),
    ],
    'MacroReal2026@gmail.com',
    'uid-1'
  );
  assert.equal(found?.id, 'auto-id-founder');
  assert.equal(found?.status, 'active');
});

check('encuentra por uid si el correo no coincide', () => {
  const found = findStaffAccount(
    [acc({ id: 'x', email: 'otra@domiclick.com', status: 'active', uid: 'uid-9' })],
    'nuevo@domiclick.com',
    'uid-9'
  );
  assert.equal(found?.id, 'x');
});

check('sin coincidencia devuelve undefined', () => {
  const found = findStaffAccount(
    [acc({ id: 'x', email: 'a@b.com', status: 'active' })],
    'c@d.com',
    'uid-0'
  );
  assert.equal(found, undefined);
});

check('si solo hay pendiente, lo usa', () => {
  const found = findStaffAccount(
    [acc({ id: 'p', email: 'sec@domiclick.com', status: 'pending', role: 'secretary' })],
    'sec@domiclick.com'
  );
  assert.equal(found?.status, 'pending');
});

console.log('staff account tests passed');
