// "That was lovely — keep it": the last 15-30 seconds of the view, saved on request.
// Two recorders run staggered by half a window, each starting afresh every 30 s; when asked, the one that
// has been running longer (15-30 s) is stopped and handed over as a file. Only the 3D view is recorded
// (no menus or captions), with the sound if it is on. Nothing is uploaded anywhere.
const WINDOW = 30_000;

export interface Replay { on: boolean; start(): boolean; stop(): void; save(): Promise<Blob | null>; type: string }

export function makeReplay(canvas: HTMLCanvasElement, sound: () => MediaStream | null): Replay {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const type = typeof MediaRecorder === 'undefined' ? '' : types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  let stream: MediaStream | null = null, slots: { rec: MediaRecorder; chunks: Blob[]; at: number }[] = [], timers: number[] = [];
  const begin = (i: number) => {
    if (!stream) return;
    const old = slots[i]; if (old && old.rec.state !== 'inactive') { old.rec.ondataavailable = null; old.rec.stop(); }
    // (the sound, once it has been switched on: from the next fresh recorder)
    const a = sound(); if (a && !stream.getAudioTracks().length) for (const t of a.getAudioTracks()) stream.addTrack(t);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
    const s = { rec, chunks: [] as Blob[], at: performance.now() };
    rec.ondataavailable = (e) => { if (e.data.size) s.chunks.push(e.data); };
    rec.start(1000); slots[i] = s;
  };
  const r: Replay = {
    on: false, type,
    start() {
      if (r.on) return true;
      if (!type || !(canvas as any).captureStream) return false;
      stream = (canvas as any).captureStream(30) as MediaStream;
      const a = sound(); if (a) for (const t of a.getAudioTracks()) stream.addTrack(t);
      slots = [];
      begin(0);
      timers.push(window.setTimeout(() => { begin(1); timers.push(window.setInterval(() => begin(1), WINDOW)); }, WINDOW / 2));
      timers.push(window.setInterval(() => begin(0), WINDOW));
      r.on = true; return true;
    },
    stop() {
      for (const t of timers) { clearTimeout(t); clearInterval(t); } timers = [];
      for (const s of slots) if (s && s.rec.state !== 'inactive') { s.rec.ondataavailable = null; s.rec.stop(); }
      slots = []; stream?.getVideoTracks().forEach((t) => t.stop()); stream = null; r.on = false;
    },
    async save() {
      if (!r.on || !slots.length) return null;
      // the longer-running of the two (it holds 15-30 s); it is replaced by a fresh one at once
      const i = slots.length > 1 && slots[1].at < slots[0].at ? 1 : 0, s = slots[i];
      const done = new Promise<Blob>((res) => { s.rec.onstop = () => res(new Blob(s.chunks, { type: type.split(';')[0] })); });
      s.rec.stop(); begin(i);
      return done;
    },
  };
  return r;
}
