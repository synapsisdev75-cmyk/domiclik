import type { AdminAccount } from '../types';

/**
 * Resuelve la ficha de torre del usuario autenticado.
 * Prefiere la cuenta activa: un doc viejo con id aleatorio no debe perderse
 * frente a un pendiente nuevo con id=email.
 */
export function findStaffAccount(
  accounts: AdminAccount[],
  email?: string | null,
  uid?: string | null
): AdminAccount | undefined {
  const em = email?.trim().toLowerCase();
  const matches = accounts.filter((a) => {
    if (em && a.email?.toLowerCase() === em) return true;
    if (uid && a.uid && a.uid === uid) return true;
    return false;
  });
  if (matches.length === 0) return undefined;
  return (
    matches.find((a) => a.status === 'active') ||
    matches.find((a) => a.status === 'pending') ||
    matches[0]
  );
}
