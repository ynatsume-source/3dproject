// Headless check (the haze under the live screen's words: src/live/scrim.ts, viewer design v2 §5).
//  1 night: no haze; the ordinary scenery: black 10 %, brightness 92 %, no blur; white sand at noon: black 34 %,
//    brightness 74 %, blur 6 px
//  2 in between, smooth: the haze never steps, and only grows with the brightness behind
//  3 the bright tenth of the picture decides, not its average: a few bright pixels among dark ones do not haze it
// Usage: npx tsx scripts/live-scrim-check.ts
import { luminance, brightTenth, hazeFor, hazeStyle } from '../src/live/scrim';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
{ // 1
  const night = hazeStyle(hazeFor(luminance(12, 16, 28))), ord = hazeStyle(hazeFor(0.25)), sand = hazeStyle(hazeFor(luminance(245, 240, 225)));
  want('1 night none; ordinary 10 % / 92 %; white sand 34 % / 74 % / 6 px', night.black === 0 && night.bright === 1 && near(ord.black, 0.10) && near(ord.bright, 0.92) && ord.blurPx === 0 && near(sand.black, 0.34) && near(sand.bright, 0.74) && near(sand.blurPx, 6),
    JSON.stringify({ night, ord, sand }));
}
{ // 2
  let prev = hazeStyle(0), mono = true, smooth = true;
  for (let i = 1; i <= 1000; i++) {
    const s = hazeStyle(hazeFor(i / 1000));
    if (s.black < prev.black - 1e-12 || s.bright > prev.bright + 1e-12 || s.blurPx < prev.blurPx - 1e-12) mono = false;
    if (Math.abs(s.black - prev.black) > 0.01 || Math.abs(s.blurPx - prev.blurPx) > 0.1) smooth = false;
    prev = s;
  }
  want('2 smooth, and only growing with the brightness', mono && smooth, `${mono} ${smooth}`);
}
{ // 3
  const dark = Array.from({ length: 95 }, () => 0.02), lights = Array.from({ length: 5 }, () => 0.9);
  want('3 the bright tenth decides: a few lights at night leave it dark', hazeFor(brightTenth([...dark, ...lights])) === 0 && hazeFor(brightTenth(Array.from({ length: 100 }, (_, i) => (i < 85 ? 0.1 : 0.8)))) > 0.9, `${brightTenth([...dark, ...lights])}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
