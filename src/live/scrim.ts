// The haze under the live screen's words (viewer design v2 §5, 2026-10-17): nothing laid under them as a rule — their
// own soft shadow reads them — and only where the scenery behind is very bright, a faint haze, edgeless. It follows the
// scenery: the brightness behind each group of words, read once a second from the drawn picture shrunk small (the
// bright tenth of it), sets how much. Drawing only: the world is not touched.
//   very bright (white sand at noon): black 34 %, brightness 74 %, blur 6 px
//   ordinary (evening, forest, sea):  black 10 %, brightness 92 %
//   dark (night):                     none

/** Relative luminance (0–1) of an sRGB pixel. */
export const luminance = (r: number, g: number, b: number) => {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** The bright tenth: the luminance below which nine in ten of the pixels lie. */
export function brightTenth(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
}

/** How much haze (0 none … 0.3 ordinary … 1 very bright) for the brightness behind. */
export function hazeFor(lum: number): number {
  const ramp = (x: number, a: number, b: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  if (lum < 0.06) return 0;                                    // (night: nothing)
  if (lum < 0.25) return 0.3 * ramp(lum, 0.06, 0.25);         // (dusk to ordinary)
  return 0.3 + 0.7 * ramp(lum, 0.25, 0.65);                   // (ordinary to the white sand at noon)
}

/** The haze itself: black over it, the brightness behind it, the blur (in 1080p px). */
export function hazeStyle(h: number): { black: number; bright: number; blurPx: number } {
  if (h <= 0.3) { const k = h / 0.3; return { black: 0.10 * k, bright: 1 - 0.08 * k, blurPx: 0 }; }
  const k = (h - 0.3) / 0.7;
  return { black: 0.10 + 0.24 * k, bright: 0.92 - 0.18 * k, blurPx: 6 * k };
}
