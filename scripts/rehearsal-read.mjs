// Reads a rehearsal log (src/ui/rehearsal-log.ts, ?rehearsal) and says how much of it had something worth watching
// (docs/rehearsal/CYCLES.md). Minute by minute, on the time in Japan:
//   strong  a subtitle (sub) or a milestone card (card) put up on the live screen
//   weak    the status line changed (status)
// (the day's log — event, shown true — is counted apart: it passed the log's own sifting, but the live screen does not
// put it up)
// It prints the share of minutes with a strong one, with either, the longest run with no strong one, the same share hour
// by hour, the calls to the model, and the slow frames. Only minutes the app ran in are counted (it writes a row each
// second); a run is broken where it was not running. Nothing is sent anywhere.
// Usage: node scripts/rehearsal-read.mjs rehearsal-YYYYMMDD-HHMM.ndjson
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/rehearsal-read.mjs <rehearsal-….ndjson>'); process.exit(2); }
const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const minOf = (r) => r.jst.slice(0, 16);   // (YYYY-MM-DDTHH:MM, in Japan)
const step = (m) => new Date(Date.parse(m + ':00+09:00') + 60e3 + 9 * 3600e3).toISOString().slice(0, 16);
const alive = new Set(), strong = new Set(), weak = new Set(), n = { sub: 0, card: 0, shown: 0, status: 0, blank: 0, hidden: 0, error: 0 };
const ai = { calls: 0, ok: 0, why: {}, input: 0, output: 0, models: {} }, slow = { n: 0, hidden: 0, parts: {} };
let first = '', last = '';
for (const r of rows) {
  if (!r.jst) continue;
  const m = minOf(r);
  if (!first || m < first) first = m; if (m > last) last = m; alive.add(m);   // (a minute the app ran in: it writes a row each second)
  if (r.t === 'sub') { n.sub++; strong.add(m); }
  else if (r.t === 'card') { n.card++; strong.add(m); }
  else if (r.t === 'event' && r.shown === true) n.shown++;
  else if (r.t === 'status') { n.status++; if (!r.text) n.blank++; weak.add(m); }
  else if (r.t === 'event' && r.kind === 'hidden') n.hidden++;
  else if (r.t === 'event' && r.kind === 'error') n.error++;
  else if (r.t === 'ai') {
    ai.calls++; if (r.ok) ai.ok++; else { const w = String(r.why ?? '?'); ai.why[w] = (ai.why[w] ?? 0) + 1; }
    ai.input += r.input ?? 0; ai.output += r.output ?? 0; if (r.model) ai.models[r.model] = (ai.models[r.model] ?? 0) + 1;
  } else if (r.t === 'slow') {
    slow.n++; if (r.hidden) slow.hidden++;
    else for (const [k, v] of Object.entries(r.parts ?? {})) slow.parts[k] = (slow.parts[k] ?? 0) + v;
  }
}
if (!first) { console.log('no rows'); process.exit(1); }
const mins = []; let span = 0; for (let m = first; m <= last; m = step(m)) { span++; if (alive.has(m)) mins.push(m); }
const pct = (a, b) => `${a}/${b} (${b ? Math.round(a / b * 100) : 0}%)`;
let run = 0, best = 0, bestAt = '';
let prev = '';
for (const m of mins) { if (prev && step(prev) !== m) run = 0; prev = m; if (strong.has(m)) run = 0; else if (++run > best) { best = run; bestAt = m; } }
const bestFrom = mins[mins.indexOf(bestAt) - best + 1];
console.log(`${file}: ${first.replace('T', ' ')} – ${last.replace('T', ' ')} (JST), ${mins.length} minutes running${span > mins.length ? ` (${span - mins.length} with nothing written: not running)` : ''}`);
console.log(`minutes with a strong one (subtitle or card):              ${pct(mins.filter((m) => strong.has(m)).length, mins.length)}`);
console.log(`minutes with either (or the status line changing):      ${pct(mins.filter((m) => strong.has(m) || weak.has(m)).length, mins.length)}`);
console.log(`longest run with no strong one: ${best} min${best ? ` (${bestFrom.slice(11)}–${bestAt.slice(11)})` : ''}`);
console.log(`counts: subtitles ${n.sub}, cards ${n.card}, status changes ${n.status} (to blank ${n.blank}); the day's log (not on the live screen) ${n.shown}; tab hidden ${n.hidden}, errors ${n.error}`);
console.log('hour by hour (strong / either):');
const hours = [...new Set(mins.map((m) => m.slice(0, 13)))];
for (const h of hours) { const hm = mins.filter((m) => m.startsWith(h)); console.log(`  ${h.slice(5).replace('T', ' ')}時  ${pct(hm.filter((m) => strong.has(m)).length, hm.length)}  ${pct(hm.filter((m) => strong.has(m) || weak.has(m)).length, hm.length)}`); }
console.log(`model calls: ${ai.calls}, ok ${ai.ok}${Object.keys(ai.why).length ? `; failed: ${Object.entries(ai.why).map(([k, v]) => `${k} ×${v}`).join(', ')}` : ''}; tokens in ${ai.input}, out ${ai.output}; ${Object.entries(ai.models).map(([k, v]) => `${k} ×${v}`).join(', ')}`);
console.log(`slow frames (over 250 ms): ${slow.n} (${slow.hidden} while hidden); time in them by part: ${Object.entries(slow.parts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)} ms`).join(', ') || '—'}`);
