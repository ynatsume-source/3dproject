// LAB: how much the picture flickers as the camera moves. The sea (or island) is let run until the view settles —
// WATCH=dot: watching a resident, as the owner was when the ground's specks twinkled — then held still in time, and
// the camera is slid sideways by a quarter of a pixel at a time, N times, each frame drawn through the whole drawing
// path (post chain and all). Smooth detail, and an edge drawn smoothly, change by even steps under a steady
// quarter-pixel slide; detail finer than a pixel (aliased) pops on and off. For each pixel: the largest second
// difference of its brightness over the frames. Reported: the share of the picture where it is over 0.12 and over
// 0.25 (0..1 brightness), by where it is (upper half, lower half), and a heat map PNG (the frame, with the
// flickering pixels painted red by how much).
// Usage (a build served at PORT): node tools/lab/flicker.cjs   (env PORT 4174, SEA planet, WATCH dot, T 20 (s to run
// first), TIME 17:20, N 8, SIZE 1280x720, OUT flicker, TAG name, TIER lite; POSE 'x,y,z,yaw,pitch' to hold the camera
// there instead (the pose used is printed, to measure the same view again), or POSE land: on the island's sand,
// a walker's height up, looking a little down along it)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const SEA = process.env.SEA || 'planet', WATCH = process.env.WATCH || '', T = +(process.env.T || 20), N = +(process.env.N || 8), OUT = process.env.OUT || 'flicker', TAG = process.env.TAG || SEA + (WATCH ? '-' + WATCH : '');
  const [W, H] = (process.env.SIZE || '1280x720').split('x').map(Number);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  p.setDefaultTimeout(1800000); p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(`http://localhost:${process.env.PORT || 4174}/?tier=${process.env.TIER || 'lite'}&debug&lab&time=${process.env.TIME || '17:20'}&wx=clear#${SEA}`, { waitUntil: 'commit' });
  await p.waitForFunction(() => !!(window.seaglass && window.seaglass.cur && window.seaglass.cur.eco), null, { timeout: 350000 });
  const POSE = process.env.POSE || '';
  const res = await p.evaluate(async ({ WATCH, T, N, POSE }) => {
    const s = window.seaglass; s.endOpening?.();
    if (WATCH) s.startWatch(WATCH);
    s.hold(true); s.advance(Math.max(1, Math.round(T / 0.25)), 0.25);
    // the pose to hold: where the camera is now, or as given
    const c = s.camera; let pos = c.position.clone(), yaw = c.rotation.y, pitch = c.rotation.x;
    if (POSE === 'land') {
      // (on dry sand above the beach, clear of the trees: the first such spot out from the middle)
      const f = s.cur.loc.f; let hit = null;
      for (let r = 0; r < 300 && !hit; r += 5) for (let a = 0; a < 6.28 && !hit; a += 0.2) { const x = Math.cos(a) * r, z = Math.sin(a) * r, h = f(x, z); if (h > 0.6 && h < 1.6 && f(x + Math.cos(a) * 6, z + Math.sin(a) * 6) > 0.4) hit = [x, h, z, a]; }
      if (hit) { pos.set(hit[0], hit[1] + 1.5, hit[2]); yaw = Math.atan2(-Math.cos(hit[3]), -Math.sin(hit[3])); pitch = -0.32; }
    } else if (POSE) { const q = POSE.split(',').map(Number); pos.set(q[0], q[1], q[2]); yaw = q[3]; pitch = q[4]; }
    // (settle there first: the exposure, the trees' and grass's detail near the camera, all catch up with the move)
    s.aim([pos.x, pos.y, pos.z], yaw, pitch); s.advance(30, 0.1);
    const gl = s.renderer?.getContext?.() ?? document.querySelector('canvas').getContext('webgl2');
    const cw = gl.drawingBufferWidth, ch = gl.drawingBufferHeight;
    const px = (2 * Math.tan(c.fov * Math.PI / 360)) / ch;   // (a pixel's width, as an angle, at the middle)
    // (how far a quarter pixel is at the distance of what is in the middle of the lower half of the view: the ground)
    const d = 4;
    const step = px * d * 0.25, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    // (each pixel's brightness frame by frame; what counts is how jerkily it changes: the second difference. An edge
    // sliding across a pixel drawn smoothly brightens or darkens by even steps — second difference near nothing;
    // something too fine for the pixel pops on and off — large)
    const Ls = [], mx = new Float32Array(cw * ch); let first = null;
    for (let i = 0; i < N; i++) {
      s.aim([pos.x + rx * step * i, pos.y, pos.z + rz * step * i], yaw, pitch);
      s.advance(1, 1e-4);
      const buf = new Uint8Array(cw * ch * 4); gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      if (!first) first = buf;
      const L = new Float32Array(cw * ch);
      for (let k = 0; k < cw * ch; k++) L[k] = (buf[k * 4] * 0.299 + buf[k * 4 + 1] * 0.587 + buf[k * 4 + 2] * 0.114) / 255;
      Ls.push(L);
      if (i >= 2) { const a = Ls[i - 2], b = Ls[i - 1]; for (let k = 0; k < cw * ch; k++) { const d2 = Math.abs(L[k] - 2 * b[k] + a[k]); if (d2 > mx[k]) mx[k] = d2; } }
    }
    const mn = new Float32Array(cw * ch);
    s.aim(null);
    // the counts, and the heat map
    let a12 = 0, a25 = 0, lo12 = 0, hi12 = 0;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const x2 = cv.getContext('2d'); const img = x2.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const k = y * cw + x, sp = mx[k] - mn[k], o = ((ch - 1 - y) * cw + x) * 4;
      if (sp > 0.12) { a12++; if (y < ch / 2) lo12++; else hi12++; }
      if (sp > 0.25) a25++;
      const r = Math.min(1, sp / 0.3);
      img.data[o] = first[k * 4] * (1 - r) + 255 * r; img.data[o + 1] = first[k * 4 + 1] * (1 - r); img.data[o + 2] = first[k * 4 + 2] * (1 - r); img.data[o + 3] = 255;
    }
    x2.putImageData(img, 0, 0);
    const n = cw * ch;
    return { pose: [pos.x, pos.y, pos.z, yaw, pitch].map((v) => +v.toFixed(3)).join(','), url: cv.toDataURL('image/png'), over12: a12 / n, over25: a25 / n, lower: lo12 / (n / 2), upper: hi12 / (n / 2), w: cw, h: ch, step };
  }, { WATCH, T, N, POSE });
  fs.writeFileSync(`${OUT}/${TAG}.png`, Buffer.from(res.url.split(',')[1], 'base64'));
  console.log(`${TAG} (pose ${res.pose}): ${res.w}x${res.h}, slide ${(res.step * 1000).toFixed(2)} mm a frame x ${N} — flickering (spread > 0.12) ${(res.over12 * 100).toFixed(2)}% of the picture (lower half ${(res.lower * 100).toFixed(2)}%, upper ${(res.upper * 100).toFixed(2)}%); strongly (> 0.25) ${(res.over25 * 100).toFixed(2)}%`);
  await b.close();
})();
