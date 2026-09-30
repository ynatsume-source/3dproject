// The island's residents: four robots with four limbs each, built from simple rounded parts and moved
// by hand-written cycles. The builders take their materials from the caller (lit PBR materials in the
// design gallery, the sea's own shaders on the island) and animate to a pose: walking, working,
// carrying, sleeping, swimming or floating.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface Mats { shell: THREE.Material; accent: THREE.Material; teal: THREE.Material; joint: THREE.Material; dark: THREE.Material; glow: THREE.Material; warm: THREE.Material; panel: THREE.Material; stone: THREE.Material }
export type Act = 'demo' | 'idle' | 'walk' | 'work' | 'carry' | 'sleep' | 'swim' | 'float' | 'wave' | 'look' | 'think' | 'pick' | 'hammer' | 'chop' | 'dig' | 'sit';
export interface Pose { act: Act; walk: number; night?: number; wet?: boolean }
export interface Robot { root: THREE.Group; update(t: number, dt: number, pose?: Pose): void; carry?: THREE.Object3D; light?: THREE.Object3D }
const DEMO: Pose = { act: 'demo', walk: 1 };

export function robotKit(M: Mats, shadows = false) {
  const own = <T extends THREE.Mesh>(o: T) => { o.castShadow = shadows; return o; };
  const cap = (r: number, l: number, m: THREE.Material) => own(new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 14), m));
  const box = (w: number, h: number, d: number, r: number, m: THREE.Material) => own(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), m));
  const ball = (r: number, m: THREE.Material) => own(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m));
  const cyl = (r1: number, r2: number, h: number, m: THREE.Material, seg = 20) => own(new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m));
  // a limb segment hanging from a pivot, so rotating the pivot swings it
  function limb(len: number, r: number, m: THREE.Material) {
    const pivot = new THREE.Group(), seg = cap(r, Math.max(0.001, len - 2 * r), m);
    seg.position.y = -len / 2; pivot.add(seg);
    const end = new THREE.Group(); end.position.y = -len; pivot.add(end);
    pivot.add(ball(r * 1.15, M.joint));
    return { pivot, end };
  }
  const glowColor = (m: THREE.Material) => (m as any).color ?? (m as any).uniforms?.uCol?.value;

  // 1. ドット: the icon — a round screen face with dot eyes that blink and glance about
  function makeDot(): Robot {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const torso = box(0.34, 0.34, 0.26, 0.08, M.shell); torso.position.y = 0.52; body.add(torso);
    const belt = box(0.35, 0.05, 0.27, 0.02, M.accent); belt.position.y = 0.4; body.add(belt);
    const pack = box(0.3, 0.3, 0.06, 0.02, M.panel); pack.position.set(0, 0.55, -0.16); pack.rotation.x = -0.1; body.add(pack);
    const head = new THREE.Group(); head.position.y = 0.86; body.add(head);
    head.add(box(0.46, 0.34, 0.32, 0.1, M.shell));
    const screen = box(0.38, 0.25, 0.02, 0.06, M.dark); screen.position.z = 0.158; head.add(screen);
    const eyes: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), M.glow); e.position.set(sx * 0.08, 0.01, 0.17); head.add(e); eyes.push(e); }
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.008), M.glow); mouth.position.set(0, -0.06, 0.17); head.add(mouth);
    const ant = cyl(0.008, 0.008, 0.14, M.joint); ant.position.set(0.12, 0.23, 0); head.add(ant);
    const tip = ball(0.022, M.warm); tip.position.set(0.12, 0.31, 0); head.add(tip);
    const arms = [-1, 1].map((sx) => { const up = limb(0.18, 0.035, M.shell); up.pivot.position.set(sx * 0.22, 0.64, 0); body.add(up.pivot); const lo = limb(0.16, 0.03, M.teal); up.end.add(lo.pivot);
      for (let f = 0; f < 3; f++) { const c = cyl(0.008, 0.012, 0.06, M.joint, 8); c.position.set((f - 1) * 0.018, -0.03, f === 1 ? 0.012 : -0.006); lo.end.add(c); } return { up, lo, sx }; });
    const legs = [-1, 1].map((sx) => { const up = limb(0.16, 0.045, M.joint); up.pivot.position.set(sx * 0.1, 0.36, 0); body.add(up.pivot); const lo = limb(0.14, 0.04, M.shell); up.end.add(lo.pivot);
      const foot = box(0.1, 0.05, 0.16, 0.02, M.accent); foot.position.set(0, -0.02, 0.03); lo.end.add(foot); return { up, lo }; });
    // what it carries: a length of driftwood held across both hands
    const carry = new THREE.Group(); const log = cyl(0.035, 0.03, 0.7, M.stone, 8); log.rotation.z = Math.PI / 2; carry.add(log); carry.position.set(0, 0.5, 0.26); carry.visible = false; body.add(carry);
    // tools, held in the right hand: a hammer, an axe, a hoe
    const hand = arms.find((a) => a.sx > 0)!.lo.end;
    const tool = (len: number, head: THREE.Mesh, hy: number) => { const g = new THREE.Group(); const h = cyl(0.012, 0.012, len, M.stone, 6); h.rotation.x = Math.PI / 2; h.position.z = len * 0.35; g.add(h); head.position.z = len * 0.35 + hy; g.add(head); g.visible = false; hand.add(g); return g; };
    const hammer = tool(0.2, box(0.05, 0.05, 0.1, 0.01, M.joint), 0.1);
    const axeHead = box(0.02, 0.1, 0.08, 0.01, M.joint); axeHead.position.y = 0.04; const axe = tool(0.34, axeHead, 0.15);
    const hoeHead = box(0.12, 0.012, 0.07, 0.004, M.joint); hoeHead.position.y = -0.03; const hoe = tool(0.5, hoeHead, 0.24);
    let blink = 2, look = 0, lookT = 1, sleepK = 0, crouchK = 0, sitK = 0;
    return { root, carry, update(t, dt, p = DEMO) {
      const walk = p.act === 'demo' ? 1 : p.walk, w = t * 4.2;
      sleepK += ((p.act === 'sleep' ? 1 : 0) - sleepK) * Math.min(1, dt * 2);
      crouchK += ((p.act === 'pick' || p.act === 'dig' ? 1 : 0) - crouchK) * Math.min(1, dt * 4);
      sitK += ((p.act === 'sit' ? 1 : 0) - sitK) * Math.min(1, dt * 2);
      const bend = crouchK * (p.act === 'dig' ? 0.45 : 1);
      legs.forEach((l, i) => { const ph = w + i * Math.PI; l.up.pivot.rotation.x = Math.sin(ph) * 0.35 * walk - sleepK * 1.3 - bend * 0.9 - sitK * 1.45; l.lo.pivot.rotation.x = Math.max(0, -Math.cos(ph)) * 0.55 * walk + sleepK * 1.5 + bend * 1.5 + sitK * 0.2; });
      const sw = t * (p.act === 'chop' ? 2.2 : p.act === 'dig' ? 1.6 : 4.5), strike = Math.pow(Math.max(0, Math.sin(sw)), 0.6);   // (a quick fall after a slower rise)
      const wave = p.act === 'wave' || (p.act === 'demo' && Math.max(0, Math.sin(t * 0.4)) > 0.92);
      const tap = Math.max(0, Math.sin(t * 6)) ** 3;
      arms.forEach((a, i) => {
        if (wave && a.sx > 0) { a.up.pivot.rotation.set(0, 0, -2.4); a.lo.pivot.rotation.set(0, 0, Math.sin(t * 10) * 0.4); }
        else if (p.act === 'pick') { a.up.pivot.rotation.set(-0.7 - Math.sin(t * 3 + i) * 0.1, 0, a.sx * 0.15); a.lo.pivot.rotation.set(-0.4, 0, 0); }
        else if (p.act === 'hammer') { if (a.sx > 0) { a.up.pivot.rotation.set(-1.0 - strike * 1.4, 0, 0.1); a.lo.pivot.rotation.set(-0.9 + strike * 0.4, 0, 0); } else { a.up.pivot.rotation.set(-1.0, 0, -0.2); a.lo.pivot.rotation.set(-0.6, 0, 0); } }
        else if (p.act === 'chop' || p.act === 'dig') { const up = p.act === 'chop' ? 2.3 : 2.0; a.up.pivot.rotation.set(-0.5 - strike * up, 0, a.sx * 0.05 - (p.act === 'chop' ? 0.25 : 0)); a.lo.pivot.rotation.set(-0.5 + strike * 0.3, 0, 0); }
        else if (p.act === 'sit') { a.up.pivot.rotation.set(-0.5, 0, a.sx * 0.2); a.lo.pivot.rotation.set(-0.9, 0, 0); }
        else if (p.act === 'work') { a.up.pivot.rotation.set(a.sx > 0 ? -1.3 - tap * 0.7 : -0.9, 0, a.sx * 0.1); a.lo.pivot.rotation.set(a.sx > 0 ? -0.7 + tap * 0.5 : -0.5, 0, 0); }
        else if (p.act === 'carry') { a.up.pivot.rotation.set(-0.9, 0, a.sx * 0.05); a.lo.pivot.rotation.set(-0.7, 0, 0); }
        else { a.up.pivot.rotation.set(-Math.sin(w + i * Math.PI) * 0.35 * walk + sleepK * -0.2, 0, a.sx * (0.12 + sleepK * 0.05)); a.lo.pivot.rotation.set(-0.35 - sleepK * 0.6, 0, 0); }
      });
      carry.visible = p.act === 'carry';
      hammer.visible = p.act === 'hammer'; axe.visible = p.act === 'chop'; hoe.visible = p.act === 'dig';
      body.position.y = Math.abs(Math.sin(w)) * 0.02 * walk - sleepK * 0.24 - bend * 0.16 - sitK * 0.3;
      body.rotation.z = Math.sin(w) * 0.03 * walk;
      body.rotation.x = bend * 0.35 + (p.act === 'chop' || p.act === 'dig' ? strike * 0.15 : 0);
      body.rotation.y = p.act === 'chop' ? (strike - 0.5) * 0.4 : 0;
      if ((blink -= dt) < 0) blink = 2 + Math.random() * 3;
      const b = sleepK > 0.5 ? 0.08 : blink < 0.12 ? 0.1 : 1;
      if ((lookT -= dt) < 0) { lookT = 1 + Math.random() * 2; look = (Math.random() - 0.5) * 0.05; }
      eyes.forEach((e, i) => { e.scale.y += (b - e.scale.y) * Math.min(1, dt * 30); e.position.x += ((i ? 1 : -1) * 0.08 + look - e.position.x) * Math.min(1, dt * 8); });
      mouth.scale.x = wave ? 1.8 : p.act === 'work' ? 0.5 : 1;
      const busy = p.act === 'work' || p.act === 'pick' || p.act === 'hammer' || p.act === 'chop' || p.act === 'dig';
      head.rotation.y = busy ? 0 : Math.sin(t * 0.7) * 0.25 * (1 - sleepK); head.rotation.x = busy ? 0.35 + crouchK * 0.2 : Math.sin(t * 0.5) * 0.06 + sleepK * 0.3 - sitK * 0.1;
      glowColor(M.warm)?.setHSL?.(0.11, 1, (0.55 + 0.25 * Math.sin(t * 3)) * (1 - sleepK * 0.6));
    } };
  }

  // 2. カメマル: a shell of solar cells on four legs that fold into flippers; one big lens of an eye
  function makeKame(): Robot {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.panel);
    shell.scale.set(1, 0.55, 1.2); shell.position.y = 0.34; own(shell); body.add(shell);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 10, 48), M.shell); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.2, 1); rim.position.y = 0.34; body.add(rim);
    const belly = box(0.66, 0.12, 0.84, 0.06, M.shell); belly.position.y = 0.29; body.add(belly);
    const neck = new THREE.Group(); neck.position.set(0, 0.34, 0.5); body.add(neck);
    const nk = cap(0.06, 0.12, M.joint); nk.rotation.x = Math.PI / 2; nk.position.z = 0.06; neck.add(nk);
    const head = box(0.2, 0.16, 0.2, 0.06, M.shell); head.position.set(0, 0.03, 0.16); neck.add(head);
    const lensRing = cyl(0.065, 0.065, 0.04, M.accent, 32); lensRing.rotation.x = Math.PI / 2; lensRing.position.set(0, 0.04, 0.27); neck.add(lensRing);
    const lens = ball(0.05, M.dark); lens.position.set(0, 0.04, 0.28); lens.scale.z = 0.6; neck.add(lens);
    const iris = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.024, 32), M.glow); iris.position.set(0, 0.04, 0.3); neck.add(iris);
    const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
      const up = limb(0.16, 0.05, M.joint); up.pivot.position.set(sx * 0.34, 0.3, sz * 0.3); body.add(up.pivot);
      const paddle = box(0.14, 0.04, 0.2, 0.02, M.teal); paddle.position.set(sx * 0.02, -0.01, 0.04 * sz); up.end.add(paddle);
      return { up, sx, sz, paddle };
    });
    let sleepK = 0, swimK = 0;
    return { root, update(t, dt, p = DEMO) {
      const walk = p.act === 'demo' ? 1 : p.walk, w = t * 1.8;
      sleepK += ((p.act === 'sleep' ? 1 : 0) - sleepK) * Math.min(1, dt * 1.5);
      swimK += ((p.act === 'swim' ? 1 : 0) - swimK) * Math.min(1, dt * 2);
      legs.forEach((l, i) => {
        const ph = w + (i === 0 || i === 3 ? 0 : Math.PI);
        // walking: step; swimming: the front flippers sweep in long strokes, the back ones steer
        const stroke = Math.sin(t * 1.4 + (l.sz > 0 ? 0 : 1.2));
        l.up.pivot.rotation.x = Math.sin(ph) * 0.4 * walk * (1 - swimK) + swimK * (l.sz > 0 ? stroke * 0.6 : 0.3);
        l.up.pivot.rotation.z = l.sx * ((0.5 + Math.max(0, Math.cos(ph)) * 0.25 * walk) * (1 - swimK) + swimK * (l.sz > 0 ? 1.35 + stroke * 0.25 : 1.2) + sleepK * 0.5);
        l.paddle.scale.set(1 + swimK * 0.8, 1, 1 + swimK * 0.6);
      });
      body.position.y = Math.sin(w * 2) * 0.01 * walk - sleepK * 0.12;
      body.rotation.x = swimK * Math.sin(t * 1.4) * 0.05;
      neck.position.z = 0.5 - sleepK * 0.14;
      neck.rotation.y = p.act === 'look' ? Math.sin(t * 0.25) * 0.7 : Math.sin(t * 0.5) * 0.5 * (1 - sleepK); neck.rotation.x = -0.15 + Math.sin(t * 0.8) * 0.1 * (1 - sleepK) + sleepK * 0.3;
      iris.scale.setScalar((1 + 0.25 * Math.sin(t * 2.2)) * (1 - sleepK * 0.7));   // focusing
    } };
  }

  // 3. ラッコ: a sea otter in white shell — one smooth, continuous body (turned on a lathe, not built of
  // capsules), a round head with a pale muzzle, whiskers of light and glowing eyes, small
  // paws that work a stone, webbed hind feet, and a flat tail ending in a ducted propeller
  function makeOtter(): Robot {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const smooth = (g: THREE.BufferGeometry, m: THREE.Material) => own(new THREE.Mesh(g, m));
    const lathe = (pts: number[][], seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const ell = (rx: number, ry: number, rz: number, m: THREE.Material) => { const o = smooth(new THREE.SphereGeometry(1, 40, 28), m); o.scale.set(rx, ry, rz); return o; };
    // the body, sitting up: broad at the hips, a full chest, narrowing into the neck
    const trunk = new THREE.Group(); trunk.position.set(0, 0.06, 0); trunk.rotation.x = -0.28; body.add(trunk);
    const torso = smooth(lathe([[0.001, 0], [0.09, 0.012], [0.15, 0.06], [0.185, 0.15], [0.192, 0.26], [0.178, 0.38], [0.15, 0.48], [0.118, 0.56], [0.1, 0.62], [0.098, 0.66], [0.001, 0.68]]), M.shell);
    torso.scale.set(1, 1, 0.88); trunk.add(torso);
    const belly = ell(0.11, 0.17, 0.065, M.accent); belly.position.set(0, 0.34, 0.13); trunk.add(belly);
    for (const y of [0.2, 0.47]) { const seam = smooth(new THREE.TorusGeometry(1, 0.012, 8, 48), M.joint); seam.rotation.x = Math.PI / 2; const r = y < 0.3 ? 0.187 : 0.157; seam.scale.set(r, r * 0.88, 1); seam.position.y = y; trunk.add(seam); }
    const collar = smooth(new THREE.TorusGeometry(0.1, 0.018, 10, 40), M.teal); collar.rotation.x = Math.PI / 2; collar.position.y = 0.63; trunk.add(collar);
    // head
    const head = new THREE.Group(); head.position.set(0, 0.78, 0.14); body.add(head);
    const skull = ell(0.155, 0.14, 0.15, M.shell); head.add(skull);
    const muzzle = ell(0.078, 0.055, 0.07, M.accent); muzzle.position.set(0, -0.045, 0.115); head.add(muzzle);
    const nose = ell(0.026, 0.018, 0.018, M.dark); nose.position.set(0, -0.02, 0.183); head.add(nose);
    const eyes = [-1, 1].map((sx) => { const e = new THREE.Mesh(new THREE.CircleGeometry(0.02, 24), M.glow); e.position.set(sx * 0.055, 0.03, 0.152); e.lookAt(e.position.clone().multiplyScalar(2)); head.add(e); return e; });
    for (const sx of [-1, 1]) {
      const ear = ell(0.034, 0.03, 0.02, M.shell); ear.position.set(sx * 0.125, 0.085, -0.02); head.add(ear);
      const earIn = ell(0.018, 0.016, 0.01, M.joint); earIn.position.set(sx * 0.125, 0.085, -0.004); head.add(earIn);
      for (let w = 0; w < 3; w++) {   // whiskers of light
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0012, 0.11, 4), M.glow);
        wh.rotation.set(0, 0, sx * (1.35 + (w - 1) * 0.16)); wh.position.set(sx * 0.1, -0.045 + (w - 1) * 0.012, 0.13); head.add(wh);
      }
    }
    // arms and paws
    const arms = [-1, 1].map((sx) => {
      const a = new THREE.Group(); a.position.set(sx * 0.13, 0.62, 0.1); body.add(a);
      const sh = ell(0.046, 0.046, 0.046, M.shell); a.add(sh);
      const fore = smooth(lathe([[0.001, 0], [0.034, -0.01], [0.04, -0.06], [0.034, -0.15], [0.03, -0.19], [0.001, -0.2]], 24), M.shell); a.add(fore);
      const paw = ell(0.04, 0.028, 0.036, M.teal); paw.position.y = -0.2; a.add(paw);
      return { a, sx };
    });
    const stone = ell(0.066, 0.044, 0.055, M.stone); body.add(stone);
    // hind feet: broad webbed flippers
    const feet = [-1, 1].map((sx) => {
      const leg = ell(0.06, 0.05, 0.09, M.shell); leg.position.set(sx * 0.13, 0.07, 0.1); body.add(leg);
      const foot = ell(0.07, 0.016, 0.1, M.teal); foot.position.set(sx * 0.14, 0.02, 0.22); body.add(foot);
      return foot;
    });
    // the tail: flat and tapering, with a small ducted propeller at its tip
    const tail = new THREE.Group(); tail.position.set(0, 0.1, -0.16); body.add(tail);
    const tl = ell(0.07, 0.03, 0.22, M.shell); tl.position.set(0, -0.02, -0.18); tl.rotation.x = 0.2; tail.add(tl);
    const duct = smooth(new THREE.TorusGeometry(0.07, 0.014, 10, 36), M.accent); duct.position.set(0, -0.07, -0.42); tail.add(duct);
    const hub = new THREE.Group(); hub.position.set(0, -0.07, -0.42); tail.add(hub);
    hub.add(ell(0.018, 0.018, 0.03, M.joint));
    for (let k = 0; k < 4; k++) { const bl = box(0.022, 0.06, 0.006, 0.003, M.teal); bl.position.y = 0.032; bl.rotation.y = 0.5; const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; arm.add(bl); hub.add(arm); }
    let backK = 0, sleepK = 0;
    return { root, update(t, dt, p = DEMO) {
      // on its back in the water (floating, cracking shells on its chest, napping), or sitting up ashore
      const onBack = p.act === 'swim' ? 0.35 : p.wet && (p.act === 'float' || p.act === 'sleep' || p.act === 'work') ? 1 : 0;
      backK += (onBack - backK) * Math.min(1, dt * 1.5);
      sleepK += ((p.act === 'sleep' ? 1 : 0) - sleepK) * Math.min(1, dt * 1.5);
      const tap = Math.max(0, Math.sin(t * 5)) ** 3, work = p.act === 'demo' ? (Math.sin(t * 0.3) > -0.2 ? 1 : 0) : p.act === 'work' ? 1 : 0;
      arms.forEach((ar) => { ar.a.rotation.set(-1.15 - tap * 0.4 * work + sleepK * 0.9, 0, ar.sx * (-0.4 - sleepK * 0.25)); });
      stone.visible = work > 0 || p.act === 'demo';
      stone.position.set(0, 0.47 + tap * 0.05 * work, 0.3);
      head.rotation.set(0.25 * work + Math.sin(t * 0.6) * 0.05 + backK * -0.5, Math.sin(t * 0.35) * 0.5 * (1 - work) * (1 - sleepK), Math.sin(t * 0.45) * 0.06);
      const walk = p.act === 'demo' ? 0 : p.walk;
      body.rotation.set(-backK * 1.35, 0, Math.sin(t * 5) * 0.1 * walk);
      body.position.set(0, Math.sin(t * 1.4) * 0.006 + Math.abs(Math.sin(t * 5)) * 0.03 * walk - backK * 0.3, backK * 0.35);
      feet.forEach((f, i) => { f.rotation.x = backK * Math.sin(t * 2 + i * Math.PI) * 0.4; });
      hub.rotation.z += dt * (p.act === 'swim' ? 26 : p.act === 'demo' ? 18 : 2);
      tail.rotation.y = Math.sin(t * 1.3) * 0.2;
      eyes.forEach((e) => { e.scale.y = sleepK > 0.5 ? 0.08 : Math.sin(t * 0.9) > 0.985 ? 0.1 : 1; });
    } };
  }

  // 4. ランタン: a box on four long jointed legs; a ring of light for a face that breathes as it thinks
  function makeLantern(): Robot {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const core = box(0.42, 0.34, 0.42, 0.07, M.shell); core.position.y = 0.72; body.add(core);
    const roof = box(0.46, 0.05, 0.46, 0.02, M.panel); roof.position.y = 0.905; body.add(roof);
    const face = cyl(0.13, 0.13, 0.02, M.dark, 40); face.rotation.x = Math.PI / 2; face.position.set(0, 0.73, 0.212); body.add(face);
    const ringMat = M.glow.clone();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 10, 48), ringMat); ring.position.set(0, 0.73, 0.224); body.add(ring);
    const dotEye = ball(0.02, M.glow); dotEye.position.set(0, 0.73, 0.225); body.add(dotEye);
    // a lamp under the box, lit at night to see the path by
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), M.warm.clone()); lamp.rotation.x = Math.PI / 2; lamp.position.y = 0.548; body.add(lamp);
    const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz], i) => {
      const hip = new THREE.Group(); hip.position.set(sx * 0.2, 0.62, sz * 0.2); hip.rotation.y = Math.atan2(sx, sz); body.add(hip);
      // knee held out level with the hip, shin dropping to the sand: a spider's stance
      const a = limb(0.3, 0.025, M.joint); a.pivot.rotation.x = -1.4; hip.add(a.pivot);
      const b = limb(0.62, 0.022, M.shell); b.pivot.rotation.x = 1.05; a.end.add(b.pivot);
      const toe = ball(0.03, M.accent); b.end.add(toe);
      return { a, b, i };
    });
    let sleepK = 0;
    return { root, light: lamp, update(t, dt, p = DEMO) {
      const walk = p.act === 'demo' ? 1 : p.walk, w = t * 3;
      sleepK += ((p.act === 'sleep' ? 1 : 0) - sleepK) * Math.min(1, dt * 1.5);
      legs.forEach((l) => { const ph = w + [0, Math.PI, Math.PI, 0][l.i]; l.a.pivot.rotation.x = -1.4 - Math.max(0, Math.sin(ph)) * 0.3 * walk + sleepK * 0.35; l.a.pivot.rotation.z = Math.cos(ph) * 0.18 * walk; l.b.pivot.rotation.x = 1.05 + sleepK * 0.5; });
      body.position.y = Math.sin(w * 2) * 0.012 * walk - sleepK * 0.22; body.rotation.x = Math.sin(t * 0.6) * 0.04 + (p.act === 'think' ? -0.25 : 0);   // thinking: face tipped up to the sky
      const think = 0.5 + 0.5 * Math.sin(t * (p.act === 'think' ? 3.2 : 1.6));
      glowColor(ringMat)?.setHSL?.(0.5 - think * 0.05, 0.85, (0.55 + 0.25 * think) * (1 - sleepK * 0.75));
      ring.scale.setScalar(0.95 + 0.08 * think);
      dotEye.position.x = Math.sin(t * 0.7) * 0.05;
      lamp.visible = (p.night ?? 0) > 0.4 && p.act !== 'sleep';
    } };
  }
  return { makeDot, makeKame, makeOtter, makeLantern };
}
