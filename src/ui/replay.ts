// "That was lovely — keep it": the last 15 seconds of the view, always kept ready, saved on request.
// A recording cannot be cut at an arbitrary start without encoding it again, so several recorders run
// staggered, each starting afresh every PERIOD; when asked, the youngest one that has been running at least
// 15 s is stopped and handed over as a file (15 s and a few more). Only the 3D view is recorded (no menus or
// captions), with the sound if it is on. Nothing is uploaded anywhere.
export const KEEP = 15;
// (three staggered: 15-22.5 s each time. On a phone or tablet two, lighter — 24 fps, 2.5 Mbps: three hardware
// encoders on an iPad, always on, are a likely way for Safari to drop the page)
export interface Replay { on: boolean; start(): boolean; save(): Promise<Blob | null>; reset(): void; type: string; held(): number; pause(): void; resume(): void }

export function makeReplay(canvas: HTMLCanvasElement, sound: () => MediaStream | null, light = false): Replay {
  const SLOTS = light ? 2 : 3, PERIOD = (KEEP * SLOTS / (SLOTS - 1)) * 1000, FPS = light ? 24 : 30, BPS = light ? 2_500_000 : 5_000_000;
  let timers: number[] = [], paused = false;
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const type = typeof MediaRecorder === 'undefined' ? '' : types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  let stream: MediaStream | null = null;
  const slots: ({ rec: MediaRecorder; chunks: Blob[]; at: number } | null)[] = [];
  const begin = (i: number) => {
    if (!stream) return;
    const old = slots[i]; if (old && old.rec.state !== 'inactive') { old.rec.ondataavailable = null; old.rec.stop(); }
    slots[i] = null;
    // (the sound, once it has been switched on: from the next fresh recorder)
    const a = sound(); if (a && !stream.getAudioTracks().length) for (const t of a.getAudioTracks()) stream.addTrack(t);
    try {
      const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: BPS });
      const s = { rec, chunks: [] as Blob[], at: performance.now() };
      rec.ondataavailable = (e) => { if (e.data.size) s.chunks.push(e.data); };
      rec.onerror = () => { if (slots[i] === s) slots[i] = null; };   // (a browser that allows fewer at once: the others carry on)
      rec.start(1000); slots[i] = s;
    } catch (e) { /* (as above) */ }
  };
  const age = (s: { at: number }) => (performance.now() - s.at) / 1000;
  const run = () => {
    for (let i = 0; i < SLOTS; i++) {
      const go = () => { begin(i); timers.push(window.setInterval(() => begin(i), PERIOD)); };
      if (i === 0) go(); else timers.push(window.setTimeout(go, (PERIOD / SLOTS) * i));
    }
  };
  const r: Replay = {
    on: false, type,
    // how many of the last 15 seconds a save would hold now (it fills up to 15, then stays there)
    held() {
      const live = slots.filter((s) => s) as { at: number }[];
      return live.length ? Math.min(KEEP, Math.max(...live.map(age))) : 0;
    },
    start() {
      if (r.on) return true;
      if (!type || !(canvas as any).captureStream) return false;
      stream = (canvas as any).captureStream(FPS) as MediaStream;
      const a = sound(); if (a) for (const t of a.getAudioTracks()) stream.addTrack(t);
      r.on = true;
      if (!paused) run();
      return true;
    },
    // (nothing to keep while the page is hidden or the globe is up: every recorder stopped, and started afresh after)
    pause() {
      if (paused) return; paused = true;
      for (const t of timers) { clearTimeout(t); clearInterval(t); }
      timers = [];
      for (let i = 0; i < slots.length; i++) { const s = slots[i]; if (s && s.rec.state !== 'inactive') { s.rec.ondataavailable = null; s.rec.stop(); } slots[i] = null; }
    },
    resume() { if (!paused) return; paused = false; if (r.on) run(); },
    // (the canvas changed size: every recorder begins again, so what is held and what a save gives agree)
    reset() { if (!r.on || paused) return; for (let i = 0; i < SLOTS; i++) begin(i); },
    async save() {
      const live = slots.map((s, i) => [s, i] as const).filter(([s]) => s) as (readonly [{ rec: MediaRecorder; chunks: Blob[]; at: number }, number])[];
      if (!live.length) return null;
      // the youngest that already holds 15 s (else, early on, the oldest); it is replaced by a fresh one at once
      const full = live.filter(([s]) => age(s) >= KEEP).sort((a, b) => age(a[0]) - age(b[0]));
      const [s, i] = full[0] ?? live.sort((a, b) => age(b[0]) - age(a[0]))[0];
      const done = new Promise<Blob>((res) => { s.rec.onstop = () => res(new Blob(s.chunks, { type: type.split(';')[0] })); });
      s.rec.stop(); begin(i);
      return done;
    },
  };
  return r;
}
