// The simulation clock and the sky it implies over the current site.
import { sun, moon, tide, moonPhaseName } from './astro';
import { smooth } from '../core/math';

export type Preset = 'dawn' | 'noon' | 'dusk' | 'night';
export const PRESET_LABEL: Record<Preset, string> = { dawn: '朝方', noon: '昼間', dusk: '夕方', night: '夜間' };
export const SPEEDS = [
  { k: 1, label: '×1', note: '実時間' },
  { k: 10, label: '×10', note: '1日 2.4時間' },
  { k: 60, label: '×60', note: '1日 24分' },
  { k: 360, label: '×360', note: '1日 4分' },
];

export const clock = {
  ms: Date.now(),
  speed: 1,
  live: true,
  offset: 0,              // whole days added to the real date when another season is chosen
  season: 'now' as Season,
  advance(dt: number) {
    if (this.live) this.ms = Date.now() + this.offset;
    else this.ms += dt * 1000 * this.speed;
  },
  goLive() { this.live = true; this.speed = 1; this.ms = Date.now() + this.offset; },
  setSpeed(k: number) { if (this.live && k === 1) return; this.live = false; this.speed = k; },
};

// Seasons: the same time of day on a date in the middle of each local season (southern seas flip).
export type Season = 'now' | 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_LABEL: Record<Season, string> = { now: '今', spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const SEASON_DATE: Record<Exclude<Season, 'now'>, [number, number]> = { spring: [4, 20], summer: [8, 10], autumn: [10, 25], winter: [2, 5] };
export function seasonOf(ms: number, lat: number, tz: number): Exclude<Season, 'now'> {
  let m = new Date(ms + tz * 3600000).getUTCMonth() + 1;
  if (lat < 0) m = ((m + 5) % 12) + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}
export function setSeason(season: Season, lat: number) {
  const real = Date.now();
  let off = 0;
  if (season !== 'now') {
    let [m, d] = SEASON_DATE[season];
    if (lat < 0) m = ((m + 5) % 12) + 1;
    const now = new Date(real), tod = real - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let best = 0, bd = Infinity;
    for (const y of [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      const t = Date.UTC(y, m - 1, d) + tod;
      if (Math.abs(t - real) < bd) { bd = Math.abs(t - real); best = t - real; }
    }
    off = best;
  }
  clock.ms += off - clock.offset;
  clock.offset = off; clock.season = season;
}
// sea temperature through the year: warmest in late August (late February south of the equator)
export function seaTemp(ms: number, lat: number, range: [number, number]) {
  const d = new Date(ms), doy = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000;
  const peak = lat < 0 ? 50 : 233;
  return (range[0] + range[1]) / 2 + (range[1] - range[0]) / 2 * Math.cos((doy - peak) / 365.25 * Math.PI * 2);
}

interface SiteLike { lat: number; lon: number; tz: number; tide: { amp: number; lag: number } }

// Scan the site's local day (5-minute steps) for sunrise, solar noon and sunset.
export function sunEvents(ms: number, site: SiteLike) {
  const local = new Date(ms + site.tz * 3600000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - site.tz * 3600000;
  let rise = midnight + 6 * 3600000, set = midnight + 18 * 3600000, noon = midnight + 12 * 3600000, best = -9;
  let prev = sun(midnight, site.lat, site.lon).alt;
  for (let t = midnight + 300000; t <= midnight + 86400000; t += 300000) {
    const a = sun(t, site.lat, site.lon).alt;
    if (prev < 0 && a >= 0) rise = t;
    if (prev >= 0 && a < 0) set = t;
    if (a > best) { best = a; noon = t; }
    prev = a;
  }
  return { rise, noon, set, midnight };
}

export function presetTime(p: Preset, site: SiteLike): number {
  const ev = sunEvents(clock.ms, site);
  if (p === 'dawn') return ev.rise + 20 * 60000;
  if (p === 'noon') return ev.noon;
  if (p === 'dusk') return ev.set - 25 * 60000;
  return Math.max(ev.set + 2.5 * 3600000, ev.midnight + 21.5 * 3600000);
}

export function localTimeString(ms: number, tz: number): string {
  const d = new Date(ms + tz * 3600000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export interface SkyState {
  sunDir: [number, number, number];   // refracted, underwater, pointing toward the light
  sunI: number;                       // direct light 0..1
  amb: number;                        // ambient / water brightness 0..1
  night: number;                      // 0 day .. 1 full night
  tint: [number, number, number];     // colour of the light
  golden: number;                     // 0..1 low sun just after sunrise / before sunset
  shaftCol: [number, number, number]; shaftI: number;   // colour and strength of the light shafts
  skyLo: [number, number, number]; skyHi: [number, number, number];
  moonDir: [number, number, number]; moonI: number;
  // above the water: the unrefracted sun and moon, how much of the moon is lit, and the rotation that
  // carries the celestial sphere (x toward RA 0h, y toward RA 6h, z to the celestial pole) onto the sky
  sunAir: [number, number, number]; moonAir: [number, number, number]; moonIllum: number; sunAlt: number;
  starM: number[];
  phase: string; phaseLabel: string; moonAge: number; moonName: string;
  tideH: number; tideRate: number;
  day: number;        // 0..1 how much daylight (for diurnal animals)
  twilight: number;   // 0..1 peaks around sunrise and sunset (crepuscular animals)
  month: number; mday: number;   // local calendar date, for seasonal visitors
}

function toDir(alt: number, az: number): [number, number, number] {
  // world: -z north, +x east, +y up; refract into water (n = 1.333)
  const zen = Math.PI / 2 - Math.max(alt, 0.02);
  const zw = Math.asin(Math.sin(zen) / 1.333);
  return [Math.sin(az) * Math.sin(zw), Math.cos(zw), -Math.cos(az) * Math.sin(zw)];
}
function airDir(alt: number, az: number): [number, number, number] {
  return [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)];
}
// hour angle of RA 0 = local sidereal time; basis vectors of the equatorial frame seen from the site
function starMatrix(ms: number, lat: number, lon: number): number[] {
  const d = ms / 86400000 + 2440587.5 - 2451545.0;
  const lst = ((280.46061837 + 360.98564736629 * d + lon) % 360) * Math.PI / 180, la = lat * Math.PI / 180;
  const dir = (ra: number, dec: number) => {
    const ha = lst - ra;
    const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
    const az = Math.atan2(-Math.sin(ha) * Math.cos(dec), Math.sin(dec) * Math.cos(la) - Math.cos(dec) * Math.sin(la) * Math.cos(ha));
    return airDir(alt, az);
  };
  return [...dir(0, 0), ...dir(Math.PI / 2, 0), ...dir(0, Math.PI / 2)];   // column-major mat3
}
const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function skyState(ms: number, site: SiteLike): SkyState {
  const s = sun(ms, site.lat, site.lon), m = moon(ms, site.lat, site.lon);
  const sa = Math.sin(s.alt);
  const sunI = smooth(-0.02, 0.35, sa);
  const moonUp = smooth(-0.02, 0.2, Math.sin(m.alt)) * m.illum;
  const dayAmb = smooth(-0.21, 0.3, sa);
  const amb = 0.035 + 0.965 * dayAmb + moonUp * 0.05;
  const night = 1 - smooth(-0.2, -0.02, sa);
  const low = 1 - smooth(0.04, 0.42, sa);
  // golden hour: the low sun burns orange-red through the Snell window and slants its shafts in
  const altDeg = s.alt * 180 / Math.PI;
  const golden = smooth(-1.5, 1.0, altDeg) * Math.exp(-(((altDeg - 4) / 7) ** 2));
  let tint = mix3([1, 1, 1], [1.0, 0.62, 0.4], Math.max(low * sunI, golden * 0.85));
  tint = mix3(tint, [0.62, 0.76, 1.0], night);
  const skyLo = mix3(mix3([0.62, 0.86, 0.92], [0.98, 0.58, 0.36], low), [0.05, 0.09, 0.19], smooth(0.0, 1.0, 1 - dayAmb));
  const skyHi = mix3(mix3([0.86, 0.96, 1.0], [1.0, 0.8, 0.6], low), [0.09, 0.14, 0.27], smooth(0.0, 1.0, 1 - dayAmb));
  const t = tide(ms, site.lat, site.lon, site.tide.amp, site.tide.lag);
  const hour = new Date(ms + site.tz * 3600000).getUTCHours();
  let phase: string;
  if (s.alt < -6 * Math.PI / 180) phase = 'night';
  else if (s.alt < 12 * Math.PI / 180) phase = hour < 12 ? 'dawn' : 'dusk';
  else phase = 'noon';
  const phaseLabel = { night: '夜', dawn: '朝', dusk: '夕方', noon: '昼' }[phase];
  return {
    sunDir: s.alt > -0.05 || m.alt < 0 ? toDir(s.alt, s.az) : toDir(m.alt, m.az),
    sunI: Math.max(sunI, moonUp * 0.06), amb, night, tint, skyLo, skyHi, golden,
    shaftCol: mix3([0.55, 0.9, 0.95], [1.5, 0.92, 0.34], golden), shaftI: Math.max(sunI, golden * 0.5, moonUp * 0.06),
    moonDir: toDir(m.alt, m.az), moonI: moonUp,
    sunAir: airDir(s.alt, s.az), moonAir: airDir(m.alt, m.az), moonIllum: m.illum, sunAlt: s.alt,
    starM: starMatrix(ms, site.lat, site.lon),
    phase, phaseLabel, moonAge: m.age, moonName: moonPhaseName(m.age),
    tideH: t.h, tideRate: t.rate,
    day: smooth(-0.05, 0.25, sa),
    month: new Date(ms + site.tz * 3600000).getUTCMonth() + 1, mday: new Date(ms + site.tz * 3600000).getUTCDate(),
    twilight: Math.exp(-(((s.alt * 180 / Math.PI) - 1) ** 2) / (2 * 7 * 7)),
  };
}
