/**
 * Pruebas del buscador de direcciones (calles, carreras, avenidas y lugares).
 * npm run test:address
 */
import assert from 'node:assert/strict';
import {
  extractStreetFromQuery,
  formatColombianGeocodeQueries,
  isStreetSearchQuery,
  parseColombianAddress,
  viaNumberInLabel,
} from '../shared/colombianAddress.ts';
import { haversineKm } from '../shared/serviceArea.ts';
import {
  estimateLocalAddressPoint,
  matchesSearchAnchor,
  searchLocalPlaces,
} from '../client-web/src/lib/villavicencioPlaces.ts';

function check(name: string, fn: () => void) {
  fn();
  console.log('ok', name);
}

check('parse calle con nomenclatura', () => {
  const p = parseColombianAddress('Calle 15 # 20-10');
  assert.equal(p.isStreet, true);
  assert.equal(p.viaType, 'calle');
  assert.equal(p.viaNumber, '15');
  assert.equal(p.crossing, '20');
  assert.equal(p.house, '10');
  assert.equal(p.hasComplement, true);
  assert.equal(p.displayVia, 'Calle 15');
});

check('parse cra / kr / av', () => {
  assert.equal(parseColombianAddress('Cra 30').viaType, 'carrera');
  assert.equal(parseColombianAddress('Cra 30').viaNumber, '30');
  assert.equal(parseColombianAddress('kr 22 #15-20').viaType, 'carrera');
  assert.equal(parseColombianAddress('kr 22 #15-20').hasComplement, true);
  assert.equal(parseColombianAddress('Av. 40').viaType, 'avenida');
  assert.equal(parseColombianAddress('Av. 40').viaNumber, '40');
  assert.equal(parseColombianAddress('av 40').isStreet, true);
});

check('lugares no son calles', () => {
  assert.equal(isStreetSearchQuery('Unicentro'), false);
  assert.equal(isStreetSearchQuery('Hospital Departamental'), false);
  assert.equal(isStreetSearchQuery('calle'), false);
  assert.equal(isStreetSearchQuery('Calle 15'), true);
  assert.equal(isStreetSearchQuery('Carrera 39'), true);
});

check('geocode queries colombianas', () => {
  const qs = formatColombianGeocodeQueries('Calle 15 # 20-10');
  assert.ok(qs.some((q) => q.includes('Calle 15 #20-10')));
  assert.ok(qs.every((q) => q.includes('Villavicencio')));
  assert.ok(
    !qs.some((q) => /^Calle 15,\s*Villavicencio/.test(q)),
    'no debe geocodificar la vía suelta cuando hay nomenclatura',
  );
});

check('parse cruce con / dos vías / casa sin #', () => {
  const con = parseColombianAddress('Calle 15 con Carrera 20');
  assert.equal(con.viaType, 'calle');
  assert.equal(con.viaNumber, '15');
  assert.equal(con.crossing, '20');
  assert.equal(con.hasComplement, true);

  const two = parseColombianAddress('Carrera 30 Calle 15');
  assert.equal(two.viaType, 'carrera');
  assert.equal(two.viaNumber, '30');
  assert.equal(two.crossing, '15');

  const loose = parseColombianAddress('Calle 23 37k 28');
  assert.equal(loose.viaType, 'calle');
  assert.equal(loose.viaNumber, '23');
  assert.equal(loose.crossing, '37k');
  assert.equal(loose.house, '28');
});

check('extractStreetFromQuery quita ciudad', () => {
  assert.equal(
    extractStreetFromQuery('Calle 26, Villavicencio, Meta, Colombia'),
    'Calle 26',
  );
});

check('viaNumber no confunde 15 con 150 ni 30 con 30A', () => {
  assert.equal(viaNumberInLabel('calle 15', '15'), true);
  assert.equal(viaNumberInLabel('calle 150', '15'), false);
  assert.equal(viaNumberInLabel('carrera 30', '30'), true);
  assert.equal(viaNumberInLabel('carrera 30a', '30'), false);
  assert.equal(viaNumberInLabel('carrera 30a', '30a'), true);
});

check('nomenclatura no exige el # en el nombre de la vía', () => {
  assert.equal(
    matchesSearchAnchor({ label: 'Calle 15', kind: 'Calle / avenida' }, 'Calle 15 # 20-10'),
    true,
  );
  assert.equal(
    matchesSearchAnchor({ label: 'Carrera 30', kind: 'Calle / avenida' }, 'Cra 30'),
    true,
  );
  assert.equal(
    matchesSearchAnchor({ label: 'Avenida 40', kind: 'Calle / avenida' }, 'av 40'),
    true,
  );
  assert.equal(
    matchesSearchAnchor({ label: 'Carrera 30A', kind: 'Calle / avenida' }, 'Cra 30'),
    false,
  );
});

check('busqueda local de calle usa un punto cerca del centro', () => {
  const hits = searchLocalPlaces('Calle 15');
  assert.ok(hits.length > 0, 'debe haber Calle 15');
  const top = hits[0];
  assert.match(top.label, /calle 15/i);
  assert.ok(Math.abs(top.lat! - 4.142) < 0.12, `lat ${top.lat} lejos del centro`);
  assert.ok(Math.abs(top.lng! + 73.6266) < 0.15, `lng ${top.lng} lejos del centro`);
});

check('carrera y avenida locales', () => {
  const cra = searchLocalPlaces('Carrera 30');
  assert.ok(cra.some((h) => /carrera 30/i.test(h.label)));
  assert.ok(
    cra.every((h) => !/carrera 30a/i.test(h.label)),
    'Cra 30 no debe devolver Carrera 30A',
  );
  const av = searchLocalPlaces('Avenida 40');
  assert.ok(av.some((h) => /avenida 40/i.test(h.label)));
});

check('nomenclatura interpola el cruce, no el centroide de la calle', () => {
  const hits = searchLocalPlaces('Calle 15 # 20-10');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'Dirección');
  assert.match(hits[0].label, /calle 15/i);
  assert.match(hits[0].label, /#\s*20/);
  assert.equal(hits[0].precision, 'intersection');

  assert.ok(hits[0].lat != null && hits[0].lng != null);
  const cra20 = searchLocalPlaces('Carrera 20')[0];
  assert.ok(cra20?.lat != null);
  const toCraCenterPin = haversineKm(
    { lat: hits[0].lat!, lng: hits[0].lng! },
    { lat: cra20.lat!, lng: cra20.lng! },
  );
  assert.ok(
    toCraCenterPin < 1.5,
    `el cruce debe quedar en la grilla urbana cerca de Carrera 20 (${toCraCenterPin.toFixed(2)} km)`,
  );
  assert.ok(hits[0].lat! > 4.12 && hits[0].lat! < 4.16, `lat urbana ${hits[0].lat}`);
  assert.ok(hits[0].lng! < -73.60 && hits[0].lng! > -73.64, `lng urbana ${hits[0].lng}`);
});

check('estimateLocalAddressPoint usa la vía principal cerca del cruce', () => {
  const hit = estimateLocalAddressPoint('Carrera 30 # 15-20');
  assert.ok(hit);
  assert.equal(hit?.precision, 'intersection');
  assert.ok(Math.abs(hit!.lat! - 4.14) < 0.08);
  assert.ok(Math.abs(hit!.lng! + 73.63) < 0.08);
});

check('lugares locales', () => {
  const uni = searchLocalPlaces('Unicentro');
  assert.ok(uni.some((h) => /unicentro/i.test(h.label)));
  const term = searchLocalPlaces('Terminal');
  assert.ok(term.some((h) => /terminal/i.test(h.label)));
});

console.log('\nTodas las pruebas de direcciones pasaron.');
