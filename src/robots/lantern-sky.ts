import { sun } from '../time/astro';

/** A small named subset of the SAME catalogue used to render the world's night sky.
 * Source: public/stars.bin, d3-celestial stars.6.json (Yale Bright Star Catalogue etc.).
 * https://github.com/ofrohn/d3-celestial — Olaf Frohn, BSD-3-Clause; see README credits.
 * Integers below are copied verbatim from the binary, not invented/generated stars.
 * row is the zero-based binary row; RA/Dec are J2000, quantized as in ocean/air.ts.
 * This intentionally shares clock.ts's low-precision sidereal transform: no precession,
 * proper motion, refraction, terrain horizon, moonlight or cloud-occlusion model.
 * Hence these are approximate geometric positions, NOT real-world sighting evidence.
 */
const CATALOGUE: readonly [string, string, number, number, number, number][] = [
  ['sirius', 'シリウス', 0, 18438, -6086, 14],
  ['canopus', 'カノープス', 1, 17474, -19185, 34],
  ['arcturus', 'アークトゥルス', 2, 38941, 6984, 49],
  ['alpha-centauri', 'ケンタウルス座α星', 3, 40031, -22148, 50],
  ['vega', 'ベガ', 4, 50832, 14120, 51],
  ['capella', 'カペラ', 5, 14413, 16747, 52],
  ['rigel', 'リゲル', 6, 14315, -2986, 55],
  ['procyon', 'プロキオン', 7, 20903, 1902, 60],
  ['achernar', 'アケルナル', 8, 4447, -20839, 61],
  ['betelgeuse', 'ベテルギウス', 9, 16164, 2697, 61],
  ['hadar', 'ハダル', 10, 38403, -21980, 65],
  ['altair', 'アルタイル', 11, 54193, 3229, 69],
  ['acrux', 'アクルックス', 12, 33978, -22973, 69],
  ['aldebaran', 'アルデバラン', 13, 12557, 6011, 72],
  ['spica', 'スピカ', 14, 36645, -4064, 74],
  ['antares', 'アンタレス', 15, 45028, -9623, 76],
  ['pollux', 'ポルックス', 16, 21177, 10204, 79],
  ['fomalhaut', 'フォーマルハウト', 17, 62697, -10785, 79],
  ['deneb', 'デネブ', 19, 56498, 16486, 81],
  ['polaris', 'ポラリス', 46, 6909, 32499, 99],
];

export interface CatalogueStar {
  id: string;
  name: string;
  catalogueRow: number;
  raDeg: number;
  decDeg: number;
  magnitude: number;
}
export const LANTERN_STARS: readonly Readonly<CatalogueStar>[] = Object.freeze(CATALOGUE.map(
  ([id, name, catalogueRow, ra, dec, mag]) => Object.freeze({
    id, name, catalogueRow, raDeg: ra / 65535 * 360, decDeg: dec / 32767 * 90, magnitude: mag / 25 - 2,
  }),
));

export interface SkyStar extends CatalogueStar {
  altitudeDeg: number;
  /** From north, clockwise. */
  azimuthDeg: number;
  /** Zenith-centred equidistant map, unit horizon. North up, east left (looking UP). */
  x: number;
  y: number;
}
export interface SkySample {
  atMs: number;
  lat: number;
  lon: number;
  sunAltitudeDeg: number;
  /** Geometrically above the horizon; not a claim of visibility through cloud/daylight. */
  stars: SkyStar[];
}
/** The recorder supplies only IDs it actually accepted during an observation action. */
export interface SkyObservation {
  atMs: number;
  lat: number;
  lon: number;
  starIds: readonly string[];
  /** Recorded world weather input, not a per-star cloud-occlusion measurement. */
  cloud?: number;
  cloudSource?: 'live' | 'simulation' | 'unknown';
  /** True means the record was inferred during catch-up, rather than active world play. */
  offline?: boolean;
}
export interface StudySvgInput {
  title?: string;
  siteName: string;
  observations: readonly SkyObservation[];
  /** A character's creative sentence, explicitly separate from the calculated star data. */
  caption?: string;
  status?: 'draft' | 'complete';
}

const DEG = Math.PI / 180;
const wrap = (x: number) => ((x % 360) + 360) % 360;

/** Pure and bounded (20 catalogue stars). Uses UTC milliseconds and east-positive longitude. */
export function sampleSky(atMs: number, lat: number, lon: number): SkySample {
  if (!Number.isFinite(atMs) || !Number.isFinite(new Date(atMs).getTime()) ||
      !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError('A sky sample needs a valid UTC date, latitude −90…90 and longitude −180…180.');
  }
  const d = atMs / 86400000 + 2440587.5 - 2451545;
  const sidereal = wrap(280.46061837 + 360.98564736629 * d + lon);
  const la = lat * DEG;
  const stars: SkyStar[] = [];
  for (const star of LANTERN_STARS) {
    const ha = (sidereal - star.raDeg) * DEG, dec = star.decDeg * DEG;
    const sinAlt = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha);
    const altitudeDeg = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / DEG;
    if (altitudeDeg <= 0) continue;
    const az = Math.atan2(-Math.sin(ha) * Math.cos(dec),
      Math.sin(dec) * Math.cos(la) - Math.cos(dec) * Math.sin(la) * Math.cos(ha));
    const radius = (90 - altitudeDeg) / 90;
    stars.push({ ...star, altitudeDeg, azimuthDeg: wrap(az / DEG), x: -radius * Math.sin(az), y: -radius * Math.cos(az) });
  }
  return { atMs, lat, lon, sunAltitudeDeg: sun(atMs, lat, lon).alt / DEG, stars };
}

// SVG has no scripts, external resources, foreignObject, or interpolated markup/attributes.
// Strip XML 1.0 control characters as well as escaping text supplied by the resident/user.
const clean = (s: unknown, limit = 180) => Array.from(String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/\s+/g, ' '))
  .filter((c) => !(c.length === 1 && c.charCodeAt(0) >= 0xD800 && c.charCodeAt(0) <= 0xDFFF)).slice(0, limit).join('');
const esc = (s: unknown) => clean(s, 600).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const fixed = (n: number) => n.toFixed(2);
const utc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const wrapText = (s: string, width: number): string[] => {
  const chars = Array.from(s), lines: string[] = [];
  for (let i = 0; i < chars.length; i += width) lines.push(chars.slice(i, i + width).join(''));
  return lines;
};

/** A standalone printable SVG. Each plate is ONE recorded instant, never a composite sky.
 * Stored IDs are intersected with a freshly calculated sky; invalid/no/empty observations
 * produce an explicitly unfinished plate. Conditions (cloud, location outdoors, exposure)
 * are accepted by the world recorder, not inferred here from catalogue coordinates.
 */
export function renderStudySvg(study: StudySvgInput): string {
  const accepted: { sky: SkySample; stars: SkyStar[]; observation: SkyObservation }[] = [];
  for (const o of (Array.isArray(study.observations) ? study.observations : []).slice(-256)) {
    if (!o || !Array.isArray(o.starIds)) continue;
    try {
      const sky = sampleSky(o.atMs, o.lat, o.lon);
      const ids = new Set(o.starIds.slice(0, 20));
      const stars = sky.stars.filter((s) => ids.has(s.id));
      // Bright-star studies happen after civil twilight. Daytime coordinates are not sightings.
      if (stars.length && sky.sunAltitudeDeg <= -6) accepted.push({ sky, stars, observation: o });
    } catch { /* A corrupt saved record must not manufacture a finished sky. */ }
  }
  accepted.sort((a, b) => a.sky.atMs - b.sky.atMs);
  const last = accepted.at(-1), complete = study.status === 'complete' && !!last;
  const title = clean(study.title || '夜の光を採る', 24);
  const site = clean(study.siteName || '場所の記録なし', 46);
  const caption = clean(study.caption, 102);
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 840 1188" role="img" aria-labelledby="study-title study-desc">',
    `<title id="study-title">${esc(title)} — ランタンの星空習作</title>`,
    '<desc id="study-desc">作中で記録した日時と場所から計算した、明るい恒星の概略位置。現地の実測・撮影記録ではありません。天頂が中心、北が上、東が左。星座線は描いていません。</desc>',
    '<rect width="840" height="1188" fill="#f4f1e9"/>',
    '<g font-family="Noto Sans JP, Hiragino Kaku Gothic ProN, Yu Gothic, sans-serif" fill="#19363b">',
    '<path d="M48 53H792" stroke="#19363b" stroke-width="2"/>',
    '<text x="48" y="82" font-size="11" letter-spacing="3">LANTERN / NIGHT STUDIES</text>',
    `<text x="792" y="82" text-anchor="end" font-size="11">${complete ? '制作済みの習作' : '下書き・制作途中'}</text>`,
    `<text x="48" y="136" font-size="30">${esc(title)}</text>`,
    `<text x="48" y="167" font-size="13">${esc(site)}</text>`,
    `<text x="48" y="190" font-size="11" fill="#526b6c">${last ? esc(utc(last.sky.atMs)) + ' · ' + last.sky.lat.toFixed(3) + '°, ' + last.sky.lon.toFixed(3) + '°' : 'まだ有効な星の記録はありません'}</text>`,
    '<circle cx="420" cy="473" r="253" fill="#142e36"/>',
    '<g stroke="#90aaab" stroke-width="0.7" fill="none" opacity="0.37">',
    '<circle cx="420" cy="473" r="168.67"/><circle cx="420" cy="473" r="84.33"/>',
    '<path d="M167 473H673M420 220V726"/>',
    '</g>',
    '<g fill="#aec1bc" font-size="9"><text x="426" y="467">天頂</text><text x="426" y="385">60°</text><text x="426" y="301">30°</text></g>',
    '<g font-size="12" text-anchor="middle"><text x="420" y="208">北 N</text><text x="420" y="752">南 S</text><text x="140" y="477">東 E</text><text x="704" y="477">西 W</text></g>',
  ];
  if (last) {
    last.stars.forEach((s, i) => {
      const x = 420 + s.x * 253, y = 473 + s.y * 253;
      const r = Math.max(2, 3.8 - s.magnitude * 0.7);
      out.push(`<g data-star="${s.id}"><circle cx="${fixed(x)}" cy="${fixed(y)}" r="${fixed(r)}" fill="#f6e5b8"/>`);
      // A tiny index, not a constellation line: names and altitudes are in the table below.
      out.push(`<text x="${fixed(x + (s.x > 0.78 ? -8 : 7))}" y="${fixed(y - 7)}" font-size="9" text-anchor="${s.x > 0.78 ? 'end' : 'start'}" fill="#e1e6dc">${i + 1}</text></g>`);
    });
  } else {
    out.push('<text x="420" y="538" text-anchor="middle" font-size="13" fill="#d1ddda">次の夜の観察を待っています</text>');
  }
  out.push('<text x="420" y="779" text-anchor="middle" font-size="10" fill="#526b6c">天頂から等距離の全天図 · 外周は高度 0° · 星座線なし</text>');
  out.push(`<text x="48" y="815" font-size="12">${last ? 'この一回に記録した星' : '星の記録はまだありません'}</text>`);
  out.push(`<text x="792" y="815" text-anchor="end" font-size="10" fill="#526b6c">${last ? '太陽高度 ' + last.sky.sunAltitudeDeg.toFixed(1) + '° · 有効記録 ' + accepted.length + ' 回' : '未観察の星は補っていません'}</text>`);
  out.push('<path d="M48 827H792" stroke="#b8c1b8"/>');
  if (last) last.stars.forEach((s, i) => {
    const x = i < 10 ? 48 : 428, y = 848 + (i % 10) * 18;
    out.push(`<text x="${x}" y="${y}" font-size="10">${i + 1}. ${esc(s.name)}</text><text x="${x + 328}" y="${y}" text-anchor="end" font-size="10" fill="#526b6c">高度 ${s.altitudeDeg.toFixed(1)}° / 方位 ${s.azimuthDeg.toFixed(0)}°</text>`);
  });
  if (last) {
    const o = last.observation;
    const cloud = Number.isFinite(o.cloud) && o.cloud! >= 0 && o.cloud! <= 1 ? Math.round(o.cloud! * 100) + '%' : '未記録';
    const source = o.cloudSource === 'live' ? '取得した天気データ' : o.cloudSource === 'simulation' ? 'シミュレーション設定' : '出典未記録';
    const progress = o.offline === true ? '不在中の推定記録' : o.offline === false ? '作中進行中の記録' : '進行状態の記録なし';
    out.push(`<text x="48" y="1028" font-size="9" fill="#526b6c">雲量 ${cloud}（${source}） · ${progress}</text>`);
  }
  if (caption) {
    out.push('<text x="48" y="1050" font-size="10" fill="#526b6c">ランタンのことば（創作）</text>');
    wrapText(caption, 34).slice(0, 3).forEach((line, i) => out.push(`<text x="48" y="${1072 + i * 18}" font-size="13">${esc(line)}</text>`));
  }
  out.push('<path d="M48 1121H792" stroke="#b8c1b8"/>');
  out.push('<text x="48" y="1142" font-size="10">作中の観察にもとづく計算図です。現地の実測・撮影記録ではありません。</text>');
  out.push('<text x="48" y="1160" font-size="9" fill="#526b6c">恒星: d3-celestial / Yale catalogue (J2000) · 歳差・大気差・地形遮蔽を省いた概略位置</text>');
  out.push('<text x="48" y="1176" font-size="9" fill="#526b6c">星の位置は計算値です。雲による個々の星の遮蔽は検証していません。</text>');
  out.push('</g></svg>');
  return out.join('\n');
}
