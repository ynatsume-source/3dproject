// Shared views: the conditions of a moment written into a URL, and read back from one.
//   ?time=16:40 | dawn | noon | dusk | night   (local time at the sea)
//   &date=2026-10-02 | &season=spring|summer|autumn|winter
//   &speed=1|10|60|360   &wx=clear|cloudy|rain|storm   &guide=<persona id>   &view=fpv|chase
//   #miyako
// All optional. Anything not given keeps the app's own: the real time, the real weather.
import type { Weather } from '../time/weather';
import type { Preset, Season } from '../time/clock';

export type WxKind = 'clear' | 'cloudy' | 'rain' | 'storm';
export const WX: Record<WxKind, Weather> = {
  clear: { ok: true, at: 0, cloud: 0.05, rain: 0, code: 0, wind: 3, windDir: 90, gust: 5 },
  cloudy: { ok: true, at: 0, cloud: 0.8, rain: 0, code: 3, wind: 6, windDir: 90, gust: 9 },
  rain: { ok: true, at: 0, cloud: 0.95, rain: 3, code: 61, wind: 8, windDir: 90, gust: 12 },
  storm: { ok: true, at: 0, cloud: 1, rain: 9, code: 95, wind: 12, windDir: 90, gust: 20 },
};
export const WX_LABEL: Record<WxKind, string> = { clear: '晴れ', cloudy: 'くもり', rain: '雨', storm: '雷雨' };
const PRESETS: Preset[] = ['dawn', 'noon', 'dusk', 'night'];
const SEASONS: Exclude<Season, 'now'>[] = ['spring', 'summer', 'autumn', 'winter'];
const SPEED_OK = [1, 10, 60, 360];

export interface SharedView {
  time?: { hh: number; mm: number } | Preset;
  date?: { y: number; m: number; d: number };
  season?: Exclude<Season, 'now'>;
  speed?: number;
  wx?: WxKind;
  guide?: string;
  view?: 'fpv' | 'chase';
}

/** What a URL asks for; anything malformed is simply ignored. */
export function readShared(search: string): SharedView | null {
  const q = new URLSearchParams(search), v: SharedView = {};
  const t = q.get('time');
  if (t && PRESETS.includes(t as Preset)) v.time = t as Preset;
  else if (t) { const m = /^(\d{1,2}):(\d{2})$/.exec(t); if (m && +m[1] < 24 && +m[2] < 60) v.time = { hh: +m[1], mm: +m[2] }; }
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q.get('date') ?? '');
  if (d && +d[2] >= 1 && +d[2] <= 12 && +d[3] >= 1 && +d[3] <= 31) v.date = { y: +d[1], m: +d[2], d: +d[3] };
  const s = q.get('season'); if (s && SEASONS.includes(s as any)) v.season = s as any;
  const sp = Number(q.get('speed')); if (SPEED_OK.includes(sp)) v.speed = sp;
  const w = q.get('wx'); if (w && w in WX) v.wx = w as WxKind;
  const g = q.get('guide'); if (g && /^[a-z]{2,16}$/.test(g)) v.guide = g;
  const vw = q.get('view'); if (vw === 'fpv' || vw === 'chase') v.view = vw;
  return Object.keys(v).length ? v : null;
}

/** The weather the moment looks like, in the four kinds a link can carry. */
export function wxKindOf(w: Weather): WxKind {
  return w.code >= 95 ? 'storm' : w.rain > 0.3 ? 'rain' : w.cloud > 0.6 ? 'cloudy' : 'clear';
}

/** A link to this moment: the sea, its local date and time, how fast time runs, the weather, the guide. */
export function shareUrl(o: { base: string; sea: string; ms: number; tz: number; speed: number; live: boolean; wx: WxKind; guide: string; view: string }) {
  const L = new Date(o.ms + o.tz * 3600000), p2 = (n: number) => String(n).padStart(2, '0');
  // (written out by hand so the link stays readable: time=16:40, not time=16%3A40)
  const q = [`date=${L.getUTCFullYear()}-${p2(L.getUTCMonth() + 1)}-${p2(L.getUTCDate())}`, `time=${p2(L.getUTCHours())}:${p2(L.getUTCMinutes())}`];
  if (!o.live && o.speed !== 1) q.push(`speed=${o.speed}`);
  q.push(`wx=${o.wx}`, `guide=${encodeURIComponent(o.guide)}`);
  q.push(`view=${o.view === 'chase' ? 'chase' : 'fpv'}`);   // (either way: the viewer's own setting must not decide it)
  // The resident planet has no Earth sea/OG page; open the app with its own world hash.
  return o.sea === 'planet' ? `${o.base}?${q.join('&')}#planet` : `${o.base}${o.sea}/?${q.join('&')}`;
}

/** A short line saying what the shared conditions are (for the badge). */
export function describeShared(v: SharedView, presetLabel: Record<Preset, string>, seasonLabel: Record<string, string>) {
  const parts: string[] = [];
  if (v.date) parts.push(`${v.date.m}月${v.date.d}日`); else if (v.season) parts.push(seasonLabel[v.season]);
  if (typeof v.time === 'string') parts.push(presetLabel[v.time]); else if (v.time) parts.push(`${v.time.hh}:${String(v.time.mm).padStart(2, '0')}`);
  if (v.wx) parts.push(WX_LABEL[v.wx]);
  if (v.speed && v.speed !== 1) parts.push(`×${v.speed}`);
  return parts.join('・');
}
