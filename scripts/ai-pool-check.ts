// Headless check (a resident's own AI allowance, 2026-10-12): a pool's cap for the day holds whether or not this
// browser lets the count be stored (robots/mind.ts; ADR 0004). No network: fetch is a stand-in that counts its calls.
//  1 storage throwing on every call: cap 1 lets one request through and refuses the next; left 0
//  2 storage working: cap 2 lets two through, refuses the third; the count is kept in storage
//  3 storage working, then failing mid-day: the count already made still holds the cap
//  4 a count stored by another tab (storage working): respected as before
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/ai-pool-check.ts
import { requestAiText, aiPoolLeft, setAiKey } from '../src/robots/mind';

const store = new Map<string, string>();
let broken = false;
const guard = <T>(f: () => T) => { if (broken) throw new Error('storage unavailable'); return f(); };
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (k: string) => guard(() => store.get(k) ?? null), setItem: (k: string, v: string) => guard(() => { store.set(k, v); }), removeItem: (k: string) => guard(() => { store.delete(k); }),
} });
let calls = 0;
(globalThis as any).fetch = async () => { calls++; return new Response(JSON.stringify({ content: [{ type: 'text', text: 'はい' }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 }); };
let bad = 0;
const want = (what: string, ok: boolean, got = '') => { if (!ok) bad++; console.log(`${what}: ${got} ${ok ? 'ok' : 'FAIL'}`); };
const ask = (name: string, cap: number) => requestAiText('s', 'u', { pool: { name, cap } });
setAiKey('test-key');
const stored = () => JSON.parse(store.get('seaglass.aipool') ?? '{}');

{ // 1
  broken = true; const c0 = calls;
  const a = await ask('t1', 1), b = await ask('t1', 1);
  want('1 storage throwing: cap 1 lets one through, refuses the next; left 0', a === 'はい' && b === null && calls - c0 === 1 && aiPoolLeft('t1', 1) === 0, `${a} / ${b} / fetched ${calls - c0} / left ${aiPoolLeft('t1', 1)}`);
}
{ // 2
  broken = false; const c0 = calls;
  const r = [await ask('t2', 2), await ask('t2', 2), await ask('t2', 2)];
  want('2 storage working: cap 2 lets two through, refuses the third; kept in storage', r[0] === 'はい' && r[1] === 'はい' && r[2] === null && calls - c0 === 2 && stored().t2 === 2 && aiPoolLeft('t2', 2) === 0, `${r.join(' / ')} / fetched ${calls - c0} / stored ${stored().t2}`);
}
{ // 3
  broken = false; const c0 = calls;
  const a = await ask('t3', 2); broken = true;
  const b = await ask('t3', 2), c = await ask('t3', 2);
  want('3 storage failing mid-day: the count made before still holds the cap', a === 'はい' && b === 'はい' && c === null && calls - c0 === 2 && aiPoolLeft('t3', 2) === 0, `${a} / ${b} / ${c} / fetched ${calls - c0}`);
}
{ // 4
  broken = false; const s = stored(); s.d = new Date().toDateString(); s.t4 = 1; store.set('seaglass.aipool', JSON.stringify(s));
  const c0 = calls, a = await ask('t4', 1);
  want('4 a count stored by another tab is respected', a === null && calls === c0 && aiPoolLeft('t4', 1) === 0, `${a} / fetched ${calls - c0}`);
}
console.log(bad ? `FAIL (${bad})` : 'PASS');
process.exit(bad ? 1 : 0);
