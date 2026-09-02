import React, { useMemo, useState } from 'react';
import { MotorizadoDriver } from '../../types';
import { ChatWindow } from '../chat/ChatWindow';
import { DomiHelmetIcon } from '../ui/CustomIcons';
import { MessageSquare, Search, Radio } from 'lucide-react';
import type { StaffRole } from '../../types';

interface Props {
  drivers: MotorizadoDriver[];
  staffRole: StaffRole;
  currentEmail: string;
}

export const SecretaryChatsPanel: React.FC<Props> = ({
  drivers,
  staffRole,
  currentEmail,
}) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const approved = useMemo(
    () =>
      drivers
        .filter((d) => d.status === 'approved')
        .filter((d) => {
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          return (
            d.fullName?.toLowerCase().includes(q) ||
            d.plateNumber?.toLowerCase().includes(q) ||
            d.phone?.includes(q)
          );
        }),
    [drivers, search]
  );

  const selected =
    approved.find((d) => d.id === selectedId) || approved[0] || null;

  const chatRole = staffRole === 'secretary' ? 'secretary' : 'admin';
  const senderLabel =
    staffRole === 'secretary'
      ? `Secretaría · ${currentEmail.split('@')[0]}`
      : 'Admin DomiClick';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#142340] pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white font-display italic tracking-tight flex items-center gap-2">
            <Radio className="w-5 h-5 text-[#00E5FF]" />
            Radios y chats
          </h2>
          <p className="text-xs text-slate-400 font-tech mt-1">
            Atiende a transportistas en tiempo real · coordina con clientes vía torre
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[560px]">
        <div className="lg:col-span-4 bg-[#0A1020] border border-[#162748] rounded-2xl p-3 flex flex-col gap-2 max-h-[640px]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar motorizado…"
              className="w-full bg-[#070B16] border border-[#1a2744] rounded-xl pl-9 pr-3 py-2 text-xs text-white"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
            {approved.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">
                No hay transportistas aprobados para chat.
              </p>
            ) : (
              approved.map((drv) => {
                const active = selected?.id === drv.id;
                return (
                  <button
                    key={drv.id}
                    type="button"
                    onClick={() => setSelectedId(drv.id)}
                    className={`w-full text-left rounded-xl p-3 flex items-center gap-3 border transition ${
                      active
                        ? 'border-[#00E5FF]/50 bg-[#00E5FF]/10'
                        : 'border-[#162748] hover:border-[#00E5FF]/30'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 ${
                        drv.isActive ? 'border-[#00E676]/50' : 'border-slate-600'
                      }`}
                    >
                      {drv.photoUrl ? (
                        <img
                          src={drv.photoUrl}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <DomiHelmetIcon
                          className="w-5 h-5"
                          color={drv.isActive ? '#00E676' : '#64748b'}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">{drv.fullName}</div>
                      <div className="text-[10px] text-slate-400 font-tech">
                        {drv.plateNumber || 'Sin placa'} · {drv.isActive ? 'En línea' : 'Off'}
                      </div>
                    </div>
                    <MessageSquare className="w-4 h-4 text-[#00E5FF] shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-8">
          {selected ? (
            <ChatWindow
              chatId={`chat_${selected.id}`}
              driver={selected}
              currentRole={chatRole}
              senderName={senderLabel}
            />
          ) : (
            <div className="h-full min-h-[520px] rounded-2xl border border-dashed border-[#1a2744] bg-[#0A1020]/50 flex flex-col items-center justify-center text-center px-6">
              <MessageSquare className="w-10 h-10 text-slate-600 mb-3" />
              <p className="font-bold text-white">Selecciona un transportista</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Abre el canal de radio para atender solicitudes y coordinar entregas con la flota.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
