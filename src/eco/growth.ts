// How big each animal is, and roughly how old that makes it. Lone animals range from young ones to
// the odd big old individual; members of a school are all of a size (schools sort themselves by size).
// Age comes from the von Bertalanffy growth curve fisheries biologists fit to real species,
// L(t) = L∞ (1 − e^(−k (t − t0))): fast early growth that slows as the animal nears its full size.
import { R } from '../core/math';

const bell = () => (R() + R() + R()) / 3;
// a lone animal's length (m) for a species whose usual adult range is [lo, hi]
export function loneLength(lo: number, hi: number) {
  const u = bell();
  const L = lo * 0.6 + (hi * 1.12 - lo * 0.6) * u;
  return R() < 0.05 ? hi * (1.12 + R() * 0.15) : L;   // now and then a real giant
}
// a school's shared length, and one member's length around it
export const schoolLength = (lo: number, hi: number) => lo * 0.75 + (hi - lo * 0.75) * bell();
export const memberLength = (base: number) => base * (0.93 + R() * 0.14);

// growth rate: small fish race to full size in a year or two, big sharks and turtles take decades
export function ageOf(L: number, adultMax: number, k?: number) {
  if (k === 0) return NaN;   // (k 0: an animal whose age is not told from its length — the size alone is given)
  const Linf = adultMax * 1.25, kk = k ?? 0.7 / (1 + adultMax * 1.4), t0 = -0.25;
  return Math.max(0.2, t0 - Math.log(1 - Math.min(L / Linf, 0.97)) / kk);
}
export function describeSize(L: number, age: number, what = '全長') {
  const len = L < 1 ? `${Math.round(L * 100)} cm` : `${L.toFixed(1)} m`;
  if (!Number.isFinite(age)) return `${what} 約${len}`;
  const a = age < 1 ? `生後${Math.max(1, Math.round(age * 12))}か月ほど` : `推定${Math.round(age)}歳`;
  return `${what} 約${len}・${a}`;
}
