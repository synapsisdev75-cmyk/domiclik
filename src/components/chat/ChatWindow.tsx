import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, MotorizadoDriver } from '../../types';
import { subscribeMessages, sendChatMessage } from '../../lib/firebase';
import { alertNewMessage } from '../../lib/alerts';
import { Send, Clock, CheckCheck, Radio, Shield, Activity } from 'lucide-react';
import { DomiChatRadioIcon, DomiMotoIcon, DomiTowerIcon } from '../ui/CustomIcons';

interface ChatWindowProps {
  chatId: string;
  driver: MotorizadoDriver;
  currentRole: 'admin' | 'driver';
  senderName: string;
}

const QUICK_PRESETS = [
  '🛵 En camino al punto de recogida',
  '📍 Llegué a la dirección en Villavicencio',
  '🚦 Demora por tráfico en Av. 40',
  '✅ Paquete entregado a satisfacción',
  '⚠️ Necesito confirmación del Despacho',
];

export const ChatWindow: React.FC<ChatWindowProps> = ({
  chatId,
  driver,
  currentRole,
  senderName,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMsgIdRef = useRef<string | null>(null);
  const primedRef = useRef(false);

  useEffect(() => {
    lastMsgIdRef.current = null;
    primedRef.current = false;
    const unsubscribe = subscribeMessages(chatId, (msgs) => {
      setMessages(msgs);
      if (!msgs.length) return;
      const last = msgs[msgs.length - 1];
      if (!primedRef.current) {
        lastMsgIdRef.current = last.id;
        primedRef.current = true;
        return;
      }
      if (last.id !== lastMsgIdRef.current) {
        lastMsgIdRef.current = last.id;
        // Solo alerta si el mensaje viene del otro rol
        if (last.senderRole !== currentRole) {
          alertNewMessage();
        }
      }
    });
    return () => unsubscribe();
  }, [chatId, currentRole]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || textInput.trim();
    if (!textToSend) return;

    if (!customText) setTextInput('');

    await sendChatMessage({
      chatId,
      senderId: currentRole === 'admin' ? 'admin' : driver.id,
      senderName,
      senderRole: currentRole,
      text: textToSend,
    });
  };

  return (
    <div className="flex flex-col h-[520px] bg-[#070A12] border border-[#00F0FF]/30 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)]">
      {/* Radio Channel Header */}
      <div className="bg-[#0D1322] p-3.5 border-b border-[#1E293B] flex items-center justify-between font-mono">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={driver.photoUrl}
              alt={driver.fullName}
              className="w-10 h-10 rounded-xl object-cover border border-[#00F0FF]/50 shadow-md"
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0D1322] ${
                driver.isActive ? 'bg-[#00E676] animate-pulse' : 'bg-slate-500'
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-black text-white leading-none">{driver.fullName}</h4>
              <span className="text-[10px] bg-[#FF5722]/20 text-[#FF5722] border border-[#FF5722]/50 px-2 py-0.5 rounded font-black">
                {driver.plateNumber}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
              <span>{driver.motoModel}</span>
              <span className="text-[#00F0FF]">• FREQ 433.9MHz</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-[#0B101D] text-[#00F0FF] px-2.5 py-1 rounded-lg border border-[#00F0FF]/40 font-black flex items-center gap-1.5 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            <DomiChatRadioIcon className="w-3.5 h-3.5" color="#00F0FF" />
            <span>{currentRole === 'admin' ? 'TORRE CENTRAL' : 'PILOTO MOTO'}</span>
          </span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#050811]/90 font-mono">
        {messages.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-12 h-12 rounded-2xl bg-[#0B101D] border border-[#00F0FF]/30 flex items-center justify-center mx-auto mb-3 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
              <DomiChatRadioIcon className="w-6 h-6" color="#00F0FF" />
            </div>
            <p className="text-xs font-black text-white uppercase tracking-wider">CANAL SEGURO ENCRIPATADO READY</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Frecuencia de radio en tiempo real entre Central DomiClick y el conductor en Villavicencio.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe =
              (currentRole === 'admin' && msg.senderRole === 'admin') ||
              (currentRole === 'driver' && msg.senderRole === 'driver');

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed shadow-lg ${
                    isMe
                      ? 'bg-[#0052FF] text-white rounded-br-none border border-[#00F0FF] shadow-[0_0_15px_rgba(0,82,255,0.4)]'
                      : 'bg-[#0B101D] text-slate-100 rounded-bl-none border border-[#FF5722]/40 shadow-[0_0_15px_rgba(255,87,34,0.2)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-[10px] mb-1 opacity-80 font-black border-b border-white/10 pb-1">
                    <span>{msg.senderName}</span>
                    <span className="font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap font-sans text-xs">{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Presets */}
      <div className="bg-[#0D1322] px-3 py-2 border-t border-[#1E293B] flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono">
        <span className="text-[10px] text-[#FF5722] font-black shrink-0">RÁPIDOS:</span>
        {QUICK_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => handleSendMessage(preset)}
            className="shrink-0 bg-[#0B101D] hover:bg-[#0052FF]/30 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-[#1E293B] hover:border-[#00F0FF]/50 text-[10px] transition font-sans font-semibold"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 bg-[#070A12] border-t border-[#1E293B] flex items-center gap-2"
      >
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder={
            currentRole === 'admin'
              ? 'Transmitir comando de radio al motorizado...'
              : 'Escribir reporte radial a la Central...'
          }
          className="flex-1 bg-[#0B101D] border border-[#1E293B] rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00F0FF] transition font-sans"
        />
        <button
          type="submit"
          className="bg-[#0052FF] hover:bg-blue-600 text-white border border-[#00F0FF] px-4 py-2.5 rounded-xl text-xs font-black font-mono transition shadow-[0_0_15px_rgba(0,82,255,0.5)] flex items-center gap-1.5 shrink-0"
        >
          <span>TRANSMITIR</span>
          <Send className="w-3.5 h-3.5 text-[#00F0FF]" />
        </button>
      </form>
    </div>
  );
};

