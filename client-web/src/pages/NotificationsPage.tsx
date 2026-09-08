import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';

const DEMO = [
  {
    id: '1',
    title: 'Bienvenido a DomiClick',
    body: 'Cuando haya novedades de tus pedidos aparecerán aquí.',
    time: 'Hoy',
  },
  {
    id: '2',
    title: 'Tip de seguimiento',
    body: 'Guarda tu código DMC-… y el PIN de entrega para recibir sin demoras.',
    time: 'Guía',
  },
] as const;

export function NotificationsPage() {
  const showDemo = true;

  return (
    <div className="app-screen mx-auto min-h-[100svh] max-w-lg px-4 pb-8 sm:px-6">
      <Link to="/" className="text-xs font-semibold text-[var(--domi-cyan)]">
        ← Inicio
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-white">Notificaciones</h1>
      <p className="mt-1 text-sm text-[var(--domi-muted)]">Novedades de tus envíos</p>

      {!showDemo ? (
        <div className="glass-panel mt-10 rounded-2xl px-5 py-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-[var(--domi-muted)]" />
          <p className="mt-4 text-sm text-[var(--domi-muted)]">
            Cuando haya novedades de tus pedidos aparecerán aquí
          </p>
        </div>
      ) : (
        <ol className="relative mt-8 space-y-0 border-l border-[var(--domi-border)] pl-5">
          {DEMO.map((n) => (
            <li key={n.id} className="relative pb-8 last:pb-0">
              <span className="absolute -left-[1.4rem] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[var(--domi-orange)] bg-[var(--domi-bg)]" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--domi-cyan)]">
                {n.time}
              </p>
              <p className="mt-1 font-display text-sm font-bold text-white">{n.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--domi-muted)]">{n.body}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
