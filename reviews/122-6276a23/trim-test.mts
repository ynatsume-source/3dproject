// Science check for #122: trimStatus is idempotent, and the compare key stays still while only the metres change.
import { trimStatus } from '/tmp/claude-0/-home-user-3dproject/4db7e567-5529-5795-9b08-c7b02441b831/scratchpad/pr73/src/live/status-line.ts';
const lines = ['ヤシの実を棚へ運んでいる（あと12m）', 'ヤシの実を棚へ運んでいる（あと11m）（おなかがすいている）', '歩いている（あと4m）', '筏で島へ渡っている（島にはいない）', '縄をなっている（3本目）', '桟橋に板を張っている（4/8）', 'ひと休みしている'];
let bad = 0;
for (const l of lines) { const a = trimStatus(l), b = trimStatus(a); if (a !== b) { bad++; console.log('not idempotent:', l, '→', a, '→', b); } console.log(`${l} → ${a}`); }
// walking 30 m: raw changes every metre, trimmed never
let raw = 0, trimmed = 0, pr = '', pt = '';
for (let m = 30; m > 3; m--) { const s = `ヤシの実を棚へ運んでいる（あと${m}m）`; if (s !== pr) raw++; if (trimStatus(s) !== pt) trimmed++; pr = s; pt = trimStatus(s); }
console.log(`changes while walking: raw ${raw}, as shown ${trimmed}`);
process.exit(bad || trimmed !== 1 ? 1 : 0);
