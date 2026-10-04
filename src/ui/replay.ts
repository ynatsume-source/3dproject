// Recording the view: two taps start it, one more stops it and hands over the file, at most KEEP seconds (owner's
// choice, 2026-10: nothing runs until asked — the old way kept the last 15 s always ready, which meant two or
// three video encoders and a frame read back every frame, all the time, heavy on a phone). Only the 3D view is
// recorded (no menus or captions), with the sound if it is on. Nothing is uploaded anywhere.
export const KEEP = 15;

export interface Recorder { type: string; on: boolean; elapsed(): number; begin(): boolean; end(): Promise<Blob | null> }

export function makeRecorder(canvas: HTMLCanvasElement, sound: () => MediaStream | null, light = false): Recorder {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const type = typeof MediaRecorder === 'undefined' || !(canvas as any).captureStream ? '' : types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  let rec: MediaRecorder | null = null, chunks: Blob[] = [], at = 0, stream: MediaStream | null = null;
  const r: Recorder = {
    type, on: false,
    elapsed: () => (r.on ? (performance.now() - at) / 1000 : 0),
    begin() {
      if (r.on || !type) return false;
      try {
        stream = (canvas as any).captureStream(light ? 24 : 30) as MediaStream;
        const a = sound(); if (a) for (const t of a.getAudioTracks()) stream.addTrack(t);
        rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: light ? 3_500_000 : 6_000_000 });
        chunks = [];
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        rec.start(1000);
      } catch (e) { rec = null; stream = null; return false; }
      at = performance.now(); r.on = true;
      return true;
    },
    end() {
      if (!r.on || !rec) return Promise.resolve(null);
      const R = rec; r.on = false; rec = null;
      return new Promise((res) => {
        R.onstop = () => {
          for (const t of stream?.getVideoTracks() ?? []) t.stop();   // (the canvas capture ends with it: nothing left running)
          stream = null;
          res(chunks.length ? new Blob(chunks, { type: type.split(';')[0] }) : null);
        };
        try { R.stop(); } catch (e) { res(null); }
      });
    },
  };
  return r;
}
