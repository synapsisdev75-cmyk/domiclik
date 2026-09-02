import React, { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class BootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[DomiClick] Error al cargar la aplicación', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearAndReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      try {
        // Conservar sesión Auth / rol admin
        const keep: Record<string, string> = {};
        for (const k of [
          'domiclick_login_role',
          'domiclick_cleared_cache_v4',
          'domiclick_gmaps_key',
        ]) {
          const v = localStorage.getItem(k);
          if (v != null) keep[k] = v;
        }
        localStorage.clear();
        Object.entries(keep).forEach(([k, v]) => localStorage.setItem(k, v));
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    const url = new URL(window.location.href);
    url.searchParams.set('fresh', String(Date.now()));
    window.location.replace(url.toString());
  };

  render() {
    if (!this.state.error) return this.props.children;

    const msg = this.state.error.message || 'Error desconocido';
    const isChunk =
      /Failed to fetch dynamically imported module|Importing a module script failed|Load failed/i.test(
        msg
      );

    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#05080f',
          color: '#e8eef9',
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            background: '#0A1122',
            border: '1px solid #1A2D52',
            borderRadius: 16,
            padding: '1.5rem',
          }}
        >
          <h1 style={{ fontSize: '1.125rem', fontWeight: 800, marginBottom: 8 }}>
            No se pudo abrir DomiClick
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12, lineHeight: 1.5 }}>
            {isChunk
              ? 'La página no cargó por completo (archivo desactualizado en caché o conexión lenta). Prueba limpiar caché y recargar.'
              : 'Ocurrió un error al iniciar. Puede deberse al navegador, modo privado o bloqueo de datos.'}
          </p>
          <p
            style={{
              fontSize: 11,
              color: '#64748b',
              marginBottom: 16,
              wordBreak: 'break-word',
              fontFamily: 'monospace',
            }}
          >
            {msg.slice(0, 200)}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={this.handleClearAndReload}
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                border: 'none',
                background: '#FF5722',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Limpiar caché y reintentar
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                border: '1px solid #1A2D52',
                background: 'transparent',
                color: '#94a3b8',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Solo recargar
            </button>
          </div>
          <p style={{ fontSize: 10, color: '#475569', marginTop: 16 }}>
            iPhone: desactiva modo privado o usa Safari actualizado. PC: permite JavaScript y cookies
            para domiclick-ops.web.app
          </p>
        </div>
      </div>
    );
  }
}
