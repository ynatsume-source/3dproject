// The live screen's status line (docs/proposals/viewer-design-2026-10-16/screens/README.md, v2, 2026-10-17): the world's
// own words for what a resident is doing, tidied just before they are drawn — a pure function, nothing fed back.
//  - a "（あと○m）" and a bracket of numbers only ("（3本目）", "（4/8）") are taken out: no counts or distances on the
//    screen (§3-6: no remaining time, no progress, no hidden values); a bracket of words ("（島にはいない）") stays
//  - a line too long for its place is broken in two after a 、 or 。 — never cut short

const COUNTER = '(?:本目|本|個目|個|回目|回|枚|人|日目|日|つ目|つ|段目|段|m|km|kg|g|%|％|分|秒|時間|cm|mm)';
const NUMBER_ONLY = new RegExp(`（\\s*[0-9０-９]+(?:[/／.．:：〜~\\-][0-9０-９]+)*\\s*${COUNTER}?\\s*）`, 'g');
const STILL_TO_GO = /（\s*あと[^）]*[0-9０-９][^）]*）/g;

/** The status line with its numbers taken out, the words kept. */
export function trimStatus(text: string): string {
  return text.replace(STILL_TO_GO, '').replace(NUMBER_ONLY, '').replace(/\s{2,}/g, ' ').trim();
}

/** Broken into at most two lines when `fits` says one is too long: after the 、 or 。 nearest the middle that leaves
 *  both halves fitting, else the one that leaves the first fitting. With no 、 or 。, one line, whole. */
export function wrapStatus(text: string, fits: (line: string) => boolean): string[] {
  if (fits(text)) return [text];
  const cuts: number[] = [];
  for (let i = 0; i < text.length - 1; i++) if (text[i] === '、' || text[i] === '。') cuts.push(i + 1);
  if (!cuts.length) return [text];
  const both = cuts.filter((c) => fits(text.slice(0, c)) && fits(text.slice(c)));
  const pool = both.length ? both : cuts.filter((c) => fits(text.slice(0, c)));
  const at = (pool.length ? pool : cuts).reduce((a, b) => (Math.abs(b - text.length / 2) < Math.abs(a - text.length / 2) ? b : a));
  return [text.slice(0, at), text.slice(at)];
}
