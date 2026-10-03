// Keyed deterministic draws. A draw depends only on (seed, keys), so it does not matter how
// often a run was saved, resumed or re-sent: the same decision point always gets the same number.

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Uniform [0,1) from a seed and string keys (splitmix-style finaliser). */
export function draw(seed: number, ...keys: string[]): number {
  let x = (fnv1a(`${seed}|${keys.join('|')}`) ^ (seed >>> 0)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}
