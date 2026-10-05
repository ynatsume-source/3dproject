// Dot's world map (ADR 0006: Dot's purpose is to widen the world; ADR 0007: another planet the shape of the Earth).
// The planet's geography is the Earth's, but no one has named any of it: the islands seen from home are there to be
// seen, reached and named — in the island's own words. What is known of each is the map; how much has been seen and
// reached is Dot's reward. (The islands' places and sizes are the Earth's own islands around Kayama; what each has is
// what makes it worth the crossing: a little convenience is fine — ADR 0007.)
import { syllables } from '../robots/islandlang';

export interface Isle {
  id: string; lat: number; lon: number; areaKm2: number;
  ja: string;                    // how the watcher is told of it (direction and size, not a human name)
  has: string[];                 // what is there that home has not (found when reached)
  earth: string;                 // the Earth's name, for the watcher's pages only — never to a resident
}
export const HOME = { lat: 24.361, lon: 123.997 };
export const ISLES: Isle[] = [
  { id: 'south-near', lat: 24.343, lon: 123.98, areaKm2: 7.8, ja: '南のすぐ近くの島', has: ['竹', '葦', '粘土'], earth: '小浜島' },
  { id: 'east-flat', lat: 24.326, lon: 124.087, areaKm2: 5.4, ja: '東の平たい島', has: ['白い石灰岩'], earth: '竹富島' },
  { id: 'west-big', lat: 24.33, lon: 123.81, areaKm2: 289, ja: '西の大きな島', has: ['川（真水）', '大きな森', 'マングローブ'], earth: '西表島' },
  { id: 'east-big', lat: 24.4, lon: 124.15, areaKm2: 222, ja: '東の山のある島', has: ['山', 'いろいろな岩'], earth: '石垣島' },
  { id: 'south-far', lat: 24.24, lon: 124.01, areaKm2: 10, ja: '南の遠い島', has: ['広い草地'], earth: '黒島' },
];
/** Distance (km) and bearing (degrees from north) from home. */
export function fromHome(i: { lat: number; lon: number }) {
  const R = 6371, toR = Math.PI / 180, dLat = (i.lat - HOME.lat) * toR, dLon = (i.lon - HOME.lon) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(HOME.lat * toR) * Math.cos(i.lat * toR) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(a));
  const y = Math.sin(dLon) * Math.cos(i.lat * toR), x = Math.cos(HOME.lat * toR) * Math.sin(i.lat * toR) - Math.sin(HOME.lat * toR) * Math.cos(i.lat * toR) * Math.cos(dLon);
  return { km, bearing: ((Math.atan2(y, x) / toR) + 360) % 360 };
}
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
export const dirJa = (bearing: number) => DIRS[Math.round(bearing / 45) % 8];

/** A new word in the island's language for a place: two or three syllables, from the place itself (the same place
 *  always gets the same word), never one the language already has. */
export function coin(seed: string, taken: Set<string>): string {
  const C = ['', 'p', 't', 'k', 'm', 'n', 's', 'h', 'l', 'w'], V = 'aiueo';
  let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  for (let tries = 0; tries < 50; tries++) {
    let w = ''; const n = 2 + (h % 2);
    for (let k = 0; k < n; k++) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; const c = C[h % C.length]; h = Math.imul(h ^ (h >>> 11), 2246822519) >>> 0; w += c + V[h % 5]; }
    if (!taken.has(w) && syllables(w).every(([c, v]) => !(c === 'w' && v === 'u'))) return w;
    h = Math.imul(h + tries + 1, 2654435761) >>> 0;
  }
  return 'nesi' + seed.length;
}

/** What Dot's map holds: each place seen from home (direction, distance) and those reached, with their own words. */
export interface MapState { seen: Record<string, { at: number; word: string }>; reached: Record<string, { at: number }> }
export const emptyMap = (): MapState => ({ seen: {}, reached: {} });
/** How much of the world it knows, as its reward counts it: a place seen is something; a place reached, by its size. */
export const mapScore = (m: MapState) => Object.keys(m.seen).length * 0.3 + ISLES.filter((i) => m.reached[i.id]).reduce((s, i) => s + 1 + Math.log10(1 + i.areaKm2), 0);
