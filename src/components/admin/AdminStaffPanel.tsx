import React, { useState } from 'react';
import { AdminAccount } from '../../types';
import { activateAdmin, inviteAdmin, inviteStaff, revokeAdmin } from '../../lib/firebase';
import { ShieldCheck, UserPlus, Ban, CheckCircle2, Clock, FileText } from 'lucide-react';

interface Props {
  admins: AdminAccount[];
  currentAdminEmail: string;
}

export const AdminStaffPanel: React.FC<Props> = ({ admins, currentAdminEmail }) => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const pending = admins.filter((a) => a.status === 'pending');
  const active = admins.filter((a) => a.status === 'active');
  const revoked = admins.filter((a) => a.status === 'revoked');
  const me = currentAdminEmail.trim().toLowerCase();

  const roleLabel = (a: AdminAccount) =>
    a.role === 'secretary' ? 'SECRETARÍA' : 'ADMIN';

  const roleBadgeClass = (a: AdminAccount) =>
    a.role === 'secretary'
      ? 'text-[10px] text-violet-300 border-violet-500/40'
      : 'text-[10px] text-[#2B6CFF] border-[#2B6CFF]/40';

  const run = async (key: string, fn: () => Promise<void>) => {
    setError('');
    setInfo('');
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || 'No se pudo completar la acción.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#0A1020] border border-[#2B6CFF]/30 rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-black text-[#7aa2ff] font-tech uppercase flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Seguridad de administradores
        </h3>
        <p className="text-[12px] text-slate-400 leading-relaxed">
          Solo un administrador <span className="text-white font-semibold">activo</span> puede activar a otro.
          Un login con Google o correo no otorga permisos de torre de control hasta que lo apruebes aquí.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="correo.nuevo@empresa.com"
            className="flex-1 bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2.5 text-xs text-white"
          />
          <button
            type="button"
            disabled={!inviteEmail.trim() || Boolean(busy)}
            onClick={() =>
              run('invite', async () => {
                await inviteAdmin(inviteEmail, me);
                setInviteEmail('');
                setInfo('Invitación creada en estado pendiente. Actívala cuando corresponda.');
              })
            }
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#1a2744] text-xs font-bold text-slate-200"
          >
            <UserPlus className="w-3.5 h-3.5" /> Invitar admin
          </button>
          <button
            type="button"
            disabled={!inviteEmail.trim() || Boolean(busy)}
            onClick={() =>
              run('invite-activate', async () => {
                await inviteAdmin(inviteEmail, me);
                await activateAdmin(inviteEmail, me);
                setInviteEmail('');
                setInfo('Administrador invitado y activado.');
              })
            }
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2B6CFF] text-white text-xs font-black"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Activar admin
          </button>
          <button
            type="button"
            disabled={!inviteEmail.trim() || Boolean(busy)}
            onClick={() =>
              run('invite-sec', async () => {
                await inviteStaff(inviteEmail, me, 'secretary');
                setInviteEmail('');
                setInfo('Secretaría invitada en estado pendiente.');
              })
            }
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-violet-500/40 text-violet-200 text-xs font-bold"
          >
            <FileText className="w-3.5 h-3.5" /> Invitar secretaría
          </button>
          <button
            type="button"
            disabled={!inviteEmail.trim() || Boolean(busy)}
            onClick={() =>
              run('invite-sec-act', async () => {
                await inviteStaff(inviteEmail, me, 'secretary');
                await activateAdmin(inviteEmail, me);
                setInviteEmail('');
                setInfo('Secretaría invitada y activada.');
              })
            }
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-black"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Activar secretaría
          </button>
        </div>
        {error && <p className="text-[12px] text-red-400">{error}</p>}
        {info && <p className="text-[12px] text-emerald-400">{info}</p>}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-black text-amber-400 font-tech uppercase flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" /> Pendientes ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-[11px] text-slate-500">No hay solicitudes de admin o secretaría en espera.</p>
        ) : (
          pending.map((a) => (
            <div
              key={a.id}
              className="bg-[#0A1020] border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between gap-3"
            >
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                  {a.displayName || a.email}
                  <span className={`px-2 py-0.5 rounded-lg border font-tech ${roleBadgeClass(a)}`}>
                    {roleLabel(a)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-tech">
                  {a.email} · solicitado {new Date(a.requestedAt).toLocaleString('es-CO')}
                </div>
              </div>
              <button
                type="button"
                disabled={busy === a.email || a.email.toLowerCase() === me}
                onClick={() => run(a.email, () => activateAdmin(a.email, me).then(() => undefined))}
                className="text-[10px] font-black bg-[#2B6CFF] text-white px-3 py-2 rounded-xl disabled:opacity-40"
              >
                Activar
              </button>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-black text-[#00E676] font-tech uppercase">Activos ({active.length})</h3>
        {active.map((a) => (
          <div
            key={a.id}
            className="bg-[#0A1020] border border-[#162748] rounded-2xl p-3.5 flex items-center justify-between gap-3"
          >
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                {a.displayName || a.email}
                <span className={`px-2 py-0.5 rounded-lg border font-tech ${roleBadgeClass(a)}`}>
                  {roleLabel(a)}
                </span>
                {a.email.toLowerCase() === me && (
                  <span className="ml-1 text-[10px] text-[#2B6CFF]">TÚ</span>
                )}
                {a.isFounder && (
                  <span className="ml-2 text-[10px] text-amber-400">FUNDADOR</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-tech">
                {a.email}
                {a.activatedBy ? ` · activado por ${a.activatedBy}` : ''}
              </div>
            </div>
            {a.email.toLowerCase() !== me && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run(`rev-${a.email}`, () => revokeAdmin(a.email, me))}
                className="text-[10px] font-black border border-red-500/40 text-red-300 px-3 py-2 rounded-xl hover:bg-red-950/30 flex items-center gap-1"
              >
                <Ban className="w-3 h-3" /> Revocar
              </button>
            )}
          </div>
        ))}
      </div>

      {revoked.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-black text-slate-500 font-tech uppercase">Revocados ({revoked.length})</h3>
          {revoked.map((a) => (
            <div
              key={a.id}
              className="bg-[#0A1020] border border-[#162748] rounded-2xl p-3 flex items-center justify-between gap-3 opacity-80"
            >
              <div>
                <div className="text-xs font-bold text-slate-300">{a.email}</div>
                <div className="text-[10px] text-slate-500">Revocado por {a.revokedBy}</div>
              </div>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run(`re-${a.email}`, () => activateAdmin(a.email, me).then(() => undefined))}
                className="text-[10px] font-bold text-[#2B6CFF]"
              >
                Reactivar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
