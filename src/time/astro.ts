// Low-precision sun & moon positions (good to a fraction of a degree for the sun, ~1° for the moon),
// plus a two-constituent tide. Enough to light a dive by the real sky over each site.

const D2R = Math.PI / 180;
const norm360 = (x: number) => ((x % 360) + 360) % 360;

export interface Body { alt: number; az: number; ra: number; dec: number; ha: number }

const daysJ2000 = (ms: number) => ms / 86400000 + 2440587.5 - 2451545.0;
const obliquity = (d: number) => (23.439 - 0.0000004 * d) * D2R;
const gmstDeg = (d: number) => norm360(280.46061837 + 360.98564736629 * d);

function eqToHorizontal(ra: number, dec: number, d: number, lat: number, lon: number): Body {
  const ha = (gmstDeg(d) + lon) * D2R - ra;
  const la = lat * D2R;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  // azimuth measured from north, clockwise
  const az = Math.atan2(-Math.sin(ha) * Math.cos(dec), Math.sin(dec) * Math.cos(la) - Math.cos(dec) * Math.sin(la) * Math.cos(ha));
  return { alt, az: (az + 2 * Math.PI) % (2 * Math.PI), ra, dec, ha };
}

export function sunEcliptic(ms: number): number {
  const d = daysJ2000(ms);
  const g = (357.529 + 0.98560028 * d) * D2R;
  const q = 280.459 + 0.98564736 * d;
  return norm360(q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
}

export function sun(ms: number, lat: number, lon: number): Body {
  const d = daysJ2000(ms), L = sunEcliptic(ms), e = obliquity(d);
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  return eqToHorizontal(ra, dec, d, lat, lon);
}

function moonEcliptic(ms: number): { lon: number; lat: number } {
  const d = daysJ2000(ms);
  const L = 218.316 + 13.176396 * d, M = (134.963 + 13.064993 * d) * D2R, F = (93.272 + 13.22935 * d) * D2R;
  return { lon: norm360(L + 6.289 * Math.sin(M)) * D2R, lat: 5.128 * Math.sin(F) * D2R };
}

export function moon(ms: number, lat: number, lon: number): Body & { illum: number; age: number } {
  const d = daysJ2000(ms), e = obliquity(d), m = moonEcliptic(ms);
  const x = Math.cos(m.lat) * Math.cos(m.lon), y = Math.cos(m.lat) * Math.sin(m.lon), z = Math.sin(m.lat);
  const ye = y * Math.cos(e) - z * Math.sin(e), ze = y * Math.sin(e) + z * Math.cos(e);
  const ra = Math.atan2(ye, x), dec = Math.asin(ze);
  const elong = m.lon - sunEcliptic(ms);
  const illum = (1 - Math.cos(elong)) / 2;
  const age = (((elong / (2 * Math.PI)) % 1) + 1) % 1 * 29.530589;
  return { ...eqToHorizontal(ra, dec, d, lat, lon), illum, age };
}

// Point on Earth with the sun overhead (for the globe's day/night terminator).
export function subsolar(ms: number): { lat: number; lon: number } {
  const d = daysJ2000(ms), L = sunEcliptic(ms), e = obliquity(d);
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  let lon = (ra / D2R - gmstDeg(d)) % 360;
  if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
  return { lat: dec / D2R, lon };
}

// Tide from the principal lunar (M2) and solar (S2) semidiurnal constituents, phased on the local
// hour angles of moon and sun; spring tides fall near new and full moon as a result.
export function tide(ms: number, lat: number, lon: number, amp: number, lag: number): { h: number; rate: number } {
  const at = (t: number) => {
    const mh = moon(t, lat, lon).ha, sh = sun(t, lat, lon).ha;
    return amp * (0.72 * Math.cos(2 * mh - lag) + 0.28 * Math.cos(2 * sh - lag));
  };
  const h = at(ms), h2 = at(ms + 600000);
  return { h, rate: (h2 - h) / 600 }; // m per second
}

export function moonPhaseName(age: number): string {
  if (age < 1.5 || age > 28) return '新月';
  if (age < 5.5) return '三日月';
  if (age < 9) return '上弦';
  if (age < 13.5) return '十三夜';
  if (age < 16.5) return '満月';
  if (age < 21) return '寝待月';
  if (age < 24) return '下弦';
  return '有明月';
}
