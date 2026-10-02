// npx tsx scripts/lantern-sky-check.ts [optional-output.svg]
// Tests actual catalogue provenance, analytic horizontal coordinates, and truthful/safe export.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { LANTERN_STARS, sampleSky, renderStudySvg, type SkyObservation } from '../src/robots/lantern-sky';

const near = (actual: number, expected: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const wrap = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;
const j2000 = Date.parse('2000-01-01T12:00:00Z');
const gmstJ2000 = 280.46061837; // Meeus/IAU expression shared by the rendered sky.
const binary = readFileSync(new URL('../public/stars.bin', import.meta.url));
assert.equal(LANTERN_STARS.length, 20);
assert.equal(new Set(LANTERN_STARS.map((s) => s.id)).size, 20);
for (const s of LANTERN_STARS) {
  const i = s.catalogueRow * 6;
  near(s.raDeg, binary.readUInt16LE(i) / 65535 * 360);
  near(s.decDeg, binary.readInt16LE(i + 2) / 32767 * 90);
  near(s.magnitude, binary[i + 4] / 25 - 2);
}

// At J2000 Greenwich sidereal angle is independently known. Putting a star's
// declination at the observer's latitude and its RA on the meridian gives zenith.
for (const s of LANTERN_STARS) {
  const lon = wrap(s.raDeg - gmstJ2000);
  const zenith = sampleSky(j2000, s.decDeg, lon).stars.find((p) => p.id === s.id)!;
  assert.ok(zenith, s.id + ' above horizon at zenith');
  near(zenith.altitudeDeg, 90, 0.000002);
  assert.ok(Math.hypot(zenith.x, zenith.y) < 0.000001);
  // The opposite terrestrial point puts precisely the same star at the nadir.
  assert.ok(!sampleSky(j2000, -s.decDeg, wrap(lon + 180)).stars.some((p) => p.id === s.id));
}

const polaris = LANTERN_STARS.find((s) => s.id === 'polaris')!;
for (const t of [j2000, Date.parse('2026-06-21T00:00:00Z'), Date.parse('2026-12-21T23:59:00Z')]) {
  near(sampleSky(t, 90, 0).stars.find((s) => s.id === polaris.id)!.altitudeDeg, polaris.decDeg);
  assert.ok(!sampleSky(t, -90, 0).stars.some((s) => s.id === polaris.id));
}
// Looking UP at the sky puts east on the left. Hour angle ±45° must mirror.
const vega = LANTERN_STARS.find((s) => s.id === 'vega')!;
const eastern = sampleSky(j2000, 0, wrap(vega.raDeg - gmstJ2000 - 45)).stars.find((s) => s.id === vega.id)!;
const western = sampleSky(j2000, 0, wrap(vega.raDeg - gmstJ2000 + 45)).stars.find((s) => s.id === vega.id)!;
assert.ok(eastern.x < 0 && western.x > 0);
assert.ok(eastern.azimuthDeg < 180 && western.azimuthDeg > 180);
near(eastern.x, -western.x);
near(eastern.altitudeDeg, western.altitudeDeg);

// A Point Lobos summer evening, and a midday control 12 hours later.
const night = sampleSky(Date.parse('2026-06-21T06:00:00Z'), 36.515, -121.944);
const noon = sampleSky(Date.parse('2026-06-21T18:00:00Z'), 36.515, -121.944);
assert.ok(night.sunAltitudeDeg < -6 && noon.sunAltitudeDeg > 45);
assert.ok(night.stars.length > 3);
for (const lat of [-90, -60, 0, 36.515, 90]) for (const lon of [-180, -90, 0, 90, 180]) {
  for (const month of ['01', '04', '07', '10']) {
    const sample = sampleSky(Date.parse(`2026-${month}-15T03:00:00Z`), lat, lon);
    assert.ok(sample.stars.length <= 20 && Number.isFinite(sample.sunAltitudeDeg));
    for (const s of sample.stars) {
      assert.ok(s.altitudeDeg > 0 && s.altitudeDeg <= 90);
      assert.ok(s.azimuthDeg >= 0 && s.azimuthDeg < 360);
      assert.ok(Math.hypot(s.x, s.y) <= 1);
    }
  }
}
for (const [time, lat, lon] of [[NaN, 0, 0], [Infinity, 0, 0], [1e18, 0, 0], [j2000, 91, 0], [j2000, 0, 181], [j2000, NaN, 0]]) {
  assert.throws(() => sampleSky(time, lat, lon), RangeError);
}

const observation: SkyObservation = { atMs: night.atMs, lat: night.lat, lon: night.lon, starIds: night.stars.map((s) => s.id), cloud: 0.12, cloudSource: 'simulation', offline: false };
const study = {
  siteName: 'ポイントロボス', title: '夜の光を採る', observations: [observation], status: 'complete' as const,
  caption: '昨日は雲に隠れた光を、今夜は少しだけ追いかけた。',
};
const svg = renderStudySvg(study);
assert.equal(svg, renderStudySvg(study), 'same observation must export identical SVG');
assert.ok(svg.startsWith('<?xml') && svg.endsWith('</g></svg>'));
assert.ok(svg.includes('制作済みの習作') && svg.includes('作中の観察にもとづく計算図'));
assert.ok(svg.includes('ランタンのことば（創作）'));
assert.ok(svg.includes('2026-06-21 06:00:00 UTC'));
assert.ok(svg.includes('雲量 12%（シミュレーション設定） · 作中進行中の記録'));
assert.ok(svg.includes('星の位置は計算値') && svg.includes('雲による個々の星の遮蔽は検証していません'));
assert.equal((svg.match(/data-star=/g) ?? []).length, night.stars.length);
const below = LANTERN_STARS.filter((s) => !night.stars.some((p) => p.id === s.id));
for (const s of below) assert.ok(!svg.includes(`data-star="${s.id}"`));

// Unknown IDs, below-horizon IDs, daylight coordinates, and corrupt records can't
// turn a blank diary into a completed observation. Status alone is insufficient.
for (const observations of [
  [], [{ ...observation, starIds: [] }], [{ ...observation, starIds: ['invented-star'] }],
  [{ ...observation, starIds: below.map((s) => s.id) }],
  [{ ...observation, atMs: noon.atMs, starIds: noon.stars.map((s) => s.id) }],
  [{ ...observation, atMs: NaN }],
]) {
  const empty = renderStudySvg({ ...study, observations });
  assert.ok(empty.includes('下書き・制作途中') && !empty.includes('制作済みの習作'));
  assert.ok(!empty.includes('data-star='));
}
// One sky per plate: later recording wins even if save records arrive unsorted.
const later = sampleSky(night.atMs + 30 * 60000, night.lat, night.lon);
const laterRecord: SkyObservation = { ...observation, atMs: later.atMs, starIds: [later.stars[0].id] };
const singleInstant = renderStudySvg({ ...study, observations: [laterRecord, observation] });
assert.ok(singleInstant.includes('2026-06-21 06:30:00 UTC'));
assert.equal((singleInstant.match(/data-star=/g) ?? []).length, 1);

// Preserve weather provenance and catch-up inference in standalone exports too.
// A historical/unknown input must not become an apparently live field measurement.
const inferred = renderStudySvg({ ...study, observations: [{ ...observation, cloud: 0.3, cloudSource: 'live', offline: true }] });
assert.ok(inferred.includes('雲量 30%（取得した天気データ） · 不在中の推定記録'));
const unknown = renderStudySvg({ ...study, observations: [{ ...observation, cloud: undefined, cloudSource: undefined, offline: undefined }] });
assert.ok(unknown.includes('雲量 未記録（出典未記録） · 進行状態の記録なし'));
const invalidCloud = renderStudySvg({ ...study, observations: [{ ...observation, cloud: 2, cloudSource: 'unknown' }] });
assert.ok(invalidCloud.includes('雲量 未記録（出典未記録）'));
const recentSource = renderStudySvg({ ...study, observations: [{ ...laterRecord, cloud: 0.2, cloudSource: 'live', offline: false }, observation] });
assert.ok(recentSource.includes('雲量 20%（取得した天気データ）'));
assert.ok(!recentSource.includes('雲量 12%（シミュレーション設定）'));

const unsafe = '</text><script>alert(1)</script><image href="https://example.test/a" onload="evil"/> & \' "';
const escaped = renderStudySvg({ ...study, siteName: unsafe, title: unsafe, caption: unsafe });
assert.ok(!escaped.includes('<script') && !escaped.includes('<image') && !escaped.includes('<foreignObject'));
assert.ok(escaped.includes('&lt;') && escaped.includes('&amp;') && escaped.includes('&quot;'));
assert.ok(!renderStudySvg({ ...study, caption: '\u0000\u0001text' }).includes('\u0000'));
if (process.argv[2]) writeFileSync(process.argv[2], svg);
console.log(JSON.stringify({ catalogueStars: LANTERN_STARS.length, catalogueMatchesBinary: true,
  coordinateCases: 20 * 2 + 3 * 2 + 2, seasonalSamples: 100,
  night: { atMs: night.atMs, sunAltitudeDeg: night.sunAltitudeDeg, recordedStars: night.stars.length },
  daytimeRejected: true, blankRemainsDraft: true, weatherProvenancePreserved: true, deterministicSafeSvg: true }, null, 2));
console.log('lantern-sky-check: PASS');
