import type { ChatRoom } from '../../types';

export function unreadForDriver(rooms: ChatRoom[], driverId: string) {
  const room = rooms.find((item) => item.id === `chat_${driverId}` || item.driverId === driverId);
  if (!room) return 0;
  return room.unreadCountAdmin || (room.unreadByAdmin ? 1 : 0);
}

export function FleetMailState({ count }: { count: number }) {
  const unread = count > 0;
  return (
    <span
      className="fleet-mail relative inline-flex h-7 w-7 shrink-0 items-center justify-center"
      title={unread ? `${count} mensaje${count === 1 ? '' : 's'} sin leer` : 'Sin mensajes nuevos'}
    >
      {unread ? (
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
          <path
            fill="currentColor"
            d="M3.2 7.2 12 13.1l8.8-5.9v10.2A1.6 1.6 0 0 1 19.2 19H4.8a1.6 1.6 0 0 1-1.6-1.6V7.2z"
          />
          <path fill="currentColor" d="M3.4 6.1h17.2L12 12.2 3.4 6.1z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
          <path
            d="M7.2 9.4V5.8h9.6v3.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M4.2 9.2h15.6v9.4a1.2 1.2 0 0 1-1.2 1.2H5.4a1.2 1.2 0 0 1-1.2-1.2V9.2z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M4.2 9.4 12 4.2l7.8 5.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M4.4 18.2 9.6 13.4M19.6 18.2 14.4 13.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )}
      {unread ? (
        <span className="fleet-mail__badge absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black leading-none">
          {count > 9 ? '9+' : count}
        </span>
      ) : null}
    </span>
  );
}
