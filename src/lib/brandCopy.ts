/** Copy pública alineada al objeto social / defensa SIC: Domiclick es software e intermediación. */
export const BRAND_TAGLINE = '¡Pídelo, págalo y relájate! Domiclick va por tu pedido.';

export const BRAND_WELCOME =
  'Tu asistente virtual para mandados y encargos locales en Villavicencio.';

export const BRAND_SUBLINE =
  'Tú lo dejas pago, Domiclick lo trae a casa. Sin convenios, sin sobrecostos.';

export const BRAND_META_DESCRIPTION =
  'Plataforma digital para recoger compras prepagadas y encargos locales en Villavicencio.';

/** Push oficiales — no cambiar redacción. */
export const PUSH_MESSAGES = {
  assigned: {
    title: '¡Tu repartidor está listo! 🚀',
    body: 'Asignamos un Domiclick para recoger tu pedido. Ya se dirige al establecimiento.',
  },
  at_origin: {
    title: 'Repartidor en el sitio 📍',
    body: 'Tu Domiclick ya está en el restaurante validando tu número de compra.',
  },
  picked_up: {
    title: '¡Pedido en camino! 🛵💨',
    body: 'Ya recogimos tu comida. Relájate, Domiclick va directo a tu ubicación.',
  },
  nearby: {
    title: '¡Estamos muy cerca! 👀',
    body: 'Tu Domiclick está a pocos minutos de tu dirección. ¡Alístate para recibirlo!',
  },
  delivered: {
    title: '¡Llegó Domiclick! 🎉',
    body: 'Tu repartidor está afuera con tu pedido. ¡Gracias por confiar en nosotros y buen provecho!',
  },
} as const;

export const INCIDENT_REASONS = [
  'Usuario no localizado',
  'Dirección incorrecta',
  'Problema con el pedido',
  'Problema con el vehículo',
  'Accidente / incidente',
  'Imposibilidad de realizar entrega',
  'Problema de acceso',
  'Otro',
] as const;
