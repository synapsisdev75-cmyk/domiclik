const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const NAMED_DB = 'ai-studio-domiclick-84da0121-61e4-47a2-8b6c-8091bdbe34ff';

const STATUS_COPY = {
  cancelled: {
    title: 'Pedido cancelado',
    body: (code) => `Tu pedido ${code} fue cancelado. Ábrelo para ver el estado Cancelado.`,
  },
  picked_up: {
    title: 'Pedido recogido',
    body: (code) => `El repartidor ya recogió ${code} y va hacia ti.`,
  },
  at_destination: {
    title: 'El repartidor llegó',
    body: (code) => `Tu Domiclick está en el destino de ${code}. Ten listo el PIN.`,
  },
  assigned: {
    title: 'Repartidor asignado',
    body: (code) => `${code} ya tiene motorizado asignado.`,
  },
  delivered: {
    title: 'Pedido entregado',
    body: (code) => `${code} se entregó. Gracias por usar DomiClick.`,
  },
};

const googleOAuthSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');

/** Canje OAuth Google (PKCE) — usado por login en domiclick.com y ops */
exports.googleOAuthToken = onRequest(
  { cors: true, secrets: [googleOAuthSecret] },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const { clientId, code, codeVerifier, redirectUri } = req.body || {};
    if (!clientId || !code || !codeVerifier || !redirectUri) {
      res.status(400).json({ error: 'missing_oauth_fields' });
      return;
    }

    const body = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const secret = googleOAuthSecret.value();
    if (secret) body.set('client_secret', secret);

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const text = await tokenRes.text();
      res.status(tokenRes.status).set('Content-Type', 'application/json').send(text);
    } catch {
      res.status(500).json({ error: 'token_exchange_failed' });
    }
  }
);

/** Aviso al cliente (y al motorizado si se asigna) con sonido, sin duplicar el mismo evento. */
exports.notifyOrderStatus = onDocumentWritten(
  {
    document: 'orders/{orderId}',
    database: NAMED_DB,
    region: 'us-central1',
  },
  async (event) => {
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();
    if (!after) return;
    const status = String(after.status || '');
    const prev = before ? String(before.status || '') : '';
    if (!status || status === prev) return;
    const copy = STATUS_COPY[status];
    if (!copy) return;

    const db = getFirestore(NAMED_DB);
    const orderId = event.params.orderId;
    const code = String(after.trackingCode || orderId);
    const noteId = `${orderId}_${status}`;
    const noteRef = db.collection('customer_notifications').doc(noteId);
    const existed = await noteRef.get();
    if (!existed.exists) {
      await noteRef.set({
        id: noteId,
        orderId,
        trackingCode: code,
        customerUid: String(after.customerUid || ''),
        customerEmail: String(after.customerEmail || '').trim().toLowerCase(),
        kind: status,
        title: copy.title,
        body: copy.body(code),
        createdAt: new Date().toISOString(),
        read: false,
      });
    }

    const messaging = getMessaging();
    const uid = String(after.customerUid || '');
    if (uid) {
      const customer = await db.collection('customers').doc(uid).get();
      const token = customer.data()?.fcmToken;
      if (token) {
        await messaging
          .send({
            token,
            notification: { title: copy.title, body: copy.body(code) },
            android: {
              priority: 'high',
              notification: { channelId: 'domiclick_orders', sound: 'default' },
            },
            data: { orderId, trackingCode: code, kind: status },
          })
          .catch((err) => console.warn('[notifyOrderStatus] fcm cliente', err.message));
      }
    }

    if (status === 'assigned' && after.assignedDriverId) {
      const driver = await db.collection('drivers').doc(String(after.assignedDriverId)).get();
      const token = driver.data()?.fcmToken;
      if (token) {
        const vip = Boolean(after.isVip);
        await messaging
          .send({
            token,
            notification: {
              title: vip ? 'Pedido VIP asignado' : 'Nuevo pedido asignado',
              body: vip
                ? `Prioridad flash ${code}. Acepta para silenciar la alarma.`
                : `Acepta ${code} para silenciar la alarma.`,
            },
            android: {
              priority: 'high',
              notification: { channelId: 'domiclick_orders', sound: 'default' },
            },
            data: { orderId, trackingCode: code, kind: 'assigned', isVip: vip ? '1' : '0' },
          })
          .catch((err) => console.warn('[notifyOrderStatus] fcm motorizado', err.message));
      }
    }

    // Solicitud nueva (pending): avisa a motorizados disponibles en tiempo real.
    if (status === 'pending' && !before && !after.assignedDriverId) {
      if (String(after.paymentReviewStatus || '') === 'pending_review') return;
      const vip = Boolean(after.isVip);
      const driversSnap = await db
        .collection('drivers')
        .where('isActive', '==', true)
        .where('status', '==', 'approved')
        .limit(80)
        .get()
        .catch(() => null);
      if (!driversSnap) return;
      const tokens = [];
      for (const d of driversSnap.docs) {
        const token = d.data()?.fcmToken;
        if (token && typeof token === 'string') tokens.push(token);
      }
      const unique = [...new Set(tokens)].slice(0, 40);
      await Promise.all(
        unique.map((token) =>
          messaging
            .send({
              token,
              notification: {
                title: vip ? 'Solicitud VIP nueva' : 'Nueva solicitud',
                body: vip
                  ? `Pedido flash ${code} en espera de asignación.`
                  : `Pedido ${code} en espera. Mantente disponible.`,
              },
              android: {
                priority: 'high',
                notification: { channelId: 'domiclick_orders', sound: 'default' },
              },
              data: { orderId, trackingCode: code, kind: 'pending_available', isVip: vip ? '1' : '0' },
            })
            .catch((err) => console.warn('[notifyOrderStatus] fcm flota', err.message)),
        ),
      );
    }
  },
);

/** Felicitación push al transportista cuando Central aprueba su solicitud. */
exports.notifyDriverApproved = onDocumentWritten(
  {
    document: 'drivers/{driverId}',
    database: NAMED_DB,
    region: 'us-central1',
  },
  async (event) => {
    const after = event.data?.after?.data();
    const before = event.data?.before?.data();
    if (!after) return;
    const next = String(after.status || '');
    const prev = before ? String(before.status || '') : '';
    if (next !== 'approved' || prev === 'approved') return;

    const driverId = event.params.driverId;
    const name = String(after.fullName || after.name || 'Transportista').trim() || 'Transportista';
    const title = '¡Felicidades! Ya eres DomiClick';
    const body = `${name}, Central te aprobó. Abre la cabina y marca tu entrada.`;
    const createdAt = new Date().toISOString();

    const db = getFirestore(NAMED_DB);
    const noteId = `driver_approved_${driverId}`;
    await db
      .collection('driver_notifications')
      .doc(noteId)
      .set(
        {
          id: noteId,
          driverId,
          email: String(after.email || '').trim().toLowerCase(),
          kind: 'approved',
          title,
          body,
          createdAt,
          read: false,
        },
        { merge: true },
      )
      .catch((err) => console.warn('[notifyDriverApproved] note', err.message));

    let token = after.fcmToken;
    if (!token && after.userId) {
      const customer = await db.collection('customers').doc(String(after.userId)).get();
      token = customer.data()?.fcmToken;
    }
    if (!token || typeof token !== 'string') {
      console.warn('[notifyDriverApproved] sin fcmToken', driverId);
      return;
    }

    const messaging = getMessaging();
    await messaging
      .send({
        token,
        notification: { title, body },
        android: {
          priority: 'high',
          notification: { channelId: 'domiclick_orders', sound: 'default' },
        },
        data: { driverId, kind: 'driver_approved' },
      })
      .catch((err) => console.warn('[notifyDriverApproved] fcm', err.message));
  },
);

const wompiPublicKey = defineString('WOMPI_PUBLIC_KEY', { default: '' });
const wompiIntegritySecret = defineString('WOMPI_INTEGRITY_SECRET', { default: '' });
const wompiEventsSecret = defineString('WOMPI_EVENTS_SECRET', { default: '' });
const wompiPrivateKey = defineString('WOMPI_PRIVATE_KEY', { default: '' });

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || '').toLowerCase());
  const right = Buffer.from(String(b || '').toLowerCase());
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function pickPath(obj, path) {
  return String(path || '')
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function wompiApiBase(privateKey) {
  return String(privateKey || '').startsWith('prv_test')
    ? 'https://sandbox.wompi.co/v1'
    : 'https://production.wompi.co/v1';
}

/** Query de Web Checkout: las llaves con ":" no se percent-encodean (Wompi las exige así). */
function wompiCheckoutUrl(params) {
  const key = String(params.publicKey || '').trim();
  if (!/^pub_(test|prod)_/i.test(key)) {
    throw new Error('invalid_public_key');
  }
  const pairs = [
    ['public-key', key],
    ['currency', 'COP'],
    ['amount-in-cents', String(params.amountInCents)],
    ['reference', params.reference],
    ['redirect-url', params.redirectUrl],
    ['signature:integrity', params.signature],
  ];
  if (params.email) pairs.push(['customer-data:email', params.email]);
  if (params.fullName) pairs.push(['customer-data:full-name', params.fullName]);
  const phone = digitsOnly(params.phone);
  if (phone.length >= 10) {
    pairs.push(['customer-data:phone-number', phone.slice(-10)]);
  }
  const qs = pairs
    .map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`)
    .join('&');
  return `https://checkout.wompi.co/p/?${qs}`;
}

async function createWompiPaymentLink(params) {
  const privateKey = String(params.privateKey || '').trim();
  if (!/^prv_(test|prod)_/i.test(privateKey)) return null;
  const res = await fetch(`${wompiApiBase(privateKey)}/payment_links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${privateKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `DomiClick ${params.trackingCode}`.slice(0, 80),
      description: `Domicilio ${params.trackingCode}`.slice(0, 180),
      single_use: true,
      collect_shipping: false,
      currency: 'COP',
      amount_in_cents: params.amountInCents,
      redirect_url: params.redirectUrl,
      sku: params.reference,
    }),
  });
  const json = await res.json().catch(() => ({}));
  const id = String(json.data?.id || '').trim();
  if (!res.ok || !id) {
    console.warn('[wompi] payment_link', res.status, json.error || json);
    return null;
  }
  return { id, url: `https://checkout.wompi.co/l/${id}` };
}

function sendCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

/** Firma el checkout de Wompi. El secreto de integridad no sale del servidor. */
exports.createWompiCheckout = onRequest({ cors: true, region: 'us-central1' }, async (req, res) => {
  sendCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const publicKey = String(wompiPublicKey.value() || '').trim();
  const integrity = String(wompiIntegritySecret.value() || '').trim();
  const privateKey = String(wompiPrivateKey.value() || '').trim();
  if (
    (!publicKey || !integrity || publicKey === 'undefined' || !/^pub_(test|prod)_/i.test(publicKey)) &&
    !/^prv_(test|prod)_/i.test(privateKey)
  ) {
    res.status(503).json({ error: 'wompi_not_configured' });
    return;
  }

  const orderId = String(req.body?.orderId || '').trim();
  if (!orderId) {
    res.status(400).json({ error: 'missing_order' });
    return;
  }

  const db = getFirestore(NAMED_DB);
  const snap = await db.collection('orders').doc(orderId).get();
  if (!snap.exists) {
    res.status(404).json({ error: 'order_not_found' });
    return;
  }
  const order = snap.data() || {};
  if (String(order.paymentMethod || '') !== 'transferencia') {
    res.status(400).json({ error: 'not_transfer_order' });
    return;
  }
  if (String(order.paymentReviewStatus || '') === 'approved') {
    res.status(409).json({ error: 'already_paid', trackingCode: order.trackingCode });
    return;
  }

  const amountCop = Math.round(Number(order.shippingFee || order.routePrice || 0));
  if (amountCop < 1000) {
    res.status(400).json({ error: 'invalid_amount' });
    return;
  }
  const amountInCents = amountCop * 100;
  const reference = `${orderId}__${Date.now()}`;
  const trackingCode = String(order.trackingCode || orderId);
  const origin = String(req.body?.returnOrigin || 'https://gen-lang-client-0954482957.web.app').replace(/\/$/, '');
  const redirectUrl = `${origin}/seguimiento/${encodeURIComponent(trackingCode)}?pago=1`;

  const link = await createWompiPaymentLink({
    privateKey,
    amountInCents,
    redirectUrl,
    trackingCode,
    reference,
  });

  let checkoutUrl = link?.url || '';
  if (!checkoutUrl && publicKey && integrity && /^pub_(test|prod)_/i.test(publicKey)) {
    const signature = sha256Hex(`${reference}${amountInCents}COP${integrity}`);
    checkoutUrl = wompiCheckoutUrl({
      publicKey,
      amountInCents,
      reference,
      redirectUrl,
      signature,
      email: String(order.customerEmail || '').trim().toLowerCase(),
      fullName: String(order.customerName || '').trim(),
      phone: String(order.customerPhone || ''),
    });
  }
  if (!checkoutUrl) {
    res.status(503).json({ error: 'wompi_not_configured' });
    return;
  }

  const now = new Date().toISOString();
  await snap.ref.set(
    {
      paymentGateway: 'wompi',
      paymentReference: reference,
      paymentLinkId: link?.id || '',
      paymentCheckoutUrl: checkoutUrl,
      paymentGatewayStatus: 'pending',
      transferChannel: 'pasarela',
      paymentReviewStatus: 'pending_review',
      updatedAt: now,
    },
    { merge: true },
  );

  res.json({
    ok: true,
    checkoutUrl,
    reference,
    amountInCents,
    trackingCode,
  });
});

/** Webhook Wompi: si el pago queda APPROVED, el pedido entra en circulación. */
exports.wompiWebhook = onRequest({ cors: false, region: 'us-central1' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const eventsSecret = wompiEventsSecret.value().trim();
  if (!eventsSecret) {
    res.status(503).json({ error: 'wompi_not_configured' });
    return;
  }

  const event = req.body || {};
  const properties = Array.isArray(event.signature?.properties) ? event.signature.properties : [];
  const timestamp = event.timestamp;
  const given =
    req.get('X-Event-Checksum') || event.signature?.checksum || '';
  const values = properties.map((path) => pickPath(event.data, path)).join('');
  const calc = sha256Hex(`${values}${timestamp}${eventsSecret}`);
  if (!safeEqual(calc, given)) {
    res.status(401).json({ error: 'invalid_signature' });
    return;
  }

  const tx = event.data?.transaction || {};
  const status = String(tx.status || '').toUpperCase();
  const reference = String(tx.reference || '');
  const linkId = String(tx.payment_link_id || tx.payment_link?.id || '').trim();
  const fromRef = reference.includes('__') ? reference.split('__')[0] : '';

  const db = getFirestore(NAMED_DB);
  let snap = fromRef ? await db.collection('orders').doc(fromRef).get() : null;
  if (!snap || !snap.exists) {
    if (linkId) {
      const byLink = await db
        .collection('orders')
        .where('paymentLinkId', '==', linkId)
        .limit(1)
        .get();
      snap = byLink.empty ? null : byLink.docs[0];
    }
  }
  if ((!snap || !snap.exists) && reference) {
    const byRef = await db
      .collection('orders')
      .where('paymentReference', '==', reference)
      .limit(1)
      .get();
    snap = byRef.empty ? null : byRef.docs[0];
  }
  if (!snap || !snap.exists) {
    res.status(200).json({ ok: true, ignored: 'missing_order' });
    return;
  }
  const ref = snap.ref;
  const orderId = snap.id;
  const order = snap.data() || {};
  const amountCop = Math.round(Number(order.shippingFee || order.routePrice || 0));
  const expectedCents = amountCop * 100;
  const paidCents = Number(tx.amount_in_cents || 0);
  const now = new Date().toISOString();

  if (status === 'APPROVED' && paidCents === expectedCents) {
    if (order.paymentReviewStatus !== 'approved') {
      await ref.set(
        {
          paymentReviewStatus: 'approved',
          paymentReviewedAt: now,
          paymentReviewedBy: 'wompi',
          paymentGateway: 'wompi',
          paymentGatewayStatus: 'APPROVED',
          paymentTransactionId: String(tx.id || ''),
          paymentReference: reference,
          transferChannel: 'pasarela',
          amountPaid: amountCop,
          payments: FieldValue.arrayUnion({
            id: String(tx.id || reference),
            at: now,
            amount: amountCop,
            method: 'transferencia',
            channel: 'pasarela',
            status: 'approved',
            source: 'wompi',
            transactionId: String(tx.id || ''),
          }),
          updatedAt: now,
          timeline: FieldValue.arrayUnion({
            at: now,
            to: 'pending',
            byRole: 'gateway',
            byName: 'Wompi',
            note: 'Pago confirmado por pasarela · solicitud en circulación',
          }),
        },
        { merge: true },
      );
      const code = String(order.trackingCode || orderId);
      const noteId = `${orderId}_payment_approved`;
      await db
        .collection('customer_notifications')
        .doc(noteId)
        .set(
          {
            id: noteId,
            orderId,
            trackingCode: code,
            customerUid: String(order.customerUid || ''),
            customerEmail: String(order.customerEmail || '').trim().toLowerCase(),
            kind: 'payment_approved',
            title: 'Pago confirmado',
            body: `El pago de ${code} quedó aprobado. Central ya puede asignar Domiclick.`,
            createdAt: now,
            read: false,
          },
          { merge: true },
        );
    }
  } else if (status === 'APPROVED' && paidCents !== expectedCents) {
    await ref.set(
      {
        paymentGatewayStatus: 'AMOUNT_MISMATCH',
        paymentTransactionId: String(tx.id || ''),
        paymentPaidCents: paidCents,
        paymentExpectedCents: expectedCents,
        updatedAt: now,
      },
      { merge: true },
    );
  } else if (status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED') {
    await ref.set(
      {
        paymentGatewayStatus: status,
        paymentTransactionId: String(tx.id || ''),
        updatedAt: now,
      },
      { merge: true },
    );
  }

  res.status(200).json({ ok: true });
});

const UNPAID_GATEWAY_MINUTES = 20;

/** Cancela transferencias de pasarela sin pago confirmado tras 20 minutos. */
exports.autoCancelUnpaidOrders = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 120 },
  async () => {
    const db = getFirestore(NAMED_DB);
    const snap = await db.collection('orders').where('paymentReviewStatus', '==', 'pending_review').limit(80).get();
    const cutoff = Date.now() - UNPAID_GATEWAY_MINUTES * 60 * 1000;
    let cancelled = 0;
    for (const row of snap.docs) {
      const order = row.data() || {};
      if (String(order.status || '') !== 'pending') continue;
      if (String(order.transferChannel || '') !== 'pasarela') continue;
      if (order.assignedDriverId) continue;
      const created = Date.parse(order.createdAt || order.updatedAt || '');
      if (!Number.isFinite(created) || created > cutoff) continue;
      const now = new Date().toISOString();
      const code = String(order.trackingCode || row.id);
      await row.ref.set(
        {
          status: 'cancelled',
          assignedDriverId: null,
          assignedDriverName: '',
          assignedDriverPhone: '',
          deliveryConfirmCode: '',
          cancelledAt: now,
          cancelledBy: 'system',
          cancelReason: 'unpaid_timeout',
          updatedAt: now,
          timeline: FieldValue.arrayUnion({
            at: now,
            from: 'pending',
            to: 'cancelled',
            byRole: 'system',
            note: 'Cancelado automáticamente: el pago en pasarela no se confirmó a tiempo. Puedes crear un pedido nuevo.',
          }),
        },
        { merge: true },
      );
      const noteId = `${row.id}_cancelled`;
      await db
        .collection('customer_notifications')
        .doc(noteId)
        .set(
          {
            id: noteId,
            orderId: row.id,
            trackingCode: code,
            customerUid: String(order.customerUid || ''),
            customerEmail: String(order.customerEmail || '').trim().toLowerCase(),
            kind: 'cancelled',
            title: 'Pedido cancelado por falta de pago',
            body: `Tu pedido ${code} se canceló porque el pago en Wompi no se confirmó a tiempo. Puedes crear uno nuevo.`,
            createdAt: now,
            read: false,
          },
          { merge: true },
        );
      cancelled += 1;
    }
    console.info(`[autoCancelUnpaid] cerrados ${cancelled}`);
  },
);
