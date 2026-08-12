import { WHATSAPP_URL, PHONE } from './config';

export type BotReply = {
  text: string;
  suggestions?: string[];
};

type Intent = {
  id: string;
  keywords: string[];
  reply: () => BotReply;
};

const SUGGESTIONS_DEFAULT = [
  '¿Cómo solicito?',
  'Seguimiento',
  'PIN de entrega',
  'Cobertura',
  'Hablar con Central',
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreIntent(text: string, keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    const k = normalize(kw);
    if (!k) continue;
    if (text.includes(k)) score += k.length > 6 ? 3 : 2;
  }
  return score;
}

const INTENTS: Intent[] = [
  {
    id: 'solicitar',
    keywords: [
      'solicitar',
      'pedir',
      'pedido',
      'entrega',
      'domicilio',
      'enviar',
      'formulario',
      'como pido',
      'quiero pedir',
      'nueva solicitud',
    ],
    reply: () => ({
      text:
        'Para solicitar una entrega en DomiClick: baja al formulario, escribe tu nombre, teléfono, dirección de entrega y una descripción del paquete. Al confirmar, te damos al instante un código de seguimiento (DMC-XXXX) y un PIN de 6 dígitos para la entrega.',
      suggestions: ['PIN de entrega', 'Seguimiento', 'Cobertura'],
    }),
  },
  {
    id: 'seguimiento',
    keywords: [
      'seguimiento',
      'rastreo',
      'tracking',
      'donde esta',
      'estado',
      'dmc',
      'codigo',
      'seguir',
      'consultar pedido',
    ],
    reply: () => ({
      text:
        'Puedes seguir tu pedido con el código DMC-XXXX en la página de Seguimiento (arriba en el menú o en “Consultar”). Ahí ves el estado en vivo: pendiente, asignado, en camino o entregado. Si no lo encuentras, Central te ayuda por WhatsApp.',
      suggestions: ['PIN de entrega', 'WhatsApp', '¿Cómo solicito?'],
    }),
  },
  {
    id: 'pin',
    keywords: [
      'pin',
      'codigo de entrega',
      'confirmar entrega',
      'codigo de confirmacion',
      'clave',
      'otp',
      '6 digitos',
      'repartidor pide',
    ],
    reply: () => ({
      text:
        'El PIN de entrega es un código aleatorio de 6 dígitos que te mostramos al crear el pedido y en el seguimiento. Dáselo solo al repartidor cuando llegue: sin ese PIN no puede marcar la entrega como exitosa. No lo compartas por chat con desconocidos.',
      suggestions: ['Seguimiento', 'Hablar con Central'],
    }),
  },
  {
    id: 'cobertura',
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
    ],
    reply: () => ({
      text:
        'Operamos en Villavicencio (Meta) y zonas aledañas. Si tu dirección queda lejos del centro o en un sector nuevo, escribe a Central antes de solicitar para confirmar cobertura y tiempo estimado.',
      suggestions: ['¿Cómo solicito?', 'WhatsApp', 'Horarios'],
    }),
  },
  {
    id: 'pagos',
    keywords: ['pago', 'pagar', 'precio', 'tarifa', 'cuesta', 'costo', 'efectivo', 'transferencia', 'online'],
    reply: () => ({
      text:
        'El valor del envío lo calcula Central según distancia y tipo de pedido. En esta versión el cobro se coordina con Central (efectivo o transferencia). La pasarela de pago en línea llega pronto.',
      suggestions: ['Hablar con Central', '¿Cómo solicito?'],
    }),
  },
  {
    id: 'tiempos',
    keywords: ['tiempo', 'demora', 'cuanto tarda', 'rapido', 'eta', 'minutos', 'horario', 'horarios', 'abre'],
    reply: () => ({
      text:
        'Los tiempos dependen de la zona y de la disponibilidad de motorizados. Cuando el pedido está “en camino”, el seguimiento muestra una ETA aproximada. Horarios de operación: consulta a Central por WhatsApp por si hay pico o restricción del día.',
      suggestions: ['Seguimiento', 'WhatsApp', 'Cobertura'],
    }),
  },
  {
    id: 'repartidor',
    keywords: ['repartidor', 'motorizado', 'conductor', 'quien lleva', 'asignado', 'gps'],
    reply: () => ({
      text:
        'Central asigna automáticamente al motorizado más cercano disponible. En el seguimiento verás cuando quede asignado y cuando salga en tránsito. Por seguridad no publicamos el teléfono del repartidor; si necesitas apoyo, habla con Central.',
      suggestions: ['PIN de entrega', 'Seguimiento', 'WhatsApp'],
    }),
  },
  {
    id: 'humano',
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
      text: `Con gusto te conecto con Central humana. WhatsApp: ${WHATSAPP_URL} · Teléfono: ${PHONE}. Ellos ven tu pedido en tiempo real y pueden ayudarte con cobertura, tarifas o incidencias.`,
      suggestions: ['Seguimiento', '¿Cómo solicito?'],
    }),
  },
  {
    id: 'saludo',
    keywords: ['hola', 'buenas', 'buen dia', 'buenas tardes', 'buenas noches', 'hey', 'holi'],
    reply: () => ({
      text:
        '¡Hola! Soy el asistente de DomiClick en Villavicencio. Puedo ayudarte con solicitudes, seguimiento, PIN de entrega, cobertura o pasarte con Central. ¿Qué necesitas?',
      suggestions: SUGGESTIONS_DEFAULT,
    }),
  },
  {
    id: 'gracias',
    keywords: ['gracias', 'mil gracias', 'perfecto', 'listo', 'ok', 'vale'],
    reply: () => ({
      text: '¡Con gusto! Si necesitas algo más, aquí estoy. Que tu entrega llegue a un click.',
      suggestions: ['Seguimiento', 'Hablar con Central'],
    }),
  },
];

export function getWelcomeReply(): BotReply {
  return {
    text:
      '¡Hola! Soy el asistente de DomiClick. Pregúntame por entregas, seguimiento, PIN, zonas o Central. Escribe con tus palabras — te respondo al instante.',
    suggestions: SUGGESTIONS_DEFAULT,
  };
}

export function replyToUserMessage(raw: string): BotReply {
  const text = normalize(raw);
  if (!text) {
    return {
      text: 'Escríbeme una pregunta, por ejemplo: “¿Cómo sigo mi pedido?” o “¿Cuál es el PIN?”.',
      suggestions: SUGGESTIONS_DEFAULT,
    };
  }

  let best: { intent: Intent; score: number } | null = null;
  for (const intent of INTENTS) {
    const score = scoreIntent(text, intent.keywords);
    if (score > 0 && (!best || score > best.score)) {
      best = { intent, score };
    }
  }

  if (best && best.score >= 2) {
    return best.intent.reply();
  }

  return {
    text:
      'No estoy 100% seguro de eso. Puedo ayudarte con: solicitar entrega, seguimiento DMC-XXXX, PIN de 6 dígitos, cobertura en Villavicencio, tarifas o contactar Central. También puedes tocar una sugerencia abajo.',
    suggestions: SUGGESTIONS_DEFAULT,
  };
}

/** Retraso “pensando” antes de teclear (ms). */
export function thinkingDelayMs(message: string): number {
  const base = 450;
  const extra = Math.min(900, Math.floor(message.length * 8));
  return base + extra;
}

/** Intervalo entre caracteres para efecto máquina de escribir. */
export function typeCharDelayMs(char: string, index: number): number {
  if (char === '\n') return 80;
  if ('.!?'.includes(char)) return 55 + (index % 3) * 12;
  if (',;:'.includes(char)) return 35;
  if (char === ' ') return 18;
  return 14 + (index % 5);
}
