// Headless check (ADR 0006): what has paid off, learnt from rewards the world counts (src/robots/agent/values.ts).
//  1 a step gets its own reward; the steps that led up to it a share that halves with each step back
//  2 a step that came to nothing sinks; the hits shown to its mind are the best-paying, as numbers, tried twice or more
//  3 it is kept with the mind (saved and read back)
// Usage: npx tsx scripts/values-check.ts
import { Values } from '../src/robots/agent/values';
import { Agent } from '../src/robots/agent/agent';

let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const v = new Values(); let t = 0;
for (let k = 0; k < 3; k++) {   // (look at the shore, pick up the log, shape it, fit it: three times)
  v.step('look:shore', '浜を見る', 0, t += 60e3); v.step('gather:wood', '流木を拾う', 0.3, t += 60e3);
  v.step('craft:bench', '部材を削る', 0.3, t += 60e3); v.step('place:hut', '部材を取りつける', 1, t += 60e3);
}
const val = (key: string) => { const x = v.m.get(key)!; return v.value(x); };
want('1 the step that earned it learns most', val('place:hut') > val('craft:bench') && val('craft:bench') > 0.3, `${val('place:hut').toFixed(2)} > ${val('craft:bench').toFixed(2)}`);
want('1 the steps before it learn a share (even looking at the shore)', val('look:shore') > 0, val('look:shore').toFixed(3));
v.step('ask:rakko', 'ラッコに頼む', -0.1, t += 60e3); v.step('ask:rakko', 'ラッコに頼む', -0.1, t += 60e3);
want('2 a step that came to nothing sinks', val('ask:rakko') < 0, val('ask:rakko').toFixed(2));
const hits = v.hits(3);
want('2 its hits: the best-paying, as numbers', hits.length === 3 && hits[0].startsWith('部材を取りつける：平均') && !hits.some((h) => h.startsWith('ラッコに頼む')), hits.join(' / '));
const a = new Agent('dot', 'test', () => null, null as any);
a.result('eat:patch#1', 'eat', 'done', 1, '', 0.8, '岩場Aで食べる'); a.result('eat:patch#1', 'eat', 'done', 2, '', 0.6, '岩場Aで食べる');
const b = new Agent('dot', 'test', () => null, null as any); b.load(JSON.parse(JSON.stringify(a.save())));
want('3 kept with its mind, and read back', b.values.hits(1)[0] === '岩場Aで食べる：平均 0.70（2回）', b.values.hits(1)[0] ?? 'none');
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
