export type RoadPoint = { lat: number; lng: number };

const M_PER_DEG = 111_320;

export function metersBetween(a: RoadPoint, b: RoadPoint) {
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dy = (b.lat - a.lat) * M_PER_DEG;
  const dx = (b.lng - a.lng) * M_PER_DEG * cos;
  return Math.hypot(dx, dy);
}

export function bearingDeg(a: RoadPoint, b: RoadPoint) {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}

/** Punto de la calle más cercano, y a cuántos metros va sobre esa línea. */
export function projectOnPath(path: RoadPoint[], point: RoadPoint) {
  if (path.length < 2) return null;
  let alongBase = 0;
  let best = {
    lat: path[0].lat,
    lng: path[0].lng,
    along: 0,
    metersOff: Infinity,
  };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      t = ((point.lng - a.lng) * dx + (point.lat - a.lat) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const lat = a.lat + dy * t;
    const lng = a.lng + dx * t;
    const off = metersBetween(point, { lat, lng });
    const seg = metersBetween(a, b);
    if (off < best.metersOff) {
      best = { lat, lng, along: alongBase + seg * t, metersOff: off };
    }
    alongBase += seg;
  }
  return best;
}

export function pointAtAlong(path: RoadPoint[], along: number): RoadPoint {
  if (!path.length) return { lat: 0, lng: 0 };
  if (along <= 0) return path[0];
  let left = along;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = metersBetween(path[i], path[i + 1]);
    if (left <= seg || i === path.length - 2) {
      const t = seg > 0 ? Math.max(0, Math.min(1, left / seg)) : 0;
      return {
        lat: path[i].lat + (path[i + 1].lat - path[i].lat) * t,
        lng: path[i].lng + (path[i + 1].lng - path[i].lng) * t,
      };
    }
    left -= seg;
  }
  return path[path.length - 1];
}

export function sliceUntil(path: RoadPoint[], along: number): RoadPoint[] {
  if (path.length < 2 || along <= 1) return [];
  const out: RoadPoint[] = [path[0]];
  let walked = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = metersBetween(path[i], path[i + 1]);
    if (walked + seg >= along) {
      out.push(pointAtAlong(path, along));
      return out;
    }
    walked += seg;
    out.push(path[i + 1]);
  }
  return out;
}

export function sliceFrom(path: RoadPoint[], along: number): RoadPoint[] {
  if (path.length < 2) return path;
  const out: RoadPoint[] = [pointAtAlong(path, along)];
  let walked = 0;
  let passed = false;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = metersBetween(path[i], path[i + 1]);
    if (walked + seg >= along) passed = true;
    walked += seg;
    if (passed) out.push(path[i + 1]);
  }
  return out;
}

export function roadSignature(path: RoadPoint[]) {
  if (path.length < 2) return '0';
  const mid = path[Math.floor(path.length / 2)];
  const end = path[path.length - 1];
  return `${path.length}:${path[0].lat.toFixed(4)},${path[0].lng.toFixed(4)}:${mid.lat.toFixed(4)}:${end.lat.toFixed(4)},${end.lng.toFixed(4)}`;
}
