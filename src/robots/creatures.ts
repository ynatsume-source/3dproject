// Two of the island's residents are not machines but animals: Rakko, a sea otter, and Kamemaru, an old
// green turtle. Built here as real bodies, moved by hand-written cycles taken from how the animals
// themselves move. The otter swims belly-down and floats on its back; it dives head first, searches the
// bottom with its forepaws, comes up with an urchin, a crab or a clam, rolls over and eats off its chest,
// cracking shells on a stone it keeps; it grooms its fur, and sleeps on its back with its paws over its
// eyes. The turtle rows with both long fore-flippers together, grazes the seagrass with a tug of its head,
// comes up to breathe, sleeps on the bottom, hauls out to bask with its flippers spread, and on land heaves
// itself along the sand with both fore-flippers at once. Nose at +z, as for the robots.
import * as THREE from 'three';
import { talkBeat, type Robot, type Pose, gaitPhase, makeGaze, smoothStep as sm2, variant as hk } from './models';

export interface CMats {
  fur: THREE.Material; furPale: THREE.Material; furDark: THREE.Material; nose: THREE.Material; eye: THREE.Material;
  carapace: THREE.Material; plastron: THREE.Material; skin: THREE.Material; beak: THREE.Material;
  stone: THREE.Material; urchin: THREE.Material; crab: THREE.Material; clam: THREE.Material;
  white?: THREE.Material; kelp?: THREE.Material; blush?: THREE.Material; wire?: THREE.Material; barnacle?: THREE.Material; moss?: THREE.Material;
  chibi?: ChibiMats;
}
// the flat, bright colours of the characters (and their outline)
export interface ChibiMats {
  brown: THREE.Material; belly: THREE.Material; cream: THREE.Material; paw: THREE.Material; nose: THREE.Material; mouth: THREE.Material;
  dark: THREE.Material; iris: THREE.Material; white: THREE.Material; pink: THREE.Material; stone: THREE.Material;
  shell: THREE.Material; seam: THREE.Material; plastron: THREE.Material; skin: THREE.Material; brow: THREE.Material; moss: THREE.Material; barnacle: THREE.Material;
  line?: THREE.Material;
  red?: THREE.Material; brownOdd?: THREE.Material; skinOdd?: THREE.Material; shellPlain?: THREE.Material;   // (the odd ones: flatter, bolder colours)
}
// how characterful it looks (design drafts): head and eye size, a glint in the eyes, rounder cheeks, and
// a signature — the otter's marked stone, kelp scarf or tuft; the turtle's barnacles and old scar, round
// spectacles or a cap of algae
export interface Look {
  head?: number; eye?: number; shine?: boolean; plump?: number;
  stone?: boolean; cheeks?: boolean; scarf?: boolean; tuft?: boolean;          // (the otter)
  toon?: boolean;     // (the otter as a character, owner's notes 2026-10-05: brown head, a cream face and belly, a big black nose)
  dome?: number; barnacles?: boolean; glasses?: boolean; moss?: boolean;       // (the turtle)
}
export type Food = '' | 'urchin' | 'crab' | 'clam';
const DEMO: Pose = { act: 'demo', walk: 1 };
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ease = (cur: number, want: number, dt: number, k: number) => cur + (want - cur) * Math.min(1, dt * k);

export function creatureKit(M: CMats, shadows = false) {
  const own = <T extends THREE.Mesh>(o: T) => { o.castShadow = shadows; return o; };
  const ell = (rx: number, ry: number, rz: number, m: THREE.Material, seg = 28) => { const o = own(new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), m)); o.scale.set(rx, ry, rz); return o; };
  // a body turned on a lathe along z: [radius, z] from tail to nose
  const latheZ = (pts: number[][], m: THREE.Material, seg = 40) => {
    const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg); g.rotateX(Math.PI / 2);
    return own(new THREE.Mesh(g, m));
  };

  // the things an otter brings up from the bottom, and its stone
  function foods() {
    const g = new THREE.Group();
    // a purple sea urchin: a round test bristling with spines
    const ug = new THREE.IcosahedronGeometry(0.032, 2), up = ug.attributes.position;
    for (let i = 0; i < up.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(up, i); const sp = (i % 3 === 0 ? 1.55 : 1.0); v.multiplyScalar(sp); v.y *= 0.8; up.setXYZ(i, v.x, v.y, v.z); }
    ug.computeVertexNormals();
    const urchin = own(new THREE.Mesh(ug, M.urchin));
    // a red rock crab: a broad shell, two claws, legs
    const crab = new THREE.Group();
    crab.add(ell(0.04, 0.016, 0.032, M.crab, 16));
    for (const sx of [-1, 1]) {
      const claw = ell(0.016, 0.01, 0.022, M.crab, 10); claw.position.set(sx * 0.038, 0, 0.03); crab.add(claw);
      for (let k = 0; k < 3; k++) { const l = ell(0.022, 0.004, 0.004, M.crab, 6); l.position.set(sx * 0.05, -0.004, -0.012 + k * 0.012); l.rotation.y = sx * (0.2 - k * 0.25); crab.add(l); }
    }
    // a clam: two ribbed halves
    const clam = new THREE.Group();
    for (const s of [-1, 1]) { const h = ell(0.034, 0.012, 0.028, M.clam, 16); h.position.y = s * 0.008; clam.add(h); }
    g.add(urchin, crab, clam);
    return { g, urchin, crab, clam };
  }

  /* ================= ラッコ — the sea otter ================= */
  // a glint in an eye: a small white dot up and to the front (a child of the eye, so it closes with it)
  const glint = (e: THREE.Mesh) => { const g = ell(0.32, 0.32, 0.3, M.white ?? M.furPale, 8); g.position.set(0.3, 0.42, 0.72); e.add(g); };
  function makeSeaOtter(L: Look = {}): Robot {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    // the body: long and round, the neck hardly narrower than the head, and widest at the hips: a big, round, heavy
    // seat (owner's note, 2026-10-05: the roundness of its bottom matters), tapering to the chest
    const torso = latheZ([[0.001, -0.385], [0.06, -0.38], [0.112, -0.358], [0.15, -0.318], [0.172, -0.262], [0.18, -0.2], [0.174, -0.13], [0.16, -0.05], [0.148, 0.04], [0.136, 0.13], [0.112, 0.225], [0.092, 0.285], [0.086, 0.32], [0.05, 0.345], [0.001, 0.35]], M.fur);
    torso.scale.y = 0.9; body.add(torso);
    // the chest and throat, paler (grizzled in an older otter), on the underside
    const chest = ell(0.1, 0.06, 0.15, M.furPale); chest.position.set(0, -0.075, 0.17); body.add(chest);
    if (L.toon) { const belly = ell(0.118, 0.06, 0.25, M.furPale, 32); belly.position.set(0, -0.112, -0.01); body.add(belly); }   // (the cream running on down to the belly)
    // the head (remade, owner's notes 2026-10-05): a big round face, pale all over (no dark cap), flat in front, nothing
    // standing out from it (a muzzle that does reads as a dog's or a beaver's): the black nose and the white mouth
    // under it lie on the face; small black eyes set wide apart; small round pale ears high on the sides
    const head = new THREE.Group(); head.position.set(0, 0.02, 0.31); body.add(head);
    const toon = !!L.toon;
    // (its shape, from a photograph: a round dome, about as tall as it is wide, longer front to back and narrowing
    // toward the nose, carried on a thick neck that runs into it without a step)
    const sg = new THREE.SphereGeometry(1, 36, 24), sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) { const z = sp.getZ(i), k = Math.max(0, z); sp.setX(i, sp.getX(i) * (1 - 0.3 * k)); sp.setY(i, sp.getY(i) * (1 - 0.18 * k) - 0.12 * k * k); }
    sg.computeVertexNormals();
    const skull = own(new THREE.Mesh(sg, toon ? M.fur : M.furPale)); skull.scale.set(0.088, 0.082, 0.1); skull.position.set(0, 0.026, 0.07); head.add(skull);
    const nape = ell(0.09, 0.08, 0.075, M.fur); nape.position.set(0, 0.008, 0.0); head.add(nape);   // (the dark of the body coming up the back of the neck)
    if (toon) {
      // the character: a cream face from under the eyes down (running on down the throat to the belly), and in the
      // middle of it a big black nose, broad above and narrowing below to a blunt point, standing a little out from
      // the face like a small beak (owner's note, 2026-10-05: no mouth, no cheeks, the nose is the face)
      const mask = ell(0.07, 0.048, 0.07, M.furPale, 28); mask.position.set(0, -0.012, 0.1); head.add(mask);
      const ng = new THREE.SphereGeometry(1, 24, 16), np = ng.attributes.position;
      for (let i = 0; i < np.count; i++) { const y = np.getY(i); np.setX(i, np.getX(i) * (0.55 + 0.45 * (y + 1) / 2)); np.setZ(i, np.getZ(i) * (0.8 + 0.2 * (y + 1) / 2)); }
      ng.computeVertexNormals();
      const nose = own(new THREE.Mesh(ng, M.nose)); nose.scale.set(0.032, 0.023, 0.02); nose.position.set(0, 0.004, 0.163); nose.rotation.x = -0.25; head.add(nose);
    } else {
      for (const sx of [-1, 1]) { const ch = ell(0.05, 0.044, 0.042, M.furPale, 20); ch.position.set(sx * 0.042, -0.012, 0.1); head.add(ch); }   // (the face's round lower half)
      for (const sx of [-1, 1]) { const pad = ell(0.03, 0.022, 0.014, M.white ?? M.furPale, 18); pad.position.set(sx * 0.022, -0.016, 0.152); head.add(pad); }   // (the white mouth, two soft lobes)
      const nose = ell(0.026, 0.018, 0.011, M.nose, 18); nose.position.set(0, 0.008, 0.164); head.add(nose);
    }
    const jaw = new THREE.Group(); jaw.position.set(0, -0.034, 0.1); head.add(jaw);
    const chin = ell(0.026, 0.015, 0.03, M.furPale, 16); chin.position.set(0, -0.004, 0.035); jaw.add(chin);
    if (L.toon) chin.visible = false;   // (the character's face is flat to the chin)
    const ek = L.eye ?? 1;
    const eyes = [-1, 1].map((sx) => { const e = ell(0.0125 * ek, 0.0125 * ek, 0.01 * ek, M.eye, 14); e.position.set(sx * 0.054, 0.046, 0.122); e.rotation.y = sx * 0.45; head.add(e); if (L.shine) glint(e); return e; });
    const eye = new THREE.Object3D(); eye.position.set(0, 0.044, 0.15); head.add(eye);
    head.scale.setScalar(L.head ?? 1); torso.scale.x *= L.plump ?? 1; torso.scale.y *= L.plump ?? 1;
    if (L.cheeks) for (const sx of [-1, 1]) { const b = ell(0.022, 0.014, 0.006, M.blush ?? M.furPale, 12); b.position.set(sx * 0.062, -0.006, 0.134); b.rotation.y = sx * 0.6; head.add(b); }
    if (L.tuft) for (let k = 0; k < 3; k++) { const c = own(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 8), L.toon ? M.fur : M.furPale)); c.position.set((k - 1) * 0.014, 0.1, 0.07 + k * 0.006); c.rotation.set(-0.5 + k * 0.15, 0, (k - 1) * -0.5); head.add(c); }
    if (L.scarf) {
      // a strand of kelp tied round its neck, the ends trailing
      // (low, round the base of the neck, not up under the head where it read as a fringe of hair)
      const sc = own(new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.022, 10, 36), M.kelp ?? M.furDark)); sc.position.set(0, -0.012, 0.235); sc.scale.y = 0.92; body.add(sc);
      const knot = ell(0.026, 0.024, 0.02, M.kelp ?? M.furDark, 12); knot.position.set(0.08, -0.085, 0.245); body.add(knot);
      for (const k of [0, 1]) { const end = ell(0.018, 0.006, 0.07, M.kelp ?? M.furDark, 12); end.position.set(0.095 + k * 0.012, -0.115 - k * 0.012, 0.205 - k * 0.03); end.rotation.set(0.9 + k * 0.3, 0.3, 0.2); body.add(end); }
    }
    for (const sx of [-1, 1]) { const ear = ell(0.016, 0.015, 0.009, L.toon ? M.fur : M.furPale, 12); ear.position.set(sx * 0.08, 0.07, 0.035); ear.rotation.z = -sx * 0.8; head.add(ear); }
    // whiskers: pale, stiff, fanning back from the pads
    const wg = new THREE.CylinderGeometry(0.0011, 0.0005, 0.095, 3); wg.translate(0, 0.0475, 0);
    for (const sx of [-1, 1]) for (let w = 0; w < 5; w++) { const wh = new THREE.Mesh(wg, M.furPale); wh.position.set(sx * 0.03, -0.012 + (w - 2) * 0.005, 0.15); wh.rotation.set(-0.2 + (w - 2) * 0.12, 0, -sx * (1.2 + (w - 2) * 0.08)); head.add(wh); }
    // forelegs: short, ending in round mitten paws (it uses them like hands)
    const arms = [-1, 1].map((sx) => {
      const a = new THREE.Group(); a.position.set(sx * 0.072, -0.07, 0.21); body.add(a);
      const fore = ell(0.026, 0.06, 0.028, M.fur, 14); fore.position.y = -0.045; a.add(fore);
      const paw = ell(0.028, 0.017, 0.032, M.furDark, 14); paw.position.set(0, -0.1, 0.008); a.add(paw);
      return { a, sx };
    });
    // hind legs: big webbed flippers, held back along the body
    const thighs: THREE.Mesh[] = [];
    const feet = [-1, 1].map((sx) => {
      const thigh = ell(0.068, 0.062, 0.088, M.fur, 18); thigh.position.set(sx * 0.11, -0.045, -0.255); body.add(thigh); thighs.push(thigh);
      const f = new THREE.Group(); f.position.set(sx * 0.11, -0.08, -0.3); body.add(f);
      const web = ell(0.05, 0.011, 0.1, M.furDark, 18); web.position.set(sx * 0.008, 0, -0.08); f.add(web);
      for (let k = 0; k < 4; k++) { const toe = ell(0.009, 0.008, 0.03, M.furDark, 8); toe.position.set(sx * 0.008 + (k - 1.5) * 0.024, 0, -0.165); f.add(toe); }
      return { f, sx };
    });
    // its seat, sitting up: a soft round rump that spreads a little on the sand (shown only then)
    const rump = ell(0.17, 0.125, 0.12, M.fur, 28); rump.position.set(0, -0.05, -0.29); rump.visible = false; body.add(rump);
    const tsx = torso.scale.x, tsy = torso.scale.y, headZ = head.position.z, rumpS = rump.scale.clone(), thighS = thighs[0].scale.clone();
    // the tail: short, flat and thick, a little paddle
    const tail = new THREE.Group(); tail.position.set(0, -0.01, -0.365); body.add(tail);
    const tl = ell(0.048, 0.018, 0.15, M.fur); tl.position.z = -0.13; tail.add(tl);
    // its favourite stone, kept in the loose skin under its arm and brought out to crack shells on
    const stone = ell(0.05, 0.026, 0.042, M.stone, 16); stone.position.set(0, -0.155, 0.06); body.add(stone);
    if (L.stone) { const band = own(new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.09, 6, 30), M.white ?? M.furPale)); band.rotation.x = Math.PI / 2; band.scale.set(1, 1, 1.3); stone.add(band); }   // (its own stone: grey with a white band)
    // what it holds, between the paws on its chest
    const hand = new THREE.Group(); hand.position.set(0, -0.15, 0.14); body.add(hand);
    const F = foods(); hand.add(F.g);
    let backK = 0, sleepK = 0, swimK = 0, diveK = 0, landK = 1, pitch = 0, roll = 0, tilt = 0, upK = 0;
    const keepStone = !!L.stone;
    const gaze = makeGaze(1.0, 0.5, 0.6);
    return { root, hand, eye, update(t, dt, p = DEMO) {
      const act = p.act, wet = !!p.wet, k = p.k ?? 0, walk = act === 'demo' ? 0 : Math.min(1, p.walk);
      const gw5 = gaitPhase(p, t, 0.44, 5);   // (its waddle ashore)
      gaze.step(p, dt, 0.4);
      // the spell it is in (from the island), for the doings shown in stages
      const staged = p.elapsed !== undefined, el = p.elapsed ?? 0;
      // cracking a clam on the stone, in rounds of about six seconds: the clam set to the stone, two or three
      // blows, a look at the crack, the clam turned in the paws, up to the mouth, a chew
      const cr = act === 'work' && wet && staged ? (() => {
        const T = el % 6.2, n = 2 + (Math.floor(el / 6.2) % 2);
        const hit = T >= 0.8 && T < 0.8 + n * 0.55 ? (() => { const u = (T - 0.8) % 0.55; return u < 0.35 ? sm2(0, 0.35, u) : u < 0.47 ? 1 - (u - 0.35) / 0.12 : 0; })() : 0;
        const t1 = 0.8 + n * 0.55;
        return { lift: hit, look: sm2(t1, t1 + 0.2, T) * (1 - sm2(t1 + 0.7, t1 + 0.9, T)), turn: sm2(t1 + 0.8, t1 + 1.7, T), mouth: sm2(t1 + 1.7, t1 + 2.2, T) * (1 - sm2(5.6, 6.1, T)), chew: T > t1 + 2.1 && T < 5.9 };
      })() : null;
      // ashore with a shell: picking it up (a stop, nose down to it, one paw to touch it, both to hold it, a turn
      // to look at it); putting it on the pile (down, let go, one nudge to set it right); turning it over to admire it
      const pk = act === 'pick' && !wet && staged && (p.task === 'collect' || p.task === 'pile') ? p.task : '';
      const admire = act === 'look' && p.task === 'admire' ? 1 : 0;
      // showing a find to a friend: up on its haunches before them, the shell held out in both paws, held there
      // while they look, and drawn back in (it keeps it); and ashore at the fire, sitting hunched on its haunches
      const show = act === 'look' && p.task === 'show' && !wet ? 1 : 0, offer = show ? sm2(0.4, 1.1, el) * (1 - sm2(4.3, 5.2, el)) : 0;
      const sitL = act === 'sit' && !wet ? 1 : 0;
      // at the fire it sits up as a cat does (owner's note, 2026-10-05): the body nearly upright on its hips, the hind
      // feet flat on the sand before it, the tail laid out behind, the forepaws held together in front of its chest
      upK = ease(upK, sitL, dt, 1.4);
      // on its back: floating, eating, cracking, grooming, sleeping in the water (and talking, in the water)
      const backish = wet && (act === 'float' || act === 'sleep' || act === 'eat' || act === 'work' || act === 'groom' || act === 'idle' || act === 'look' || act === 'sit' || act === 'demo');
      backK = ease(backK, backish ? 1 : 0, dt, 1.6);
      sleepK = ease(sleepK, act === 'sleep' ? 1 : 0, dt, 1.2);
      swimK = ease(swimK, wet && !backish && act !== 'dive' ? 1 : 0, dt, 2);
      diveK = ease(diveK, act === 'dive' ? 1 : 0, dt, 2.5);
      landK = ease(landK, wet ? 0 : 1, dt, 3);
      // diving: head first down, level along the bottom while it searches, then straight up with its catch
      const wantPitch = act === 'dive' ? (k < 0.12 ? 1.05 : k > 0.86 ? -1.1 : 0.12) : swimK * Math.sin(t * 3.2) * 0.06 - landK * (admire * 0.62 + sitL * 1.2 + show * 0.45);   // (admiring a find ashore or showing it: half up on its haunches; at the fire: sitting up)
      pitch = ease(pitch, wantPitch, dt, 2.2);
      // grooming: rolling over and over in the water, rubbing and squeezing the fur
      const groom = act === 'groom' ? 1 : 0;
      const wantRoll = backK * Math.PI + groom * Math.sin(t * 1.1) * 1.1 + (backish ? Math.sin(t * 0.7) * 0.06 : 0);
      roll = ease(roll, wantRoll, dt, 3);
      body.rotation.set(pitch, 0, roll, 'YXZ');
      // its height: on its back it rides high, belly and chest out of the water; swimming it lies lower
      const bob = Math.sin(t * 1.3) * 0.012;
      // sitting up, at ease: the body settles, shorter and rounder, the belly and seat soft (owner's note: not stiff)
      const ez = upK * landK, breath = Math.sin(t * 1.6) * 0.012 * ez;
      torso.scale.set(tsx * (1 + 0.1 * ez + breath), tsy * (1 + 0.08 * ez + breath), 1 - 0.12 * ez);
      head.position.z = headZ - 0.045 * ez;
      rump.visible = ez > 0.02; rump.scale.set(rumpS.x * (1 + 0.15 * ez), rumpS.y * Math.max(0.01, ez), rumpS.z * Math.max(0.01, ez) * 0.9);
      thighs.forEach((th, i) => { th.position.x = (i ? 1 : -1) * (0.11 + 0.025 * ez); th.position.z = -0.255 + 0.03 * ez; th.scale.copy(thighS).multiplyScalar(1 + 0.2 * ez); });
      // (its height ashore: half up on its haunches as before; sitting up, from how far its shortened body stands)
      // (when it is not sitting up, exactly as before: the island's checks follow it to the last digit)
      let ashore = 0.18 + Math.abs(Math.sin(gw5)) * 0.02 * walk + Math.max(0, -pitch) * 0.37;
      if (ez > 0) ashore += (0.18 * Math.cos(pitch) + Math.sin(Math.max(0, -pitch)) * 0.37 * (1 - 0.14 * ez) - (0.18 + Math.max(0, -pitch) * 0.37)) * ez;
      body.position.y = landK * ashore + (1 - landK) * (backK * -0.02 + swimK * -0.05 + bob);
      // the head: up off the water on its back (looking along its chest at its paws), turning as it looks about
      const chew = act === 'eat' || (act === 'work' && Math.sin(t * 0.8) > 0.6) ? Math.max(0, Math.sin(t * 9)) : 0;
      head.rotation.x = backK * (0.55 + (act === 'eat' ? 0.25 : 0) + sleepK * 0.45) - landK * (act === 'pick' ? -0.5 : 0.05) + diveK * 0.15;
      head.rotation.z = 0;   // (the head on one side: what the moment asks for, eased to below; never kept)
      head.rotation.y = Math.sin(t * 0.4) * 0.35 * (1 - sleepK) * (1 - diveK) * (act === 'eat' || act === 'work' ? 0.2 : 1);
      { const w = gaze.w * (1 - sleepK) * (1 - diveK) * (1 - backK * 0.6); head.rotation.y += (gaze.yaw - head.rotation.y) * w; head.rotation.x += gaze.pitch * 0.7 * w * (1 - backK); }
      if (cr) { head.rotation.x += cr.look * 0.25 - cr.mouth * 0.1; head.rotation.z += cr.look * 0.15; }
      if (act === 'dive' && staged && k > 0.15 && k < 0.85) { const c = el % 5.4; head.rotation.x += 0.35; head.rotation.y += c > 4.2 ? Math.sin((c - 4.2) / 1.2 * Math.PI * 2) * 0.5 : 0; }   // (nose to the bottom; at each pause, a look round)
      if (pk === 'collect') { head.rotation.x += 0.5 * sm2(0.3, 0.9, el) * (1 - sm2(2.4, 2.9, el)) + 0.2 * sm2(2.4, 2.9, el); head.rotation.z += 0.18 * sm2(2.4, 2.9, el); }
      if (pk === 'pile') head.rotation.x += 0.45;
      if (admire) { head.rotation.x += 0.25 + Math.sin(el * 0.9) * 0.08; head.rotation.z += Math.sin(el * 0.7) * 0.2; }
      if (show) head.rotation.x += 0.3 * offer * sm2(2.6, 3.2, el);   // (and a look down at it with them)
      head.rotation.x += upK * landK * 1.1;   // (sitting up: the face kept level, looking ahead)
      { const tb = talkBeat(p, 0.6); head.rotation.x += -tb.cue * 0.14 + tb.nod * 0.26; }
      tilt = ease(tilt, head.rotation.z, dt, 4); head.rotation.z = tilt;
      jaw.rotation.x = chew * 0.35;
      // forepaws: walking on land; tucked to the chest swimming; groping ahead along the bottom; holding food
      // up to the mouth; pounding a clam on the stone; rubbing the fur; folded over the eyes asleep
      arms.forEach((ar, i) => {
        let rx = 0, rz = ar.sx * 0.1;
        if (landK > 0.5 && pk === 'collect') rx = i === 0 ? -0.2 - 0.7 * sm2(1.0, 1.4, el) + 0.5 * sm2(2.4, 2.9, el) : -0.2 - 0.6 * sm2(1.6, 2.0, el) + 0.4 * sm2(2.4, 2.9, el);
        else if (landK > 0.5 && pk === 'pile') rx = -0.85 * (1 - sm2(1.0, 1.5, el)) - (i === 1 ? 0.6 * Math.max(0, Math.sin((el - 1.7) / 0.6 * Math.PI)) * (el > 1.7 && el < 2.3 ? 1 : 0) : 0);
        else if (landK > 0.5 && admire) rx = -1.35 + Math.sin(el * 1.3 + i) * 0.08;
        else if (landK > 0.5 && show) rx = -0.9 - 0.7 * offer;
        else if (landK > 0.5 && sitL) { rx = 0.55 + Math.sin(t * 0.6 + i) * 0.04; rz = -ar.sx * 0.22; }   // (paws together before its chest)
        else if (landK > 0.5) rx = Math.sin(gw5 + i * Math.PI) * 0.5 * walk + (act === 'pick' ? -0.6 : 0);
        else if (act === 'dive' && staged && k > 0.15 && k < 0.85) {
          // feeling along the bottom: one paw probes forward and pats, the other steadies; every third, a pause
          const c = el % 5.4, probe = c < 4.2 ? Math.floor(c / 1.4) : -1, u = (c % 1.4) / 1.4;
          rx = probe >= 0 && probe % 2 === i ? -1.25 + 0.35 * Math.max(0, Math.sin(u * Math.PI * 2)) : -0.6;
        }
        else if (act === 'dive') rx = k > 0.15 && k < 0.85 ? -0.9 + Math.sin(t * 6 + i * 2) * 0.45 : 1.3;
        else if (cr) rx = 0.3 - cr.lift * 0.45 + cr.turn * 0.05 * (i ? 1 : -1) - cr.mouth * 0.4;
        else if (act === 'sleep') rx = -1.25;
        else if (act === 'eat') rx = -0.15 - 0.45 * sm(0.2, 0.9, Math.sin(t * 2.2)) + (i ? 0.05 : 0);
        else if (act === 'work') rx = 0.35 - Math.pow(Math.max(0, Math.sin(t * 7)), 0.5) * 0.5;
        else if (act === 'groom') rx = -0.4 + Math.sin(t * 4 + i * 1.7) * 0.8;
        else if (backK > 0.5) rx = 0.6;   // (floating: paws resting on the chest)
        else rx = 1.3;    // (swimming: tucked against the chest)
        ar.a.rotation.set(rx, 0, rz); ar.a.position.z = 0.21 - 0.03 * ez;
      });
      // hind flippers: paddling on land; stroking up and down together swimming and diving; up in the air on its back
      feet.forEach((f, i) => {
        const stroke = Math.sin(t * (diveK > 0.5 ? 5 : 3.2) + (swimK > 0.5 || diveK > 0.5 ? 0 : i * Math.PI));
        f.f.rotation.set(landK * (-0.55 - upK * 0.95 + Math.sin(gw5 + i * Math.PI + 1) * 0.35 * walk) + (swimK + diveK) * stroke * 0.5 - backK * (0.35 + Math.sin(t * 0.9 + i) * 0.12), f.sx * 0.15, 0);
      });
      tail.rotation.x = (swimK + diveK) * Math.sin(t * 3.2 - 0.8) * 0.3 - backK * 0.25 + upK * landK * 1.35;
      tail.rotation.y = backK * Math.sin(t * 0.6) * 0.15;
      // the stone on the chest while it cracks a clam; what it holds
      stone.visible = act === 'work' || act === 'demo' || (keepStone && (act === 'idle' || act === 'float' || act === 'look'));
      const food: Food = act === 'demo' ? (['urchin', 'crab', 'clam'] as Food[])[Math.floor(t / 4) % 3] : (p.food ?? '') as Food;
      F.urchin.visible = food === 'urchin'; F.crab.visible = food === 'crab'; F.clam.visible = food === 'clam';
      const toMouth = act === 'eat' ? sm(0.2, 0.9, Math.sin(t * 2.2)) : 0;
      hand.position.set(0, -0.15 - toMouth * 0.04, 0.14 + toMouth * 0.1 + (act === 'work' && !cr ? -0.05 + Math.pow(Math.max(0, Math.sin(t * 7)), 0.5) * 0.05 : 0));
      F.g.rotation.y = act === 'eat' ? t * 0.7 : 0;   // (turning it in its paws as it eats round it)
      if (cr) { hand.position.y += cr.lift * 0.05 - cr.mouth * 0.04; hand.position.z += -0.05 + cr.mouth * 0.12; F.g.rotation.y = (Math.floor(el / 6.2) + cr.turn) * Math.PI; jaw.rotation.x = cr.chew ? Math.max(0, Math.sin(t * 9)) * 0.35 : 0; }
      // what it holds ashore (a shell): held up before its face and turned, tipped to the light
      hand.rotation.set(admire ? Math.sin(el * 1.1) * 0.5 : 0, admire ? el * 1.4 : 0, 0);
      if (admire) hand.position.set(0, 0.06, 0.24);
      // eyes: shut asleep; a blink now and then
      eyes.forEach((e) => { e.scale.y = 0.0125 * ek * (sleepK > 0.5 ? 0.12 : Math.sin(t * 0.8 + 1) > 0.985 ? 0.15 : 1); });
    } };
  }

  /* ================= カメマル — the green turtle ================= */
  // the carapace: an oval, broader in front, low-domed, the scutes drawn by its material (from position)
  function carapaceGeo() {
    const g = new THREE.SphereGeometry(1, 56, 22, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const w = 0.37 * (1 + 0.1 * z - 0.08 * z * z), dome = 0.24 * (1 - 0.2 * Math.max(0, -z)) * (1 - 0.08 * z * z);
      p.setXYZ(i, x * w, (0.3 * y + 0.7 * y * y) * dome - 0.01, z * 0.48);   // (low and flaring to a thin rim, not a bowl)
    }
    g.computeVertexNormals();
    // (seen from above: for a painted texture, where there is one)
    const uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 0.8 + 0.5, p.getZ(i) / 1.0 + 0.5);
    return g;
  }
  function makeGreenTurtle(L: Look = {}): Robot {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const shell = own(new THREE.Mesh(carapaceGeo(), M.carapace)); shell.scale.y = L.dome ?? 1; body.add(shell);
    const plastron = ell(0.32, 0.065, 0.42, M.plastron); plastron.position.y = -0.03; body.add(plastron);
    // the head: blunt and rounded, a short snout, a serrated horn beak, big dark eyes; one pair of prefrontal scales
    const neckG = new THREE.Group(); neckG.position.set(0, 0.025, 0.44); body.add(neckG);
    const neck = ell(0.07, 0.058, 0.09, M.skin); neck.position.z = 0.02; neckG.add(neck);
    const head = new THREE.Group(); head.position.set(0, 0.01, 0.09); neckG.add(head);
    const skull = ell(0.072, 0.064, 0.095, M.skin); skull.position.set(0, 0.012, 0.04); head.add(skull);
    const snout = ell(0.05, 0.042, 0.045, M.skin); snout.position.set(0, 0.005, 0.11); head.add(snout);
    const beakU = ell(0.044, 0.02, 0.03, M.skin, 16); beakU.position.set(0, -0.012, 0.122);   // (the upper jaw, part of the snout) head.add(beakU);
    const jaw = new THREE.Group(); jaw.position.set(0, -0.03, 0.06); head.add(jaw);
    const beakL = ell(0.036, 0.012, 0.05, M.beak, 16); beakL.position.set(0, -0.002, 0.045);   // (the lower jaw: a horn edge under it) jaw.add(beakL);
    const ek = L.eye ?? 1;
    const eyes = [-1, 1].map((sx) => {
      const lid = ell(0.024 * ek, 0.02 * ek, 0.022 * ek, M.skin, 14); lid.position.set(sx * 0.05, 0.03, 0.085); head.add(lid);
      const fwd = L.shine ? 0.55 : 0.9;   // (a character's eyes look a little more forward)
      const e = ell(0.018 * ek, 0.017 * ek, 0.012 * ek, M.eye, 14); e.position.set(sx * (0.05 + 0.014 * ek), 0.03 + (L.shine ? 0.006 : 0), 0.09 + (L.shine ? 0.012 : 0)); e.rotation.y = sx * fwd; head.add(e);
      if (L.shine) glint(e);
      return e;
    });
    head.scale.setScalar(L.head ?? 1);
    if (L.glasses) {
      // small round spectacles on its beak (it reads the sea closely)
      for (const sx of [-1, 1]) { const rim = own(new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0035, 6, 24), M.wire ?? M.beak)); rim.position.set(sx * 0.066, 0.03, 0.1); rim.rotation.y = sx * 0.75; head.add(rim);
        const arm = own(new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.07, 5), M.wire ?? M.beak)); arm.rotation.x = Math.PI / 2; arm.position.set(sx * 0.074, 0.034, 0.055); head.add(arm); }
      const bridge = own(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.003, 5, 12, Math.PI), M.wire ?? M.beak)); bridge.position.set(0, 0.04, 0.12); bridge.scale.set(0.85, 0.5, 1); head.add(bridge);
    }
    const shellTop = (x: number, z: number) => { const y = Math.sqrt(Math.max(0, 1 - (x / 0.37) ** 2 - (z / 0.48) ** 2)); return 0.24 * (L.dome ?? 1) * (0.3 * y + 0.7 * y * y) - 0.01; };
    if (L.barnacles) {
      // a cluster of barnacles toward the back, and an old pale scar across the shell
      for (let k = 0; k < 9; k++) { const x = -0.16 + (k % 3) * 0.035 + Math.sin(k * 7) * 0.01, z = -0.22 - Math.floor(k / 3) * 0.035, r = 0.012 + (k % 4) * 0.003;
        const b = own(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r, r * 1.2, 7), M.barnacle ?? M.clam)); b.position.set(x, shellTop(x, z) + r * 0.3, z); body.add(b); }
      const scar = ell(0.14, 0.006, 0.012, M.white ?? M.plastron, 12); scar.position.set(0.1, shellTop(0.1, 0.05) + 0.002, 0.05); scar.rotation.set(0, 0.6, -0.25); body.add(scar);
    }
    const mossG: THREE.Mesh[] = [];
    if (L.moss) {
      // a cap of fine green algae on the top of the shell, swaying in the water
      const fg = new THREE.ConeGeometry(0.008, 0.07, 4); fg.translate(0, 0.035, 0);
      for (let k = 0; k < 60; k++) { const a = k * 2.4, d = Math.sqrt(k / 60) * 0.12, x = Math.cos(a) * d, z = Math.sin(a) * d * 1.2 - 0.03;
        const f = own(new THREE.Mesh(fg, M.moss ?? M.skin)); f.position.set(x, shellTop(x, z) - 0.005, z); f.scale.setScalar(0.7 + (k % 5) * 0.12); f.rotation.set((z) * 3, 0, -x * 3); body.add(f); mossG.push(f); }
    }
    // fore-flippers: long, flat, curved blades with one claw on the leading edge
    const fronts = [-1, 1].map((sx) => {
      const f = new THREE.Group(); f.position.set(sx * 0.28, -0.02, 0.26); body.add(f);
      const blade = ell(0.27, 0.017, 0.075, M.skin, 28); blade.position.set(sx * 0.24, 0, -0.04); blade.rotation.y = sx * 0.32; f.add(blade);
      const root2 = ell(0.08, 0.04, 0.07, M.skin, 16); root2.position.set(sx * 0.04, 0, 0); f.add(root2);
      const claw = ell(0.012, 0.006, 0.016, M.beak, 8); claw.position.set(sx * 0.17, 0.004, 0.04); f.add(claw);
      return { f, sx };
    });
    // hind flippers: short, round paddles
    const backs = [-1, 1].map((sx) => {
      const f = new THREE.Group(); f.position.set(sx * 0.17, -0.025, -0.38); body.add(f);
      const blade = ell(0.1, 0.015, 0.075, M.skin, 18); blade.position.set(sx * 0.07, 0, -0.05); blade.rotation.y = -sx * 0.5; f.add(blade);
      return { f, sx };
    });
    const tail = ell(0.03, 0.02, 0.06, M.skin, 10); tail.position.set(0, -0.02, -0.48); body.add(tail);
    let swimK = 0, landK = 1, grazeK = 0, sleepK = 0, baskK = 0, upK = 0;
    return { root, update(t, dt, p = DEMO) {
      const act = p.act, wet = !!p.wet, walk = act === 'demo' ? 0.6 : Math.min(1, p.walk);
      landK = ease(landK, wet ? 0 : 1, dt, 2);
      swimK = ease(swimK, wet && (act === 'swim' || act === 'walk' || act === 'demo') ? 1 : 0, dt, 1.5);
      grazeK = ease(grazeK, act === 'graze' ? 1 : 0, dt, 1.5);
      sleepK = ease(sleepK, act === 'sleep' ? 1 : 0, dt, 1);
      baskK = ease(baskK, act === 'bask' ? 1 : 0, dt, 1);
      upK = ease(upK, act === 'breathe' || (wet && (act === 'float' || act === 'idle' || act === 'look' || act === 'sit')) ? 1 : 0, dt, 1.5);
      // fore-flippers: on land both heave together (it drags itself forward); swimming they beat together
      // like wings, feathering on the upstroke; grazing they brace; asleep and basking they rest flat
      const beat = t * 1.6, stroke = Math.sin(beat), feather = Math.cos(beat);
      const heave = Math.sin(t * 1.4) * walk * landK;
      fronts.forEach((fl) => {
        const wing = swimK * stroke * 0.65 + upK * Math.sin(t * 0.8) * 0.15;
        const z = fl.sx * (-wing + landK * (-0.25 + heave * 0.2) - grazeK * 0.2 - sleepK * 0.15);
        const y = fl.sx * (landK * heave * 0.5 + sleepK * 0.55 - grazeK * 0.15);
        fl.f.rotation.set(swimK * feather * 0.35, y, z);
      });
      backs.forEach((bl, i) => {
        const steer = Math.sin(t * 0.7 + i) * 0.15 * swimK;
        bl.f.rotation.set(swimK * 0.15 + landK * Math.max(0, Math.sin(t * 1.4 + i * Math.PI)) * 0.3 * walk, bl.sx * (steer - sleepK * 0.2), bl.sx * (0.1 + baskK * 0.15));
      });
      // the body: lifting with each heave on land, pitching gently with each stroke; nose up to breathe,
      // nose down to graze; settled low and still asleep
      body.position.y = landK * (0.1 + Math.max(0, heave) * 0.05 - baskK * 0.03) + (1 - landK) * (swimK * stroke * 0.012);
      body.rotation.x = landK * (-Math.max(0, heave) * 0.08) + swimK * Math.sin(beat - 1) * 0.04 - upK * 0.3 + grazeK * 0.18;
      body.rotation.z = swimK * Math.sin(t * 0.5) * 0.03;
      // the head: raised to breathe, down and tugging at the grass while grazing, drawn in asleep
      const tug = grazeK * Math.pow(Math.max(0, Math.sin(t * 2.4)), 4);
      neckG.position.z = 0.44 - sleepK * 0.05;
      neckG.rotation.x = -upK * 0.35 + grazeK * (0.45 + tug * 0.2) + sleepK * 0.15 + baskK * 0.2 - landK * 0.28 * (1 - baskK);
      neckG.rotation.y = (act === 'look' || act === 'idle' ? Math.sin(t * 0.3) * 0.5 : Math.sin(t * 0.25) * 0.15) * (1 - sleepK) * (1 - grazeK);
      jaw.rotation.x = grazeK * Math.pow(Math.max(0, Math.sin(t * 2.4 - 0.6)), 2) * 0.4 + (act === 'breathe' ? 0.1 : 0);
      const shut = sleepK > 0.5 ? 0.1 : baskK > 0.5 ? 0.4 : Math.sin(t * 0.6) > 0.99 ? 0.2 : 1;
      eyes.forEach((e) => { e.scale.y = ease(e.scale.y, 0.017 * ek * shut, dt, 10); });
      mossG.forEach((f, i) => { f.rotation.x = f.position.z * 3 + Math.sin(t * 1.3 + i) * 0.15 * (wet ? 1 : 0.2) - swimK * 0.6; });
    } };
  }

  /* ================= the characters: Rakko and Kamemaru drawn as anime-style mascots ================= */
  // Big heads, short round bodies, big glossy eyes with two highlights, a cream face, a tiny ω mouth,
  // and a soft dark outline round every part (the inverted-hull trick) — the same lives and motions as
  // the animals above: the otter waddles upright on land, floats on its back, swims belly-down and dives;
  // the turtle (an old one: white bushy brows, a tuft of algae on its shell) rows, grazes, breathes and basks.
  const C = M.chibi;
  function outline(m: THREE.Mesh, k = 0.045) {
    if (!C?.line) return m;
    const o = new THREE.Mesh(m.geometry, C.line); o.scale.setScalar(1 + k); m.add(o); return m;
  }
  const cellBase = (rx: number, ry: number, rz: number, mat: THREE.Material, line = true, seg = 32) => { const m = ell(rx, ry, rz, mat, seg); return line ? outline(m, Math.min(0.14, 0.0065 / Math.max(rx, ry, rz))) : m; };   // (an outline about as thick everywhere)
  // an anime eye: a dark oval with a warm iris low in it, a big highlight up and a small one down
  function animeEye(w: number, h: number, mat: { dark: THREE.Material; iris: THREE.Material; white: THREE.Material }) {
    const g = new THREE.Group();
    g.add(ell(w, h, w * 0.4, mat.dark, 20));
    const iris = ell(w * 0.72, h * 0.55, w * 0.3, mat.iris, 16); iris.position.set(0, -h * 0.32, w * 0.16); g.add(iris);
    const pupil = ell(w * 0.42, h * 0.38, w * 0.3, mat.dark, 14); pupil.position.set(0, -h * 0.2, w * 0.2); g.add(pupil);
    const hi = ell(w * 0.36, w * 0.36, w * 0.2, mat.white, 12); hi.position.set(w * 0.3, h * 0.38, w * 0.3); g.add(hi);
    const hi2 = ell(w * 0.16, w * 0.16, w * 0.12, mat.white, 10); hi2.position.set(-w * 0.32, -h * 0.5, w * 0.3); g.add(hi2);
    return g;
  }
  // ω — two little cups side by side
  function omega(r: number, mat: THREE.Material) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) { const a = own(new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.26, 6, 14, Math.PI), mat)); a.rotation.z = Math.PI; a.position.x = sx * r; g.add(a); }
    return g;
  }

  // the odd faces: 'pokan' — round white eyes with tiny pupils, a mouth hanging open; 'magao' — two black
  // dots and a straight line, quite expressionless. Either way big red cheeks, and it looks right at you.
  type Face = 'anime' | 'pokan' | 'magao' | 'rakko' | 'kame';   // (rakko, kame: the chosen ones — straight-faced; the otter with an otter's build, no cheeks; the turtle without brows)
  function oddEye(face: Face, r: number) {
    const g = new THREE.Group();
    if (face === 'pokan') {
      g.add(ell(r, r, r * 0.35, C!.white, 20));
      const pu = ell(r * 0.26, r * 0.26, r * 0.2, C!.dark, 10); pu.position.set(0, 0, r * 0.3); pu.name = 'pupil'; g.add(pu);
    } else g.add(ell(r * 0.36, r * 0.42, r * 0.2, C!.dark, 12));
    return g;
  }
  function makeChibiOtter(face: Face = 'anime'): Robot {
    if (!C) return makeSeaOtter();
    const odd = face !== 'anime', red = C.red ?? C.pink;
    const cell = (rx: number, ry: number, rz: number, mat: THREE.Material, line = true, seg = 32) => cellBase(rx, ry, rz, mat, line && !odd, seg);
    const outl = (m: THREE.Mesh, k?: number) => (odd ? m : outline(m, k));
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    // (rakko: an otter's build — a small, flat head on a long body, tiny ears, a broad muzzle with whiskers)
    const lean = face === 'rakko', base = lean ? 0.25 : 0.21;
    const pivot = new THREE.Group(); pivot.position.y = base; body.add(pivot);   // (it turns about its middle: upright, on its back, belly-down)
    const fur = odd ? C.brownOdd ?? C.brown : C.brown;
    const trunk = lean ? cell(0.145, 0.235, 0.14, fur) : cell(0.165, 0.19, 0.155, fur); pivot.add(trunk);
    if (!odd) { const belly = cell(0.12, 0.14, 0.06, C.belly, false); belly.position.set(0, -0.02, 0.112); pivot.add(belly); }
    // the head: big and round, with the cream face of an old otter
    const head = new THREE.Group(); head.position.set(0, lean ? 0.27 : 0.25, lean ? 0.035 : 0.02); pivot.add(head);
    head.add(lean ? cell(0.14, 0.112, 0.13, fur) : cell(0.175, 0.155, 0.155, fur));
    let mouth: THREE.Object3D, open: THREE.Object3D, eyes: THREE.Object3D[];
    if (!odd) {
      const face = cell(0.148, 0.118, 0.1, C.cream, false); face.position.set(0, -0.022, 0.072); head.add(face);
      for (const sx of [-1, 1]) { const ch = cell(0.072, 0.06, 0.06, C.cream, false); ch.position.set(sx * 0.058, -0.052, 0.112); head.add(ch); }
      const nose = cell(0.026, 0.017, 0.016, C.nose, false); nose.position.set(0, -0.03, 0.172); head.add(nose);
      const nhi = ell(0.008, 0.004, 0.004, C.white, 8); nhi.position.set(0.006, -0.022, 0.186); head.add(nhi);
      mouth = omega(0.011, C.nose); mouth.position.set(0, -0.056, 0.168); head.add(mouth);
      open = cell(0.02, 0.016, 0.01, C.mouth, false); open.position.set(0, -0.062, 0.165); open.visible = false; head.add(open);
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const d = ell(0.0045, 0.0045, 0.003, C.nose, 6); d.position.set(sx * (0.03 + k * 0.012), -0.044 + (k - 1) * 0.008 + k * 0.002, 0.162 - k * 0.006); head.add(d); }
      eyes = [-1, 1].map((sx) => { const e = animeEye(0.033, 0.043, C); e.position.set(sx * 0.064, 0.016, 0.158); e.rotation.y = sx * 0.4; head.add(e); return e; });
      for (const sx of [-1, 1]) { const b = ell(0.024, 0.012, 0.006, C.pink, 10); b.position.set(sx * 0.104, -0.036, 0.122); b.rotation.y = sx * 0.6; head.add(b); }
    } else if (lean) {
      // a broad cream muzzle with its two whisker pads, the big nose, a short straight mouth; dot eyes; whiskers
      const muzzle = ell(0.08, 0.044, 0.045, C.cream, 24); muzzle.position.set(0, -0.034, 0.1); head.add(muzzle);
      for (const sx of [-1, 1]) { const pad = ell(0.04, 0.032, 0.03, C.cream, 18); pad.position.set(sx * 0.027, -0.042, 0.118); head.add(pad); }
      const nose = ell(0.026, 0.016, 0.014, C.nose, 16); nose.position.set(0, -0.016, 0.15); head.add(nose);
      mouth = own(new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.03, 6), C.nose)); mouth.rotation.z = Math.PI / 2; mouth.position.set(0, -0.06, 0.142); head.add(mouth); open = mouth;
      eyes = [-1, 1].map((sx) => { const e = oddEye('magao', 0.03); e.position.set(sx * 0.062, 0.026, 0.113); e.rotation.y = sx * 0.45; head.add(e); return e; });
      const wg = new THREE.CylinderGeometry(0.0016, 0.001, 0.07, 4); wg.translate(0, 0.035, 0);
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const w = own(new THREE.Mesh(wg, C.cream)); w.position.set(sx * 0.05, -0.04 + (k - 1) * 0.008, 0.125); w.rotation.set(0, 0, -sx * (1.45 + (k - 1) * 0.18)); head.add(w); }
    } else {
      // one round cream muzzle with a big black nose on it; eyes set wide; big red cheeks
      const muzzle = ell(0.075, 0.058, 0.045, C.cream, 24); muzzle.position.set(0, -0.052, 0.13); head.add(muzzle);
      const nose = ell(0.03, 0.02, 0.018, C.nose, 16); nose.position.set(0, -0.026, 0.17); head.add(nose);
      if (face === 'pokan') { mouth = ell(0.022, 0.02, 0.01, C.mouth, 14); mouth.position.set(0, -0.072, 0.168); }
      else { mouth = own(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.04, 6), C.nose)); mouth.rotation.z = Math.PI / 2; mouth.position.set(0, -0.07, 0.172); }
      head.add(mouth); open = mouth;
      eyes = [-1, 1].map((sx) => { const e = oddEye(face, 0.034); e.position.set(sx * 0.078, 0.03, 0.142); e.rotation.y = sx * 0.5; head.add(e); return e; });
      for (const sx of [-1, 1]) { const b = ell(0.032, 0.032, 0.008, red, 16); b.position.set(sx * 0.108, -0.045, 0.112); b.rotation.y = sx * 0.75; head.add(b); }
    }
    if (lean) for (const sx of [-1, 1]) { const ear = cell(0.017, 0.015, 0.011, fur); ear.position.set(sx * 0.126, 0.035, -0.01); head.add(ear); }
    else for (const sx of [-1, 1]) { const ear = cell(0.032, 0.03, 0.022, fur); ear.position.set(sx * 0.14, 0.085, -0.01); head.add(ear); const ein = ell(0.017, 0.016, 0.01, C.paw, 8); ein.position.set(sx * 0.142, 0.085, 0.006); head.add(ein); }
    // its tuft: three little locks sticking up on the crown
    if (!odd) for (let k = 0; k < 3; k++) { const c = own(new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 10), C.brown)); outline(c as THREE.Mesh, 0.12); c.position.set((k - 1) * 0.02, 0.165, 0.03 - Math.abs(k - 1) * 0.01); c.rotation.set(-0.35, 0, (k - 1) * -0.55 + 0.1); head.add(c); }
    else { const c = own(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16, Math.PI * 1.3), fur)); c.position.set(0.0, lean ? 0.13 : 0.17, 0.02); c.rotation.set(0, Math.PI / 2, 0.4); head.add(c); }   // (just one hair, curled)
    // stubby arms, big flat webbed feet, a thick paddle of a tail
    const arms = [-1, 1].map((sx) => { const a = new THREE.Group(); a.position.set(sx * (lean ? 0.125 : 0.14), lean ? 0.1 : 0.07, 0.04); pivot.add(a); const u = lean ? cell(0.04, 0.07, 0.04, fur) : cell(0.045, 0.075, 0.045, fur); u.position.y = -0.05; a.add(u); const pw = cell(0.04, 0.03, 0.04, C.paw); pw.position.set(0, -0.115, 0.012); a.add(pw); return { a, sx }; });
    const feet = [-1, 1].map((sx) => { const f = new THREE.Group(); f.position.set(sx * 0.08, lean ? -0.21 : -0.17, lean ? 0.03 : 0.02); pivot.add(f); const ft = lean ? cell(0.066, 0.024, 0.105, C.paw) : cell(0.062, 0.026, 0.09, C.paw); ft.position.set(0, -0.012, 0.04); f.add(ft); return { f, sx }; });
    const tail = new THREE.Group(); tail.position.set(0, lean ? -0.17 : -0.12, lean ? -0.11 : -0.13); pivot.add(tail);
    const tl = lean ? cell(0.06, 0.028, 0.18, fur) : cell(0.055, 0.03, 0.13, fur); tl.position.set(0, -0.02, lean ? -0.12 : -0.08); tl.rotation.x = lean ? 0.6 : 0.5; tail.add(tl);
    // its stone, grey with a white band, held to the chest
    const hand = new THREE.Group(); hand.position.set(0, lean ? -0.03 : -0.02, lean ? 0.17 : 0.19); pivot.add(hand);
    const stone = cell(0.055, 0.032, 0.046, C.stone); hand.add(stone);
    const band = own(new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.1, 6, 30), C.white)); band.rotation.x = Math.PI / 2; band.scale.set(1, 1, 1.3); stone.add(band);
    const F = foods(); F.g.scale.setScalar(1.3); F.g.position.y = 0.035; hand.add(F.g);
    let pitch = 0, roll = 0, backK = 0, sleepK = 0, swimK = 0, diveK = 0, landK = 1, blink = 2;
    return { root, hand, update(t, dt, p = DEMO) {
      const act = p.act, wet = !!p.wet, k = p.k ?? 0, walk = act === 'demo' ? 0.5 : Math.min(1, p.walk);
      const backish = wet && (act === 'float' || act === 'sleep' || act === 'eat' || act === 'work' || act === 'groom' || act === 'idle' || act === 'look' || act === 'sit');
      backK = ease(backK, backish ? 1 : 0, dt, 1.6); sleepK = ease(sleepK, act === 'sleep' ? 1 : 0, dt, 1.2);
      swimK = ease(swimK, wet && !backish && act !== 'dive' ? 1 : 0, dt, 2); diveK = ease(diveK, act === 'dive' ? 1 : 0, dt, 2.5); landK = ease(landK, wet ? 0 : 1, dt, 3);
      // upright on land; lying back on the water; belly-down swimming; head down diving (and up again)
      const want = landK > 0.5 ? (act === 'pick' ? 0.55 : 0) : backK > 0.5 ? -1.45 : act === 'dive' ? (k < 0.12 ? 2.4 : k > 0.86 ? 0.6 : 1.7) : 1.5;
      pitch = ease(pitch, want, dt, 2.2);
      roll = ease(roll, act === 'groom' ? Math.sin(t * 1.2) * 1.2 : landK * Math.sin(t * 6) * 0.12 * walk, dt, 4);
      pivot.rotation.set(pitch, 0, roll, 'YXZ');
      pivot.position.y = landK * (base + Math.abs(Math.sin(t * 6)) * 0.025 * walk) + (1 - landK) * (0.02 + Math.sin(t * 1.3) * 0.012 - swimK * 0.05);
      const busy = act === 'eat' || act === 'work';
      head.rotation.x = backK * (busy ? 0.55 : 0.3) + sleepK * 0.3 - swimK * 0.9 - diveK * 0.6 + landK * (act === 'pick' ? 0.3 : Math.sin(t * 0.7) * 0.05);
      head.rotation.z = landK * Math.sin(t * 0.5) * 0.12 * (1 - walk);
      head.rotation.y = Math.sin(t * 0.4) * 0.3 * (1 - sleepK) * (busy ? 0.2 : 1);
      arms.forEach((ar, i) => {
        let rx = 0, rz = ar.sx * 0.25;
        if (landK > 0.5) { rx = act === 'pick' ? -0.9 : Math.sin(t * 6 + i * Math.PI) * 0.5 * walk - 0.15; rz = ar.sx * (0.35 + 0.1 * Math.sin(t * 2)); }
        else if (act === 'dive') rx = k > 0.15 && k < 0.85 ? -2.4 + Math.sin(t * 6 + i * 2) * 0.4 : 0.3;
        else if (act === 'sleep') { rx = -2.3; rz = ar.sx * 0.5; }          // (paws over its eyes)
        else if (act === 'eat') rx = -1.1 - 0.4 * sm(0.2, 0.9, Math.sin(t * 2.2));
        else if (act === 'work') rx = -0.9 + Math.pow(Math.max(0, Math.sin(t * 7)), 0.5) * 0.6;
        else if (act === 'groom') rx = -1.6 + Math.sin(t * 4 + i * 1.7) * 0.7;
        else rx = -0.8;
        ar.a.rotation.set(rx, 0, rz);
      });
      feet.forEach((f, i) => { const st = Math.sin(t * (diveK > 0.5 ? 6 : 3.5)); f.f.rotation.set(landK * Math.max(0, Math.sin(t * 6 + i * Math.PI)) * -0.6 * walk + (swimK + diveK) * st * 0.6 + backK * 0.3, 0, f.sx * 0.2); });
      tail.rotation.x = (swimK + diveK) * Math.sin(t * 3.5 - 0.8) * 0.4 + landK * 0.2;
      tail.rotation.y = landK * Math.sin(t * 6) * 0.3 * walk + backK * Math.sin(t * 0.6) * 0.2;
      // what it holds: its stone (out to crack a clam on, or just held), or what it is eating
      const food: Food = act === 'demo' ? '' : (p.food ?? '') as Food;
      F.urchin.visible = food === 'urchin'; F.crab.visible = food === 'crab'; F.clam.visible = food === 'clam';
      stone.visible = !food || act === 'work';
      hand.position.z = (lean ? 0.17 : 0.19) + (act === 'eat' ? sm(0.2, 0.9, Math.sin(t * 2.2)) * 0.05 : 0);
      // its face: blinking, eyes shut asleep (a happy arc), mouth open when it eats
      if ((blink -= dt) < 0) blink = 2.5 + Math.random() * 3;
      const shut = sleepK > 0.5 ? 0.12 : blink < 0.12 ? 0.15 : 1;
      eyes.forEach((e) => { e.scale.y = ease(e.scale.y, shut, dt, 25); });
      const chew = act === 'eat' && Math.sin(t * 9) > 0;
      if (!odd) { open.visible = chew || act === 'demo' && Math.sin(t * 0.8) > 0.7; mouth.visible = !open.visible; }
      else if (face === 'pokan') mouth.scale.y = 0.02 * (chew ? 1.4 : 1);   // (its radius: chewing, it opens wider)
    } };
  }

  function makeChibiTurtle(face: Face = 'anime'): Robot {
    if (!C) return makeGreenTurtle();
    const odd = face !== 'anime', red = C.red ?? C.pink;
    const cell = (rx: number, ry: number, rz: number, mat: THREE.Material, line = true, seg = 32) => cellBase(rx, ry, rz, mat, line && !odd, seg);
    const outl = (m: THREE.Mesh, k?: number) => (odd ? m : outline(m, k));
    const skin = odd ? C.skinOdd ?? C.skin : C.skin;
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    // the shell: a high round dome with big clear scutes and a cream rim
    const sg = new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setXYZ(i, sp.getX(i) * 0.37, sp.getY(i) * 0.3, sp.getZ(i) * 0.48);
    sg.computeVertexNormals();
    { const uv = sg.attributes.uv; for (let i = 0; i < sp.count; i++) uv.setXY(i, sp.getX(i) / 0.8 + 0.5, sp.getZ(i) / 1.0 + 0.5); }   // (seen from above, for a painted shell)
    const shell = outl(own(new THREE.Mesh(sg, odd ? C.shellPlain ?? C.shell : C.shell)), 0.03); body.add(shell);
    const rim = own(new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 10, 48), C.seam)); rim.rotation.x = Math.PI / 2; rim.scale.set(0.37, 0.48, 0.6); rim.position.y = 0.0; body.add(rim);
    const plastron = cell(0.33, 0.08, 0.43, C.plastron); plastron.position.y = -0.03; body.add(plastron);
    // a tuft of algae on the top, and a few barnacles
    const mossG: THREE.Mesh[] = [];
    const fg = new THREE.ConeGeometry(0.012, 0.08, 5); fg.translate(0, 0.04, 0);
    if (odd) {
      // just one sprout growing out of the top of its shell
      const stem = own(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.09, 6), C.moss)); stem.position.set(0, 0.33, -0.02); body.add(stem); mossG.push(stem);
      for (const sx of [-1, 1]) { const lf = ell(0.035, 0.008, 0.018, C.moss, 12); lf.position.set(sx * 0.032, 0.085, 0); lf.rotation.z = sx * 0.4; stem.add(lf); }
    } else for (let k = 0; k < 26; k++) { const a = k * 2.4, d = Math.sqrt(k / 26) * 0.08, x = Math.cos(a) * d, z = Math.sin(a) * d - 0.05; const f = own(new THREE.Mesh(fg, C.moss)); f.position.set(x, 0.3 * Math.sqrt(Math.max(0, 1 - (x / 0.37) ** 2 - (z / 0.48) ** 2)) - 0.01, z); f.rotation.set(z * 4, 0, -x * 4); body.add(f); mossG.push(f); }
    if (!odd) for (let k = 0; k < 5; k++) { const x = -0.2 + k * 0.03, z = -0.28 - (k % 2) * 0.03, y = 0.3 * Math.sqrt(Math.max(0, 1 - (x / 0.37) ** 2 - (z / 0.48) ** 2)); const b = outline(own(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.017, 0.02, 8), C.barnacle)), 0.15); b.position.set(x, y, z); b.lookAt(x * 3, y * 3 + 0.5, z * 3); b.rotateX(Math.PI / 2); body.add(b); }
    // the head: big, round and kind; sleepy-lidded old eyes under white bushy brows; a little smile
    const neckG = new THREE.Group(); neckG.position.set(0, 0.06, 0.44); body.add(neckG);
    const neck = cell(0.075, 0.07, 0.09, skin); neck.position.z = 0.02; neckG.add(neck);
    const head = new THREE.Group(); head.position.set(0, 0.08, 0.13); neckG.add(head);
    head.add(cell(0.15, 0.135, 0.145, skin));
    let eyes: THREE.Object3D[];
    if (!odd) {
      const snout = cell(0.085, 0.06, 0.06, C.skin, false); snout.position.set(0, -0.045, 0.1); head.add(snout);
      const smile = own(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 6, 18, Math.PI * 0.8), C.nose)); smile.rotation.z = Math.PI * 1.1; smile.position.set(0, -0.055, 0.155); head.add(smile);
      for (const sx of [-1, 1]) { const n = ell(0.006, 0.005, 0.004, C.nose, 6); n.position.set(sx * 0.018, -0.02, 0.158); head.add(n); }
      eyes = [-1, 1].map((sx) => { const e = animeEye(0.032, 0.04, C); e.position.set(sx * 0.07, 0.01, 0.125); e.rotation.y = sx * 0.4; head.add(e); return e; });
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const br = ell(0.022, 0.013, 0.016, C.brow, 12); br.position.set(sx * (0.052 + k * 0.022), 0.074 - k * 0.009, 0.122 - k * 0.012); head.add(br); }   // (white brows, drooping outward: an old one)
      for (const sx of [-1, 1]) { const b = ell(0.024, 0.012, 0.006, C.pink, 10); b.position.set(sx * 0.11, -0.035, 0.1); b.rotation.y = sx * 0.7; head.add(b); }
    } else {
      // a wide flat face: eyes far apart, a long mouth (hanging open, or one straight line), one thick white brow each
      if (face === 'pokan') { const m = ell(0.032, 0.022, 0.012, C.mouth, 14); m.position.set(0, -0.06, 0.138); head.add(m); }
      else { const m = own(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.08, 6), C.nose)); m.rotation.z = Math.PI / 2; m.position.set(0, -0.055, 0.142); head.add(m); }
      eyes = [-1, 1].map((sx) => { const e = oddEye(face, 0.032); e.position.set(sx * 0.085, 0.015, 0.118); e.rotation.y = sx * 0.6; head.add(e); return e; });
      if (face !== 'kame') for (const sx of [-1, 1]) { const br = ell(0.045, 0.014, 0.02, C.brow, 14); br.position.set(sx * 0.085, 0.06, 0.112); br.rotation.set(0, sx * 0.6, sx * 0.12); head.add(br); }
      for (const sx of [-1, 1]) { const b = ell(0.03, 0.03, 0.008, red, 16); b.position.set(sx * 0.115, -0.04, 0.09); b.rotation.y = sx * 0.85; head.add(b); }
    }
    const eye = new THREE.Object3D(); eye.position.set(0, 0.015, 0.12); head.add(eye);   // (between its eyes)
    const fronts = [-1, 1].map((sx) => { const f = new THREE.Group(); f.position.set(sx * 0.28, 0.0, 0.22); body.add(f); const bl = cell(0.15, 0.035, 0.075, skin); bl.position.set(sx * 0.11, 0, -0.02); bl.rotation.y = sx * 0.35; f.add(bl); return { f, sx }; });
    const backs = [-1, 1].map((sx) => { const f = new THREE.Group(); f.position.set(sx * 0.18, -0.01, -0.36); body.add(f); const bl = cell(0.075, 0.03, 0.06, skin); bl.position.set(sx * 0.05, 0, -0.03); bl.rotation.y = -sx * 0.5; f.add(bl); return { f, sx }; });
    let swimK = 0, landK = 1, grazeK = 0, sleepK = 0, baskK = 0, upK = 0, blink = 3, bottomK = 0, topT = 0, restK = 0;
    const gaze = makeGaze(0.9, 0.4, 0.6, 2.5);   // (slow to turn its head)
    return { root, eye, update(t, dt, p = DEMO) {
      const act = p.act, wet = !!p.wet, walk = act === 'demo' ? 0.5 : Math.min(1, p.walk);
      const g14 = gaitPhase(p, t, 1.0, 1.4);   // (the heave of its flippers ashore)
      gaze.step(p, dt, 0.2);
      // grazing on the bottom, in mouthfuls of four to eight seconds: a look to the next patch, the neck
      // down to it, two to four short tugs, the head lifted a little to swallow — and on to the next
      const el = p.elapsed ?? t;
      const gz = act === 'graze' && p.elapsed !== undefined ? (() => {
        let t0 = 0;
        for (let i = 0; i < 400; i++) {
          const n = 2 + Math.floor(hk(p.key ?? 0, i) * 3), dur = 0.6 + 0.6 + n * 0.7 + 1.0, tc = el - t0;
          if (tc < dur) {
            const yaw = (hk(p.key ?? 0, i + 90) - 0.5) * 0.7, prevYaw = i ? (hk(p.key ?? 0, i + 89) - 0.5) * 0.7 : 0;
            const down = sm2(0.6, 1.2, tc) * (1 - sm2(dur - 1.0, dur - 0.6, tc));
            const bite = tc > 1.2 && tc < 1.2 + n * 0.7 ? Math.pow(Math.max(0, Math.sin(((tc - 1.2) % 0.7) / 0.7 * Math.PI)), 3) : 0;
            return { down, bite, yaw: prevYaw + (yaw - prevYaw) * sm2(0, 0.6, tc), swallow: sm2(dur - 1.0, dur - 0.7, tc) * (1 - sm2(dur - 0.2, dur, tc)) };
          }
          t0 += dur;
        }
        return { down: 1, bite: 0, yaw: 0, swallow: 0 };
      })() : null;
      // up for a breath: nose to the light on the way up; at the top the head lifted out for the breath
      topT = act === 'breathe' && (p.bottom ?? 1) < 0.06 ? topT + dt : 0;
      const puff = sm2(0, 0.35, topT) * (1 - sm2(1.8, 2.4, topT));
      landK = ease(landK, wet ? 0 : 1, dt, 2); swimK = ease(swimK, wet && (act === 'swim' || act === 'walk') ? 1 : 0, dt, 1.5);
      grazeK = ease(grazeK, act === 'graze' ? 1 : 0, dt, 1.5); sleepK = ease(sleepK, act === 'sleep' ? 1 : 0, dt, 1); baskK = ease(baskK, act === 'bask' ? 1 : 0, dt, 1);
      restK = ease(restK, act === 'sit' && !wet ? 1 : 0, dt, 0.8);   // (at the fire: not sitting as a person would; the shell let down onto the sand, the head up)
      upK = ease(upK, act === 'breathe' || (wet && (act === 'float' || act === 'idle' || act === 'look' || act === 'sit')) ? 1 : 0, dt, 1.5);
      const beat = t * 1.6, stroke = Math.sin(beat), heave = Math.sin(g14) * walk * landK;
      // settled on the bottom (asleep, grazing): its flippers laid down on the sand, not held out in the water
      bottomK = ease(bottomK, (p.bottom ?? 0) * (1 - swimK), dt, 2);
      fronts.forEach((fl) => fl.f.rotation.set(swimK * Math.cos(beat) * 0.3, fl.sx * (landK * heave * 0.5 + sleepK * 0.5 + restK * 0.35), fl.sx * (-swimK * stroke * 0.6 + landK * (-0.15 + heave * 0.2) - grazeK * 0.2 * (1 - bottomK) + baskK * 0.1 - bottomK * 0.3)));
      backs.forEach((bl, i) => bl.f.rotation.set(landK * Math.max(0, Math.sin(g14 + i * Math.PI)) * 0.3 * walk, bl.sx * Math.sin(t * 0.7 + i) * 0.15 * swimK, -bl.sx * bottomK * 0.3));
      body.position.y = landK * (0.12 - restK * 0.02 + Math.max(0, heave) * 0.04) + (1 - landK) * swimK * stroke * 0.012;
      body.rotation.x = -Math.max(0, heave) * 0.06 + swimK * Math.sin(beat - 1) * 0.04 - upK * 0.3 + grazeK * 0.18;
      const tug = grazeK * Math.pow(Math.max(0, Math.sin(t * 2.4)), 4);
      neckG.rotation.x = -upK * 0.3 + grazeK * (gz ? 0.12 + 0.45 * gz.down + 0.18 * gz.bite - 0.12 * gz.swallow : 0.5 + tug * 0.2) + sleepK * 0.25 + baskK * 0.3 - landK * 0.15 * (1 - baskK) - puff * 0.3;
      neckG.rotation.y = Math.sin(t * 0.3) * 0.35 * (1 - sleepK) * (1 - grazeK) + (gz ? gz.yaw * grazeK : 0);
      head.rotation.z = Math.sin(t * 0.45) * 0.08 * (1 - sleepK);
      { const tb = talkBeat(p, 1.3); neckG.rotation.x += -restK * 0.12 - tb.cue * 0.1 + tb.nod * 0.2; }   // (slow to answer: one small nod, well after)
      { const w = gaze.w * (1 - sleepK) * (1 - grazeK * 0.7); neckG.rotation.y += (gaze.yaw - neckG.rotation.y) * w; neckG.rotation.x += gaze.pitch * 0.6 * w; }
      mossG.forEach((f, i) => { f.rotation.x = (odd ? 0 : f.position.z * 4) + Math.sin(t * 1.3 + i) * 0.15 * (wet ? 1 : 0.25) - swimK * 0.5; });
      if ((blink -= dt) < 0) blink = 3 + Math.random() * 3;
      const shut = sleepK > 0.5 || baskK > 0.5 ? 0.12 : blink < 0.15 ? 0.15 : 1;
      eyes.forEach((e) => { e.scale.y = ease(e.scale.y, shut * (odd ? 1 : 0.85), dt, 20); });   // (a little narrowed: gentle, old eyes)
    } };
  }

  // the island's own two, as chosen: Rakko the real otter, a little characterful (bigger eyes with a glint,
  // its tuft, its white-banded stone) with a scarf of kelp round its neck; Kamemaru straight-faced, browless
  const makeRakko = () => makeSeaOtter({ head: 1.18, eye: 1.05, shine: true, toon: true, tuft: true, stone: true, scarf: true }), makeKame = () => makeChibiTurtle('kame');
  return { makeSeaOtter, makeGreenTurtle, makeChibiOtter, makeChibiTurtle, makeRakko, makeKame };
}
