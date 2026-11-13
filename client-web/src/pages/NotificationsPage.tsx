import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  subscribeCustomerNotifications,
  type CustomerNotification,
} from '../lib/orderNotify';

export function NotificationsPage() {
  const { profile, signIn, loading } = useAuth();
  const [rows, setRows] = useState<CustomerNotification[]>([]);

  useEffect(() => {
    if (!profile?.uid) {
      setRows([]);
      return;
    }
    return subscribeCustomerNotifications(profile.uid, setRows);
  }, [profile?.uid]);

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
      <Link to="/" className="text-xs font-semibold text-[var(--domi-cyan)]">
        ← Inicio
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-white">Notificaciones</h1>
      <p className="mt-1 text-sm text-[var(--domi-muted)]">Novedades de tus envíos</p>

      {!profile && !loading ? (
        <div className="glass-panel mt-10 rounded-2xl px-5 py-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-[var(--domi-muted)]" />
          <p className="mt-4 text-sm text-[var(--domi-muted)]">
            Inicia sesión para ver cancelaciones, recogidas y llegadas.
          </p>
          <button type="button" className="cta-primary mt-4" onClick={() => void signIn()}>
            Entrar
          </button>
        </div>
      ) : null}

      {profile && rows.length === 0 ? (
        <div className="glass-panel mt-10 rounded-2xl px-5 py-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-[var(--domi-muted)]" />
          <p className="mt-4 text-sm text-[var(--domi-muted)]">
            Cuando cancelemos, recojan o lleguen con tu pedido, el aviso queda aquí.
          </p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <ol className="relative mt-8 space-y-0 border-l border-[var(--domi-border)] pl-5">
          {rows.map((n) => (
            <li key={n.id} className="relative pb-8 last:pb-0">
              <span className="absolute -left-[1.4rem] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[var(--domi-orange)] bg-[var(--domi-bg)]" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--domi-cyan)]">
                {n.createdAt
                  ? new Date(n.createdAt).toLocaleString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : ''}
              </p>
              <p className="mt-1 font-display text-sm font-bold text-white">{n.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--domi-muted)]">{n.body}</p>
              {n.trackingCode ? (
                <Link
                  to={`/seguimiento/${encodeURIComponent(n.trackingCode)}`}
                  className="mt-2 inline-flex text-xs font-semibold text-[var(--domi-orange)]"
                >
                  Ver {n.trackingCode} →
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
