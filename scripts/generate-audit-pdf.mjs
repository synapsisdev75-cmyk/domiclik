/**
 * Genera el PDF de auditoría DomiClick (matriz operativa vs código).
 * Uso: node scripts/generate-audit-pdf.mjs
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'audit');
const outPdf = path.join(outDir, 'AUDITORIA-CODIGO-DOMICLICK.pdf');

fs.mkdirSync(outDir, { recursive: true });

const doc = new PDFDocument({
  size: 'LETTER',
  margins: { top: 56, bottom: 56, left: 54, right: 54 },
  info: {
    Title: 'Auditoría de código DomiClick',
    Author: 'DomiClick · Auditoría técnica',
    Subject: 'Matriz maestra vs implementación',
  },
});

const stream = fs.createWriteStream(outPdf);
doc.pipe(stream);

const ORANGE = '#E65100';
const NAVY = '#0B1B33';
const MUTED = '#445566';
const OK = '#1B7A3D';
const PARTIAL = '#B86E00';
const MISS = '#B00020';

function stampFooter(pageNumber) {
  const { width, height } = doc.page;
  doc.fontSize(8).fillColor(MUTED);
  doc.text(
    `DomiClick · Auditoría de código · ${new Date().toLocaleDateString('es-CO')} · pág. ${pageNumber}`,
    54,
    height - 36,
    { width: width - 108, align: 'center', lineBreak: false }
  );
}

function h1(t) {
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text(t);
  doc.moveDown(0.25);
}

function h2(t) {
  doc.moveDown(0.35);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ORANGE).text(t);
  doc.moveDown(0.15);
}

function p(t, opts = {}) {
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(t, {
    align: 'justify',
    lineGap: 2,
    ...opts,
  });
  doc.moveDown(0.2);
}

function bullet(label, status, detail) {
  const color = status === 'TIENE' ? OK : status === 'PARCIAL' ? PARTIAL : MISS;
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor(color)
    .text(`[${status}] `, { continued: true })
    .fillColor(NAVY)
    .text(label);
  if (detail) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(detail, { indent: 12 });
  }
  doc.moveDown(0.12);
}

// —— Portada ——
doc.rect(0, 0, doc.page.width, 120).fill(NAVY);
doc
  .fillColor('#FFFFFF')
  .font('Helvetica-Bold')
  .fontSize(22)
  .text('AUDITORÍA DE CÓDIGO', 54, 40, { width: 500 });
doc
  .fontSize(14)
  .fillColor('#FFAB91')
  .text('DOMICLICK · Qué tenemos, qué faltaba y qué se aplicó', 54, 72);

doc.moveDown(5);
p(
  'Este documento compara los requisitos de «Estructura Operativa DomiClick» y «Matriz Maestra de Funcionalidades y Botones» con el código real del monorepo (landing de clientes + torre de operaciones). Está escrito para gerencia, operación y desarrollo.'
);
p(
  `Fecha: ${new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}. Fuentes: docs/legal (matriz y objeto social) + ESTRUCTURA OPERATIVA (Downloads) + repositorio domiclik-main.`
);

h1('1. Cómo está armado el sistema (comprensión del código)');
h2('Dos aplicaciones, una base de datos');
p(
  'Landing de clientes (carpeta client-web/): formulario de pedido, mapa, seguimiento, acceso transportista. Se publica en Firebase Hosting (sitio landing).'
);
p(
  'Torre de operaciones (carpeta src/): paneles Admin, Central y Repartidor. Se publica en Firebase Hosting (sitio ops → domiclick-ops.web.app).'
);
p(
  'Ambas escriben y leen la misma base Firestore (base con nombre dedicado del proyecto). Los pedidos del cliente llegan en vivo a la central por suscripción en tiempo real (subscribeOrders / subscribeDrivers).'
);
h2('Roles');
p(
  'Cliente: pide y rastrea. Transportista/repartidor: acepta, navega, entrega con PIN, asistencia. Admin/Central: flota, asignación, incidencias, nómina, reportes Excel, Control Supremo.'
);
h2('Mapa de carpetas útiles');
bullet('client-web/src/components/OrderForm.tsx', 'TIENE', 'Pedido cliente: ruta, factura, pago, cupón, foto.');
bullet('src/components/admin/*', 'TIENE', 'Dashboard, Control Central, flota, nómina, reportes.');
bullet('src/components/driver/*', 'TIENE', 'App operativa del motorizado.');
bullet('src/lib/adminMetrics.ts', 'TIENE', 'KPIs, ranking, índice de desempeño, Excel.');
bullet('src/lib/firebase.ts + client-web/src/lib/firebase.ts', 'TIENE', 'Auth, Firestore, Storage.');
bullet('src/lib/brandCopy.ts', 'TIENE', 'Textos oficiales (intermediario / no logística propietaria).');

h1('2. Resumen ejecutivo');
p(
  'Cobertura general estimada vs documentos maestros: ~80–85% operativo listo. Los huecos más sensibles eran indicadores de desempeño compuestos, forma de pago, foto de factura, cupones y reconocimiento del mejor repartidor. En esta auditoría se implementaron esos puntos factibles sin pasarelas de pago ni FCM nativo completo.'
);
p(
  'Marco legal/objeto social: DomiClick se presenta como software e intermediario de encargos locales (no como empresa de transporte propietaria). Se corrigió copy residual de «gestión logística inteligente» en el dashboard admin.'
);

h1('3. Matriz: qué tenemos / qué no');

h2('3.1 Perfiles y operación diaria');
bullet('Roles cliente / repartidor / admin-central', 'TIENE', 'Auth Firebase + roles en sesión.');
bullet('Estados de pedido (pending→…→delivered/cancelled)', 'TIENE', 'Timeline + PIN de entrega.');
bullet('Asignación automática y manual', 'TIENE', 'autoAssignedAt + asignación en central.');
bullet('Entrega programada (hasta 15 días)', 'TIENE', 'OrderForm + validación de ventana.');
bullet('Mapa / GPS / historial de rutas', 'TIENE', 'Ops + DriverRouteHistoryView.');
bullet('Chat admin ↔ driver', 'TIENE', 'Módulo en torre.');
bullet('Incidencias CRUD', 'TIENE', 'Panel incidencias.');
bullet('Asistencia (WebAuthn + odómetro)', 'TIENE', 'Punch in/out con foto odómetro.');
bullet('Nómina y filtros día/semana/mes', 'TIENE', 'Control Supremo + Excel.');
bullet('Encuesta de satisfacción → %', 'TIENE', 'RatingForm → KPI Satisfacción.');
bullet('Múltiples «centrales» físicas multi-sede', 'PARCIAL', 'Una operación Villavicencio; no multi-central configurable como CRM de sedes.');
bullet('Crear usuarios admin genéricos con permisos granulares', 'PARCIAL', 'Roles fijos (admin/driver/customer); no motor RBAC fino por botón.');

h2('3.2 Indicadores de la Estructura Operativa');
bullet('Tiempo de gestión (recepción → asignación)', 'TIENE', 'KPI «Gestión avg» + avgAssignMin por repartidor (timeline / autoAssignedAt).');
bullet('Índice compuesto de desempeño', 'TIENE', 'performanceIndex 0–100 (volumen, éxito, rating, cancelaciones).');
bullet('Reconocimiento «mejor del periodo»', 'TIENE', 'Banner en Control Central según índice del rango filtrado.');
bullet('% cancelación / tasa de problemas', 'TIENE', 'KPI Cancelación % en periodo.');
bullet('Satisfacción clientes', 'TIENE', 'serviceRating → Satisfacción %.');
bullet('Puntualidad estricta vs SLA prometido', 'PARCIAL', 'Hay scheduledFor y tiempos; no hay KPI «% dentro de SLA» dedicado.');
bullet('Horas conectado vs activo + km diarios dashboard', 'PARCIAL', 'Asistencia y odómetro existen; falta consolidar el KPI tripartito en un solo widget diario.');
bullet('Tasa de incidencias + tiempo medio de resolución UI', 'PARCIAL', 'Incidencias existen; KPI dedicado de tasa/resolución aún no es tarjeta fija.');
bullet('Push FCM nativo con textos oficiales', 'PARCIAL', 'Textos en brandCopy; se muestran en tracking/UI. Falta Cloud Messaging end-to-end.');
bullet('PWA/SW en landing', 'PARCIAL', 'Ops tiene public/sw.js; landing no igualada al 100%.');

h2('3.3 Comercial / cliente');
bullet('Forma de pago informativa (efectivo/transferencia/ya pagado)', 'TIENE', 'Campo paymentMethod en pedido (sin pasarela).');
bullet('Foto de factura a Storage', 'TIENE', 'Upload en OrderForm → invoicePhotoUrl.');
bullet('Cupones de descuento', 'TIENE', 'Campo cupón + colección Firestore coupons (code, active, discountPct|discountFixed).');
bullet('Programa de referidos', 'MISS', 'No implementado (queda en backlog).');
bullet('Pasarela de cobro online', 'MISS', 'Fuera de alcance actual (objeto: intermediario; pago informativo).');

h1('4. Soluciones aplicadas en esta auditoría');
p('Cambios de código entregados junto con este PDF:');
bullet('adminMetrics.ts', 'TIENE', 'performanceIndex + avgAssignMin; ranking por índice.');
bullet('AdminControlCenter.tsx', 'TIENE', 'KPIs Cancelación %, Gestión avg, banner Mejor desempeño; Excel con índice.');
bullet('AdminDashboard.tsx', 'TIENE', 'Copy alineado a intermediario / encargos locales.');
bullet('OrderForm + firebase cliente', 'TIENE', 'Pago, cupón, uploadInvoicePhoto, Storage.');
bullet('types + contracts salesIngest', 'TIENE', 'paymentMethod, couponCode, couponDiscount.');
p(
  'Cómo crear un cupón: en Firestore, documento coupons/CODIGO con campos { active: true, discountPct: 10 } o { discountFixed: 2000 }. El cliente escribe el código al pedir.'
);

h1('5. Pendientes recomendados (backlog priorizado)');
p('1) Referidos cliente→cliente. 2) KPI puntualidad vs scheduledFor. 3) Widget horas conectado/activo/km. 4) FCM real + permisos Notification. 5) PWA landing. 6) UI admin para CRUD de cupones. 7) Multi-central si se escala a otras ciudades.');

h1('6. Cómo verificar en 10 minutos');
p(
  '1) Landing: crear pedido con foto de factura + forma de pago + cupón (si hay doc en coupons). 2) Ops → Control Supremo: ver cancelación %, gestión avg y mejor desempeño. 3) Pestaña Repartidores: índice /100. 4) Exportar Excel y confirmar columnas Indice_desempeno y Gestion_avg_min.'
);

h1('7. Conclusión');
p(
  'DomiClick ya cubre el núcleo operativo de la matriz (pedido → asignación → seguimiento → entrega con PIN → reportes). Esta auditoría cerró los huecos de indicadores de desempeño, pago informativo, evidencia de factura y cupones básicos, y dejó documentado lo que sigue (referidos, FCM, SLA de puntualidad).'
);
p(
  'Documento generado automáticamente desde scripts/generate-audit-pdf.mjs. Para regenerar: node scripts/generate-audit-pdf.mjs'
);

const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i += 1) {
  doc.switchToPage(range.start + i);
  stampFooter(i + 1);
}

doc.end();

await new Promise((resolve, reject) => {
  stream.on('finish', resolve);
  stream.on('error', reject);
});

console.log('PDF escrito en:', outPdf);
