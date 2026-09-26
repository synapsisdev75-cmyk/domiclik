import { WHATSAPP_URL, PHONE } from './config';

export type BotReply = {
  text: string;
  suggestions?: string[];
};

type Intent = {
  id: string;
  /** Peso base al ganar (desempate). */
  weight: number;
  keywords: string[];
  /** Frases exactas / casi exactas (más peso). */
  phrases?: string[];
  reply: () => BotReply;
};

const SUGGESTIONS_DEFAULT = [
  '¿Cómo solicito?',
  'Seguimiento',
  'Quiénes somos',
  'Cómo lo hacemos',
  'PIN de entrega',
  'Hablar con Central',
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreIntent(text: string, intent: Intent): number {
  let score = 0;
  for (const phrase of intent.phrases || []) {
    const p = normalize(phrase);
    if (p && text.includes(p)) score += 12 + Math.min(8, p.length / 4);
  }
  for (const kw of intent.keywords) {
    const k = normalize(kw);
    if (!k) continue;
    if (text === k) score += 8;
    else if (text.includes(k)) score += k.length >= 8 ? 4 : k.length >= 5 ? 3 : 2;
  }
  if (score > 0) score += intent.weight;
  return score;
}

const GUIDE_SOLICITAR = [
  'Guía paso a paso para solicitar una entrega en DomiClick:',
  '',
  '1) Entra a “Solicitar” (o baja al formulario en la web).',
  '2) Marca en el mapa el punto A (recolección) y el punto B (entrega), o búscalos por dirección / lugar.',
  '3) Completa complemento si aplica (mz, casa, apto, torre, referencia).',
  '4) Indica fecha/hora, factura u orden si la tienes, y forma de pago.',
  '5) Confirma la solicitud.',
  '',
  'Al instante recibes un código DMC-XXXX y un PIN de 6 dígitos. Guárdalos: el PIN se lo das solo al repartidor al recibir.',
].join('\n');

const GUIDE_SEGUIMIENTO = [
  'Guía de seguimiento de tu pedido:',
  '',
  '1) Toca “Seguir pedido” en el menú (o escribe tu código aquí / en Seguimiento).',
  '2) Ingresa el código DMC-XXXX que te dimos al crear el pedido.',
  '3) Verás el estado en vivo: pendiente → asignado → en camino → entregado.',
  '4) Cuando el repartidor llegue, dale el PIN de 6 dígitos para confirmar la entrega.',
  '',
  'Si no encuentras el código o el estado no avanza, Central te ayuda por WhatsApp.',
].join('\n');

const QUIENES_SOMOS = [
  'Somos DomiClick: plataforma local de domicilios y encargos en Villavicencio (Meta).',
  '',
  'Conectamos a quien necesita enviar o recibir algo con motorizados cercanos, con mapa en vivo, código de seguimiento y PIN de seguridad en la entrega.',
  '',
  'Nuestra promesa: excelencia a un click de ti — claro, cercano y sin misterio.',
].join('\n');

const COMO_LO_HACEMOS = [
  'Así funciona DomiClick (cómo lo hacemos):',
  '',
  '1) Tú defines recolección (A) y entrega (B) en el mapa o por búsqueda.',
  '2) Calculamos ruta y tarifa por distancia (con mínimos y ajustes de hora pico).',
  '3) Confirmas el pedido: se genera DMC-XXXX + PIN de 6 dígitos.',
  '4) Central asigna al motorizado disponible más cercano.',
  '5) Sigues el estado en vivo hasta la entrega; el PIN cierra el ciclo con seguridad.',
  '',
  'Si algo se sale del mapa, Central humana te acompaña por WhatsApp o llamada.',
].join('\n');

const INTENTS: Intent[] = [
  {
    id: 'solicitar',
    weight: 4,
    phrases: [
      'como solicito',
      'como pido',
      'como pedir',
      'como realizar un pedido',
      'como hacer un pedido',
      'paso a paso',
      'guia de pedido',
      'guia para pedir',
      'quiero solicitar',
      'nueva solicitud',
    ],
    keywords: [
      'solicitar',
      'pedir',
      'pedido',
      'entrega',
      'domicilio',
      'enviar',
      'formulario',
      'guia',
      'pasos',
      'instrucciones',
      'tutorial',
    ],
    reply: () => ({
      text: GUIDE_SOLICITAR,
      suggestions: ['Seguimiento', 'Cómo lo hacemos', 'PIN de entrega', 'Cobertura'],
    }),
  },
  {
    id: 'seguimiento',
    weight: 5,
    phrases: [
      'seguir pedido',
      'donde esta mi pedido',
      'estado del pedido',
      'consultar pedido',
      'guia de seguimiento',
      'como hago seguimiento',
      'como sigo mi pedido',
    ],
    keywords: [
      'seguimiento',
      'rastreo',
      'tracking',
      'donde esta',
      'estado',
      'dmc',
      'codigo',
      'seguir',
      'rastrear',
    ],
    reply: () => ({
      text: GUIDE_SEGUIMIENTO,
      suggestions: ['PIN de entrega', '¿Cómo solicito?', 'Hablar con Central'],
    }),
  },
  {
    id: 'quienes_somos',
    weight: 6,
    phrases: [
      'quienes somos',
      'quien son',
      'quien es domiclick',
      'que es domiclick',
      'acerca de',
      'sobre ustedes',
      'sobre domiclick',
    ],
    keywords: [
      'quienes',
      'nosotros',
      'empresa',
      'marca',
      'historia',
      'mision',
      'vision',
      'identidad',
    ],
    reply: () => ({
      text: QUIENES_SOMOS,
      suggestions: ['Cómo lo hacemos', '¿Cómo solicito?', 'Cobertura'],
    }),
  },
  {
    id: 'como_lo_hacemos',
    weight: 6,
    phrases: [
      'como lo hacemos',
      'como funciona',
      'como operan',
      'como trabajan',
      'proceso de entrega',
      'flujo del pedido',
      'como es el servicio',
    ],
    keywords: [
      'funcionamiento',
      'proceso',
      'operacion',
      'metodologia',
      'sistema',
      'plataforma',
      'asignacion',
    ],
    reply: () => ({
      text: COMO_LO_HACEMOS,
      suggestions: ['¿Cómo solicito?', 'Seguimiento', 'PIN de entrega'],
    }),
  },
  {
    id: 'pin',
    weight: 5,
    phrases: ['pin de entrega', 'codigo de entrega', 'codigo de 6', '6 digitos'],
    keywords: [
      'pin',
      'confirmar entrega',
      'codigo de confirmacion',
      'clave',
      'otp',
      'repartidor pide',
    ],
    reply: () => ({
      text:
        'El PIN de entrega es un código aleatorio de 6 dígitos.\n\n• Te lo mostramos al crear el pedido y en Seguimiento.\n• Dáselo solo al repartidor cuando llegue.\n• Sin ese PIN no puede marcar la entrega como exitosa.\n\nNo lo compartas por chat con desconocidos.',
      suggestions: ['Seguimiento', '¿Cómo solicito?', 'Hablar con Central'],
    }),
  },
  {
    id: 'cobertura',
    weight: 3,
    phrases: ['zona de cobertura', 'donde llegan', 'areas de servicio'],
    keywords: [
      'zona',
      'zonas',
      'cobertura',
      'llega',
      'villavicencio',
      'meta',
      'barrio',
      'ciudad',
      'area',
      'aledanas',
    ],
    reply: () => ({
      text:
        'Cobertura DomiClick:\n\n• Villavicencio (casco urbano) y barrios aledaños.\n• Restrepo, Acacías, Cumaral y corredor hacia Puerto López (según disponibilidad).\n\nEl mapa del pedido valida la zona al instante. Si dudas de un sector nuevo, escribe a Central antes de confirmar.',
      suggestions: ['¿Cómo solicito?', 'Cómo lo hacemos', 'WhatsApp'],
    }),
  },
  {
    id: 'pagos',
    weight: 3,
    phrases: ['cuanto cuesta', 'como pago', 'tarifa por km'],
    keywords: [
      'pago',
      'pagar',
      'precio',
      'tarifa',
      'cuesta',
      'costo',
      'efectivo',
      'transferencia',
      'online',
      'kilometro',
      'km',
    ],
    reply: () => ({
      text:
        'Tarifas DomiClick:\n\n• $2.300 COP por kilómetro (mínimo $5.000).\n• Hora pico: ×1.35.\n• Puedes programar la entrega hasta 15 días adelante.\n• Formas de pago según lo que elijas en el formulario (p. ej. efectivo al recibir).\n\nLa cotización exacta la ves en el mapa al marcar A y B.',
      suggestions: ['¿Cómo solicito?', 'Hablar con Central'],
    }),
  },
  {
    id: 'tiempos',
    weight: 2,
    phrases: ['cuanto tarda', 'en cuanto llega'],
    keywords: [
      'tiempo',
      'demora',
      'rapido',
      'eta',
      'minutos',
      'horario',
      'horarios',
      'abre',
    ],
    reply: () => ({
      text:
        'Los tiempos dependen de la zona y de motorizados disponibles.\n\nCuando el pedido está “en camino”, el seguimiento muestra una ETA aproximada. Para horarios del día o picos, Central te confirma por WhatsApp.',
      suggestions: ['Seguimiento', 'WhatsApp', 'Cobertura'],
    }),
  },
  {
    id: 'repartidor',
    weight: 2,
    keywords: ['repartidor', 'motorizado', 'conductor', 'quien lleva', 'asignado', 'gps'],
    reply: () => ({
      text:
        'Central asigna al motorizado más cercano disponible.\n\nEn Seguimiento verás cuando quede asignado y cuando salga en tránsito. Por seguridad no publicamos el teléfono del repartidor; si necesitas apoyo, habla con Central.',
      suggestions: ['PIN de entrega', 'Seguimiento', 'WhatsApp'],
    }),
  },
  {
    id: 'humano',
    weight: 4,
    phrases: ['hablar con central', 'hablar con alguien', 'atencion humana'],
    keywords: [
      'humano',
      'persona',
      'central',
      'whatsapp',
      'llamar',
      'telefono',
      'asesor',
      'ayuda real',
      'hablar',
      'soporte',
    ],
    reply: () => ({
      text: `Te conecto con Central humana.\n\nWhatsApp: ${WHATSAPP_URL}\nTeléfono: ${PHONE}\n\nEllos ven tu pedido en tiempo real y te ayudan con cobertura, tarifas o incidencias.`,
      suggestions: ['Seguimiento', '¿Cómo solicito?'],
    }),
  },
  {
    id: 'saludo',
    weight: 1,
    keywords: ['hola', 'buenas', 'buen dia', 'buenas tardes', 'buenas noches', 'hey', 'holi'],
    reply: () => ({
      text:
        '¡Hola! Soy el asistente de DomiClick en Villavicencio.\n\nPuedo darte guías paso a paso: cómo solicitar, seguimiento, quiénes somos, cómo lo hacemos, PIN, cobertura o pasarte con Central.',
      suggestions: SUGGESTIONS_DEFAULT,
    }),
  },
  {
    id: 'gracias',
    weight: 1,
    keywords: ['gracias', 'mil gracias', 'perfecto', 'listo', 'ok', 'vale'],
    reply: () => ({
      text: '¡Con gusto! Si necesitas otra guía (pedido, seguimiento o cómo trabajamos), aquí estoy.',
      suggestions: ['¿Cómo solicito?', 'Seguimiento', 'Cómo lo hacemos'],
    }),
  },
];

export function getWelcomeReply(): BotReply {
  return {
    text:
      '¡Hola! Soy el asistente de DomiClick.\n\nPregúntame con tus palabras: guía para pedir, seguimiento, quiénes somos, cómo lo hacemos, PIN o Central. También puedes tocar una sugerencia.',
    suggestions: SUGGESTIONS_DEFAULT,
  };
}

export function replyToUserMessage(raw: string): BotReply {
  const text = normalize(raw);
  if (!text) {
    return {
      text: 'Escríbeme una pregunta, por ejemplo: “¿Cómo solicito?” o “¿Cómo hago seguimiento?”.',
      suggestions: SUGGESTIONS_DEFAULT,
    };
  }

  // Atajos de chips / botones (match fuerte)
  if (/como solicito|realizar un pedido|hacer un pedido|guia.*(pedir|pedido|solicitud)/.test(text)) {
    return INTENTS.find((i) => i.id === 'solicitar')!.reply();
  }
  if (/seguimiento|seguir pedido|rastreo|tracking|dmc\s*\w*/.test(text) && !/pin/.test(text)) {
    return INTENTS.find((i) => i.id === 'seguimiento')!.reply();
  }
  if (/quienes somos|quien es|que es domiclick|acerca de|sobre ustedes/.test(text)) {
    return INTENTS.find((i) => i.id === 'quienes_somos')!.reply();
  }
  if (/como lo hacemos|como funciona|como operan|proceso/.test(text)) {
    return INTENTS.find((i) => i.id === 'como_lo_hacemos')!.reply();
  }

  let best: { intent: Intent; score: number } | null = null;
  for (const intent of INTENTS) {
    const score = scoreIntent(text, intent);
    if (score > 0 && (!best || score > best.score)) {
      best = { intent, score };
    }
  }

  if (best && best.score >= 3) {
    return best.intent.reply();
  }

  return {
    text:
      'No capté del todo esa pregunta. Prueba con una guía:\n\n• ¿Cómo solicito? (paso a paso del pedido)\n• Seguimiento (cómo rastrear DMC-XXXX)\n• Quiénes somos\n• Cómo lo hacemos\n• PIN de entrega\n• Hablar con Central',
    suggestions: SUGGESTIONS_DEFAULT,
  };
}

/** Retraso “pensando” antes de teclear (ms). */
export function thinkingDelayMs(message: string): number {
  const base = 400;
  const extra = Math.min(700, Math.floor(message.length * 4));
  return base + extra;
}

/** Intervalo entre caracteres para efecto máquina de escribir. */
export function typeCharDelayMs(char: string, index: number): number {
  if (char === '\n') return 45;
  if ('.!?'.includes(char)) return 40 + (index % 3) * 8;
  if (',;:'.includes(char)) return 28;
  if (char === ' ') return 12;
  return 10 + (index % 4);
}
