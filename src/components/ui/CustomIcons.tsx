import React from 'react';

// 1. Bespoke Aerodynamic Motorizado Icon
export const DomiMotoIcon: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = '#FF5722',
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 22C4 24.2091 5.79086 26 8 26C10.2091 26 12 24.2091 12 22C12 19.7909 10.2091 18 8 18C5.79086 18 4 19.7909 4 22Z"
      stroke={color}
      strokeWidth="2.5"
    />
    <path
      d="M20 22C20 24.2091 21.7909 26 24 26C26.2091 26 28 24.2091 28 22C28 19.7909 26.2091 18 24 18C21.7909 18 20 19.7909 20 22Z"
      stroke={color}
      strokeWidth="2.5"
    />
    <path
      d="M8 22L12 14L18 14L22 22"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13 10L16 6H20"
      stroke="#00F0FF"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22 14L25 10H28"
      stroke="#00F0FF"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="24" cy="22" r="2" fill={color} />
    <circle cx="8" cy="22" r="2" fill={color} />
  </svg>
);

// 2. Bespoke Live Telemetry Radar Sweeper
export const DomiRadarIcon: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = '#00F0FF',
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="13" stroke={color} strokeWidth="2" strokeDasharray="4 2" opacity="0.6" />
    <circle cx="16" cy="16" r="8" stroke={color} strokeWidth="1.5" />
    <circle cx="16" cy="16" r="3" fill={color} />
    <path d="M16 16L25 7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <path
      d="M16 3C23.1797 3 29 8.8203 29 16"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      opacity="0.9"
    />
  </svg>
);

// 3. Bespoke Dispatch Control Tower
export const DomiTowerIcon: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = '#FF5722',
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 28L14 16H18L20 28" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <path d="M10 16L16 6L22 16" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M16 6V2" stroke="#00F0FF" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="16" cy="2" r="1.5" fill="#00F0FF" />
    <path d="M11 11H21" stroke={color} strokeWidth="2" />
    <path d="M9 28H23" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

// 4. Bespoke Express Cargo Box Icon
export const DomiCargoIcon: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = '#00E676',
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M16 4L28 10V22L16 28L4 22V10L16 4Z"
      stroke={color}
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path d="M16 4V16M16 16L28 10M16 16L4 10" stroke={color} strokeWidth="2" />
    <path d="M10 7L22 13" stroke="#FF5722" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

// 5. Bespoke Tactical Encrypted Walkie Talkie Radio
export const DomiChatRadioIcon: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = '#00F0FF',
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="10" width="14" height="18" rx="3" stroke={color} strokeWidth="2.5" />
    <path d="M13 10V4" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="19" cy="7" r="1.5" fill="#FF5722" />
    <rect x="12" y="13" width="8" height="5" rx="1" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
    <circle cx="16" cy="23" r="2.5" fill={color} />
  </svg>
);

// 6. Bespoke Telemetry Speedometer Gauge
export const DomiSpeedometerIcon: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = '#FFC107',
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M6 22C4.5 19.5 4 16.5 4.5 13.5C5.5 8.5 9.5 4.5 14.5 3.5C20.5 2.5 25.5 6.5 27 12C28 15.5 27 19.5 25 22"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    <path d="M16 18L23 10" stroke="#FF5722" strokeWidth="3" strokeLinecap="round" />
    <circle cx="16" cy="18" r="2.5" fill={color} />
  </svg>
);

// 7. Bespoke Route Network Node Icon
export const DomiRouteNodeIcon: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = '#0052FF',
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="7" cy="8" r="4" stroke={color} strokeWidth="2.5" />
    <circle cx="25" cy="12" r="4" stroke="#FF5722" strokeWidth="2.5" />
    <circle cx="16" cy="25" r="4" stroke="#00E676" strokeWidth="2.5" />
    <path d="M11 9.5L21 10.5" stroke={color} strokeWidth="2" strokeDasharray="2 2" />
    <path d="M22 15L18 22" stroke="#FF5722" strokeWidth="2" strokeDasharray="2 2" />
  </svg>
);

/** Helmet outline — fleet / rider status (matches design reference) */
export const DomiHelmetIcon: React.FC<{ className?: string; color?: string }> = ({
  className = 'w-6 h-6',
  color = '#00E676',
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M6 18c0-6 4.5-11 10-11s10 5 10 11v2H6v-2z"
      stroke={color}
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <path d="M6 20h20v3a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-3z" stroke={color} strokeWidth="2.2" />
    <path d="M10 14h4" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
    <path d="M16 7v3" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);
