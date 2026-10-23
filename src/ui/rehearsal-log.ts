// The rehearsal's log (?rehearsal): what the machine did, to lay beside what the viewers saw (docs/proposals/
// viewer-design-2026-10-16/REHEARSAL.md). One file, a JSON line a row, every row with the time in Japan to the second
// (frames to the millisecond) and the island's clocks — the one shown (isl) and the world's (world):
//   sec     each second: frames, their interval's median / 95th / longest (ms), the longest frame's own work (ms)
//   slow    a frame over 250 ms apart from the last: what that frame's work went on (core/prof.ts: 住人 holds 道探し,
//           殻, 縄, 帆, 保存; 描画 is the drawing handed to the GPU, not the GPU's own time; 画面読み the live screen's
//           look at the picture, where the GPU is waited for; その他 the rest: the sea, its life, the camera); hidden: the
//           tab was hidden
//   event   the day's log as told (seaLog), the tab hidden / shown, an error
//   ai      a call to the model: when, how long, how it went (ok / cap / busy / why it failed), tokens — never its text
//   status  the status line's words, when they change
//   sea     every five minutes: the sea's height on the world's clock (seaLevel) and as drawn
// Kept in this browser as it goes (IndexedDB, so a reload loses nothing), written out with Alt+Shift+R or
// seaglassRehearsal.download(); seaglassRehearsal.clear() starts afresh. Nothing is sent anywhere.
import { prof } from '../core/prof';
import { watchAi } from '../robots/mind';

export type RehearsalSource = {
  island: () => number; world: () => number | null;
  seaWorld: () => number | null; seaDrawn: () => number;
  status: () => string;
};
export type RehearsalLog = { frame(ts: number): void; frameEnd(): void; event(kind: string, text: string): void };

const DB = 'seaglass.rehearsal', STORE = 'lines';
const jst = (ms: number, milli = false) => new Date(ms + 9 * 3600e3).toISOString().slice(0, milli ? 23 : 19) + '+09:00';
const open = () => new Promise<IDBDatabase>((ok, no) => {
  const q = indexedDB.open(DB, 1);
  q.onupgradeneeded = () => q.result.createObjectStore(STORE, { autoIncrement: true });
  q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error);
});

export function startRehearsalLog(src: RehearsalSource): RehearsalLog {
  prof.on = true;
  let buf: string[] = [];
  const row = (t: string, o: Record<string, unknown>, at = Date.now(), milli = false) => {
    let world: number | null = null; try { world = src.world(); } catch (e) { /* no island yet */ }
    buf.push(JSON.stringify({ t, jst: jst(at, milli), isl: jst(src.island()), world: world == null ? null : jst(world), ...o }));
  };
  const flush = async () => {
    if (!buf.length) return;
    const chunk = buf.join('\n') + '\n'; buf = [];
    try { const db = await open(); db.transaction(STORE, 'readwrite').objectStore(STORE).add(chunk); db.close(); }
    catch (e) { buf.unshift(chunk.slice(0, -1)); }   // (kept for the next try)
  };
  const all = async () => {
    await flush();
    const db = await open();
    const got = await new Promise<string[]>((ok, no) => { const q = db.transaction(STORE).objectStore(STORE).getAll(); q.onsuccess = () => ok(q.result as string[]); q.onerror = () => no(q.error); });
    db.close(); return got.join('');
  };
  const download = async () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([await all()], { type: 'application/x-ndjson' }));
    a.download = `rehearsal-${jst(Date.now()).slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}.ndjson`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  const clear = async () => { buf = []; await new Promise<void>((ok) => { const q = indexedDB.deleteDatabase(DB); q.onsuccess = q.onerror = q.onblocked = () => ok(); }); row('event', { kind: 'start', text: 'cleared' }); };
  (window as any).seaglassRehearsal = { download, clear, flush, text: all };
  addEventListener('keydown', (e) => { if (e.altKey && e.shiftKey && e.code === 'KeyR') { e.preventDefault(); void download(); } });
  addEventListener('error', (e) => row('event', { kind: 'error', text: String(e.message).slice(0, 200) }));
  addEventListener('unhandledrejection', (e) => row('event', { kind: 'error', text: String((e.reason as Error)?.message ?? e.reason).slice(0, 200) }));
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = performance.now(); row('event', { kind: document.hidden ? 'hidden' : 'shown', text: '' }); });
  addEventListener('pagehide', () => { void flush(); });
  watchAi((c) => row('ai', { ms: c.ms, ok: c.ok, why: c.why, model: c.model, pool: c.pool, input: c.input, output: c.output }, c.at, true));
  row('event', { kind: 'start', text: `${location.pathname}${location.search} ${innerWidth}x${innerHeight}@${devicePixelRatio} ${navigator.userAgent}` });

  // frames: the interval between two (what a viewer sees), and each one's own work (what the app spent on it)
  let lastTs = 0, workT = 0, lastWork = 0, lastParts: Record<string, number> = {}, sec = 0, gaps: number[] = [], workMax = 0;
  let statusWas = '', flushT = 0, seaT = 0;
  const q = (s: number[], k: number) => s[Math.min(s.length - 1, Math.floor(k * s.length))];
  const second = (now: number) => {
    if (gaps.length) { const s = [...gaps].sort((a, b) => a - b); row('sec', { n: s.length, med: +q(s, 0.5).toFixed(1), p95: +q(s, 0.95).toFixed(1), max: +s[s.length - 1].toFixed(1), workMax: +workMax.toFixed(1) }, now); }
    gaps = []; workMax = 0;
    let st = ''; try { st = src.status(); } catch (e) { /* none */ }
    if (st !== statusWas) { statusWas = st; row('status', { text: st }, now); }
    if (now - seaT >= 300e3) { seaT = now; let w: number | null = null; try { w = src.seaWorld(); } catch (e) { /* no island */ } row('sea', { seaWorld: w == null ? null : +w.toFixed(3), seaDrawn: +src.seaDrawn().toFixed(3) }, now); }
    if (now - flushT >= 30e3) { flushT = now; void flush(); }
  };
  return {
    frame(ts) {
      const now = Date.now(), s = Math.floor(now / 1000);
      if (lastTs) {
        const gap = ts - lastTs; gaps.push(gap);
        if (gap > 250) row('slow', { ms: +gap.toFixed(1), work: +lastWork.toFixed(1), parts: Object.fromEntries(Object.entries(lastParts).map(([k, v]) => [k, +v.toFixed(1)])), ...(performance.now() - hiddenAt < gap + 50 ? { hidden: true } : {}) }, now, true);
      }
      lastTs = ts;
      if (s !== sec) { if (sec) second(now); sec = s; }
      workT = performance.now(); prof.ms = {}; prof.open = {};
    },
    frameEnd() {
      lastWork = performance.now() - workT; lastParts = prof.ms; if (lastWork > workMax) workMax = lastWork;
      lastParts['その他'] = Math.max(0, lastWork - (lastParts['住人'] ?? 0) - (lastParts['描画'] ?? 0) - (lastParts['画面読み'] ?? 0));
    },
    event(kind, text) { row('event', { kind, text }); },
  };
}
