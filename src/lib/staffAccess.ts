import type { StaffRole } from '../types';
import type { AdminSection } from '../components/admin/AdminSectionPanels';

export { findStaffAccount } from './staffAccount';

/** Torre operativa de secretaría: pedidos, radios y pánico. */
export const SECRETARY_SECTIONS: AdminSection[] = [
  'dashboard',
  'solicitudes',
  'envios',
  'incidentes',
  'chats',
];

export type StaffPermission =
  | 'orders.create'
  | 'orders.view'
  | 'orders.assign'
  | 'orders.cancel'
  | 'orders.delete'
  | 'chat.send'
  | 'incidents.view'
  | 'incidents.resolve'
  | 'incidents.delete'
  | 'documents.manage';

const SECRETARY_PERMISSIONS: StaffPermission[] = [
  'orders.create',
  'orders.view',
  'chat.send',
  'incidents.view',
];

export function staffRoleOf(account?: { role?: StaffRole } | null): StaffRole {
  return account?.role === 'secretary' ? 'secretary' : 'admin';
}

export function staffCan(role: StaffRole, permission: StaffPermission): boolean {
  if (role === 'admin') return true;
  return SECRETARY_PERMISSIONS.includes(permission);
}

/** Escritura global (p. ej. borrar informes de secretaría). */
export function canStaffWrite(role: StaffRole): boolean {
  return role === 'admin';
}

export function canAccessSection(role: StaffRole, section: AdminSection | string): boolean {
  if (role === 'admin') return true;
  return SECRETARY_SECTIONS.includes(section as AdminSection);
}

export function sidebarSectionsFor(role: StaffRole): AdminSection[] {
  if (role === 'admin') {
    return [
      'dashboard',
      'solicitudes',
      'flota',
      'envios',
      'incidentes',
      'sectores',
      'rutas',
      'historial',
      'reportes',
      'nomina',
      'secretaria',
      'chats',
      'usuarios',
      'ajustes',
    ];
  }
  return SECRETARY_SECTIONS;
}
