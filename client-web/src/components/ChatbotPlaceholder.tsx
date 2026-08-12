import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Loader2, MessageCircle, Phone, Send, X } from 'lucide-react';
import { PHONE, WHATSAPP_URL } from '../lib/config';
import {
  getWelcomeReply,
  replyToUserMessage,
  thinkingDelayMs,
  typeCharDelayMs,
  type BotReply,
} from '../lib/domiBot';

type ChatRole = 'bot' | 'user';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  /** Mientras el bot “escribe”, el texto se revela aquí */
  streaming?: boolean;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function TypingDots() {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-[rgba(5,8,15,0.65)] px-3 py-2.5"
      aria-label="Escribiendo"
    >
      <span className="domi-bot-dot" />
      <span className="domi-bot-dot" style={{ animationDelay: '0.15s' }} />
      <span className="domi-bot-dot" style={{ animationDelay: '0.3s' }} />
    </div>
  );
}

/**
 * Asistente DomiClick.
 * El historial vive solo en memoria de React: al cerrar o recargar la pestaña se borra.
 */
export function ChatbotPlaceholder() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelId = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const streamCancelRef = useRef(false);
  const bootedRef = useRef(false);

  const scrollToEnd = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages, thinking, scrollToEnd]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    return () => {
      streamCancelRef.current = true;
    };
  }, []);

  const streamBotReply = useCallback(
    async (reply: BotReply) => {
      streamCancelRef.current = false;
      setThinking(true);
      setBusy(true);
      await new Promise((r) => window.setTimeout(r, thinkingDelayMs(reply.text)));
      if (streamCancelRef.current) {
        setThinking(false);
        setBusy(false);
        return;
      }
      setThinking(false);

      const id = uid();
      setMessages((prev) => [...prev, { id, role: 'bot', text: '', streaming: true }]);

      let built = '';
      for (let i = 0; i < reply.text.length; i++) {
        if (streamCancelRef.current) break;
        built += reply.text[i];
        const shown = built;
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, text: shown } : m)),
        );
        await new Promise((r) =>
          window.setTimeout(r, typeCharDelayMs(reply.text[i], i)),
        );
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, text: reply.text, streaming: false } : m)),
      );
      setSuggestions(reply.suggestions || []);
      setBusy(false);
      window.setTimeout(() => inputRef.current?.focus(), 40);
    },
    [],
  );

  const ensureWelcome = useCallback(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void streamBotReply(getWelcomeReply());
  }, [streamBotReply]);

  useEffect(() => {
    if (open) ensureWelcome();
  }, [open, ensureWelcome]);

  const sendUserText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setDraft('');
      setSuggestions([]);
      setMessages((prev) => [...prev, { id: uid(), role: 'user', text }]);
      await streamBotReply(replyToUserMessage(text));
    },
    [busy, streamBotReply],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendUserText(draft);
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Asistente DomiClick"
          className="glass-panel animate-fade-up flex w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-2xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.65)]"
        >
          <div className="flex items-center justify-between border-b border-[var(--domi-border)] bg-[rgba(255,87,34,0.1)] px-4 py-3">
            <div>
              <p className="font-display text-sm font-bold text-white">Asistente DomiClick</p>
              <p className="text-xs text-[var(--domi-muted)]">
                {busy ? 'Escribiendo…' : 'En línea · chat temporal'}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1.5 text-[var(--domi-muted)] hover:bg-white/5 hover:text-white"
              onClick={() => setOpen(false)}
              aria-label="Cerrar chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={listRef}
            className="flex max-h-80 min-h-[14rem] flex-col gap-2.5 overflow-y-auto px-3 py-3"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-md bg-[var(--domi-blue)] px-3 py-2 text-sm leading-relaxed text-white'
                      : 'max-w-[90%] rounded-2xl rounded-bl-md border border-[var(--domi-border)] bg-[rgba(5,8,15,0.55)] px-3 py-2 text-sm leading-relaxed text-[var(--domi-text)]'
                  }
                >
                  {m.text}
                  {m.streaming ? (
                    <span className="domi-bot-caret ml-0.5 inline-block" aria-hidden>
                      ▍
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            {thinking ? <TypingDots /> : null}
          </div>

          {suggestions.length > 0 && !busy ? (
            <div className="flex flex-wrap gap-1.5 border-t border-[var(--domi-border)] px-3 py-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-full border border-[var(--domi-border)] bg-[rgba(0,229,255,0.06)] px-2.5 py-1 text-[11px] font-semibold text-[var(--domi-cyan)] transition hover:border-[rgba(0,229,255,0.35)] hover:bg-[rgba(0,229,255,0.12)]"
                  onClick={() => void sendUserText(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <form
            onSubmit={onSubmit}
            className="flex items-center gap-2 border-t border-[var(--domi-border)] px-3 py-2.5"
          >
            <input
              ref={inputRef}
              className="field-input !py-2 text-sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Escribe tu pregunta…"
              aria-label="Mensaje al asistente"
              disabled={busy}
              maxLength={400}
            />
            <button
              type="submit"
              className="cta-primary !h-10 !w-10 shrink-0 !rounded-xl !p-0"
              disabled={busy || !draft.trim()}
              aria-label="Enviar"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>

          <div className="grid grid-cols-2 gap-2 border-t border-[var(--domi-border)] p-3">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366]/15 px-3 py-2.5 text-xs font-bold text-[#25D366] transition hover:bg-[#25D366]/25"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              WhatsApp
            </a>
            <a
              href={`tel:${PHONE}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[rgba(0,229,255,0.1)] px-3 py-2.5 text-xs font-bold text-[var(--domi-cyan)] transition hover:bg-[rgba(0,229,255,0.18)]"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              Llamar
            </a>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="cta-primary h-14 w-14 !rounded-full !p-0"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente DomiClick'}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}
