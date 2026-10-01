// Two of the island's residents are not machines but animals: Rakko, a sea otter, and Kamemaru, an old
// green turtle. Built here as real bodies, moved by hand-written cycles taken from how the animals
// themselves move. The otter swims belly-down and floats on its back; it dives head first, searches the
// bottom with its forepaws, comes up with an urchin, a crab or a clam, rolls over and eats off its chest,
// cracking shells on a stone it keeps; it grooms its fur, and sleeps on its back with its paws over its
// eyes. The turtle rows with both long fore-flippers together, grazes the seagrass with a tug of its head,
// comes up to breathe, sleeps on the bottom, hauls out to bask with its flippers spread, and on land heaves
// itself along the sand with both fore-flippers at once. Nose at +z, as for the robots.
import * as THREE from 'three';
import type { Robot, Pose } from './models';

export interface CMats {
  fur: THREE.Material; furPale: THREE.Material; furDark: THREE.Material; nose: THREE.Material; eye: THREE.Material;
  carapace: THREE.Material; plastron: THREE.Material; skin: THREE.Material; beak: THREE.Material;
  stone: THREE.Material; urchin: THREE.Material; crab: THREE.Material; clam: THREE.Material;
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
  function makeSeaOtter(): Robot {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    // the body: long and round, thickest at the chest and hips, the neck hardly narrower than the head
    const torso = latheZ([[0.001, -0.36], [0.055, -0.352], [0.1, -0.315], [0.13, -0.25], [0.148, -0.15], [0.152, -0.03], [0.148, 0.07], [0.132, 0.16], [0.108, 0.235], [0.092, 0.285], [0.086, 0.32], [0.05, 0.345], [0.001, 0.35]], M.fur);
    torso.scale.y = 0.9; body.add(torso);
    // the chest and throat, paler (grizzled in an older otter), on the underside
    const chest = ell(0.1, 0.06, 0.15, M.furPale); chest.position.set(0, -0.075, 0.17); body.add(chest);
    // the head: broad and round, the blunt muzzle with its whisker pads, the big black nose, small eyes
    const head = new THREE.Group(); head.position.set(0, 0.02, 0.31); body.add(head);
    const skull = ell(0.086, 0.074, 0.092, M.furPale); skull.position.set(0, 0.025, 0.075); head.add(skull);
    const crown = ell(0.08, 0.05, 0.08, M.fur); crown.position.set(0, 0.05, 0.03); head.add(crown);   // (the darker fur running back over the crown)
    const muzzle = ell(0.058, 0.04, 0.045, M.furPale); muzzle.position.set(0, 0.0, 0.15); head.add(muzzle);
    for (const sx of [-1, 1]) { const pad = ell(0.03, 0.026, 0.028, M.furPale, 16); pad.position.set(sx * 0.026, -0.008, 0.168); head.add(pad); }
    const nose = ell(0.022, 0.013, 0.012, M.nose, 16); nose.position.set(0, 0.016, 0.19); head.add(nose);
    const jaw = new THREE.Group(); jaw.position.set(0, -0.03, 0.1); head.add(jaw);
    const chin = ell(0.04, 0.02, 0.05, M.furPale, 16); chin.position.set(0, -0.004, 0.05); jaw.add(chin);
    const eyes = [-1, 1].map((sx) => { const e = ell(0.0125, 0.0125, 0.01, M.eye, 14); e.position.set(sx * 0.046, 0.04, 0.143); head.add(e); return e; });
    for (const sx of [-1, 1]) { const ear = ell(0.013, 0.016, 0.009, M.furDark, 10); ear.position.set(sx * 0.074, 0.062, 0.045); head.add(ear); }
    // whiskers: pale, stiff, fanning back from the pads
    const wg = new THREE.CylinderGeometry(0.0011, 0.0005, 0.075, 3); wg.translate(0, 0.0375, 0);
    for (const sx of [-1, 1]) for (let w = 0; w < 5; w++) { const wh = new THREE.Mesh(wg, M.furPale); wh.position.set(sx * 0.038, -0.01 + (w - 2) * 0.005, 0.168); wh.rotation.set(-0.2 + (w - 2) * 0.12, 0, -sx * (1.2 + (w - 2) * 0.08)); head.add(wh); }
    // forelegs: short, ending in round mitten paws (it uses them like hands)
    const arms = [-1, 1].map((sx) => {
      const a = new THREE.Group(); a.position.set(sx * 0.072, -0.07, 0.21); body.add(a);
      const fore = ell(0.026, 0.06, 0.028, M.fur, 14); fore.position.y = -0.045; a.add(fore);
      const paw = ell(0.028, 0.017, 0.032, M.furDark, 14); paw.position.set(0, -0.1, 0.008); a.add(paw);
      return { a, sx };
    });
    // hind legs: big webbed flippers, held back along the body
    const feet = [-1, 1].map((sx) => {
      const thigh = ell(0.05, 0.05, 0.075, M.fur, 16); thigh.position.set(sx * 0.085, -0.04, -0.24); body.add(thigh);
      const f = new THREE.Group(); f.position.set(sx * 0.095, -0.07, -0.29); body.add(f);
      const web = ell(0.05, 0.011, 0.1, M.furDark, 18); web.position.set(sx * 0.008, 0, -0.08); f.add(web);
      for (let k = 0; k < 4; k++) { const toe = ell(0.009, 0.008, 0.03, M.furDark, 8); toe.position.set(sx * 0.008 + (k - 1.5) * 0.024, 0, -0.165); f.add(toe); }
      return { f, sx };
    });
    // the tail: short, flat and thick, a little paddle
    const tail = new THREE.Group(); tail.position.set(0, -0.01, -0.34); body.add(tail);
    const tl = ell(0.048, 0.018, 0.15, M.fur); tl.position.z = -0.13; tail.add(tl);
    // its favourite stone, kept in the loose skin under its arm and brought out to crack shells on
    const stone = ell(0.05, 0.026, 0.042, M.stone, 16); stone.position.set(0, -0.155, 0.06); body.add(stone);
    // what it holds, between the paws on its chest
    const hand = new THREE.Group(); hand.position.set(0, -0.15, 0.14); body.add(hand);
    const F = foods(); hand.add(F.g);
    let backK = 0, sleepK = 0, swimK = 0, diveK = 0, landK = 1, pitch = 0, roll = 0;
    return { root, hand, update(t, dt, p = DEMO) {
      const act = p.act, wet = !!p.wet, k = p.k ?? 0, walk = act === 'demo' ? 0 : Math.min(1, p.walk);
      // on its back: floating, eating, cracking, grooming, sleeping in the water (and talking, in the water)
      const backish = wet && (act === 'float' || act === 'sleep' || act === 'eat' || act === 'work' || act === 'groom' || act === 'idle' || act === 'look' || act === 'sit' || act === 'demo');
      backK = ease(backK, backish ? 1 : 0, dt, 1.6);
      sleepK = ease(sleepK, act === 'sleep' ? 1 : 0, dt, 1.2);
      swimK = ease(swimK, wet && !backish && act !== 'dive' ? 1 : 0, dt, 2);
      diveK = ease(diveK, act === 'dive' ? 1 : 0, dt, 2.5);
      landK = ease(landK, wet ? 0 : 1, dt, 3);
      // diving: head first down, level along the bottom while it searches, then straight up with its catch
      const wantPitch = act === 'dive' ? (k < 0.12 ? 1.05 : k > 0.86 ? -1.1 : 0.12) : swimK * Math.sin(t * 3.2) * 0.06;
      pitch = ease(pitch, wantPitch, dt, 2.2);
      // grooming: rolling over and over in the water, rubbing and squeezing the fur
      const groom = act === 'groom' ? 1 : 0;
      const wantRoll = backK * Math.PI + groom * Math.sin(t * 1.1) * 1.1 + (backish ? Math.sin(t * 0.7) * 0.06 : 0);
      roll = ease(roll, wantRoll, dt, 3);
      body.rotation.set(pitch, 0, roll, 'YXZ');
      // its height: on its back it rides high, belly and chest out of the water; swimming it lies lower
      const bob = Math.sin(t * 1.3) * 0.012;
      body.position.y = landK * (0.18 + Math.abs(Math.sin(t * 5)) * 0.02 * walk) + (1 - landK) * (backK * -0.02 + swimK * -0.05 + bob);
      // the head: up off the water on its back (looking along its chest at its paws), turning as it looks about
      const chew = act === 'eat' || (act === 'work' && Math.sin(t * 0.8) > 0.6) ? Math.max(0, Math.sin(t * 9)) : 0;
      head.rotation.x = backK * (0.55 + (act === 'eat' ? 0.25 : 0) + sleepK * 0.45) - landK * (act === 'pick' ? -0.5 : 0.05) + diveK * 0.15;
      head.rotation.y = Math.sin(t * 0.4) * 0.35 * (1 - sleepK) * (1 - diveK) * (act === 'eat' || act === 'work' ? 0.2 : 1);
      jaw.rotation.x = chew * 0.35;
      // forepaws: walking on land; tucked to the chest swimming; groping ahead along the bottom; holding food
      // up to the mouth; pounding a clam on the stone; rubbing the fur; folded over the eyes asleep
      arms.forEach((ar, i) => {
        let rx = 0, rz = ar.sx * 0.1;
        if (landK > 0.5) rx = Math.sin(t * 5 + i * Math.PI) * 0.5 * walk + (act === 'pick' ? -0.6 : 0);
        else if (act === 'dive') rx = k > 0.15 && k < 0.85 ? -0.9 + Math.sin(t * 6 + i * 2) * 0.45 : 1.3;
        else if (act === 'sleep') rx = -1.25;
        else if (act === 'eat') rx = -0.15 - 0.45 * sm(0.2, 0.9, Math.sin(t * 2.2)) + (i ? 0.05 : 0);
        else if (act === 'work') rx = 0.35 - Math.pow(Math.max(0, Math.sin(t * 7)), 0.5) * 0.5;
        else if (act === 'groom') rx = -0.4 + Math.sin(t * 4 + i * 1.7) * 0.8;
        else if (backK > 0.5) rx = 0.6;   // (floating: paws resting on the chest)
        else rx = 1.3;    // (swimming: tucked against the chest)
        ar.a.rotation.set(rx, 0, rz);
      });
      // hind flippers: paddling on land; stroking up and down together swimming and diving; up in the air on its back
      feet.forEach((f, i) => {
        const stroke = Math.sin(t * (diveK > 0.5 ? 5 : 3.2) + (swimK > 0.5 || diveK > 0.5 ? 0 : i * Math.PI));
        f.f.rotation.set(landK * (-0.55 + Math.sin(t * 5 + i * Math.PI + 1) * 0.35 * walk) + (swimK + diveK) * stroke * 0.5 - backK * (0.35 + Math.sin(t * 0.9 + i) * 0.12), f.sx * 0.15, 0);
      });
      tail.rotation.x = (swimK + diveK) * Math.sin(t * 3.2 - 0.8) * 0.3 - backK * 0.25;
      tail.rotation.y = backK * Math.sin(t * 0.6) * 0.15;
      // the stone on the chest while it cracks a clam; what it holds
      stone.visible = act === 'work' || act === 'demo';
      const food: Food = act === 'demo' ? (['urchin', 'crab', 'clam'] as Food[])[Math.floor(t / 4) % 3] : (p.food ?? '') as Food;
      F.urchin.visible = food === 'urchin'; F.crab.visible = food === 'crab'; F.clam.visible = food === 'clam';
      const toMouth = act === 'eat' ? sm(0.2, 0.9, Math.sin(t * 2.2)) : 0;
      hand.position.set(0, -0.15 - toMouth * 0.04, 0.14 + toMouth * 0.1 + (act === 'work' ? -0.05 + Math.pow(Math.max(0, Math.sin(t * 7)), 0.5) * 0.05 : 0));
      F.g.rotation.y = act === 'eat' ? t * 0.7 : 0;   // (turning it in its paws as it eats round it)
      // eyes: shut asleep; a blink now and then
      eyes.forEach((e) => { e.scale.y = 0.0125 * (sleepK > 0.5 ? 0.12 : Math.sin(t * 0.8 + 1) > 0.985 ? 0.15 : 1); });
    } };
  }

  /* ================= カメマル — the green turtle ================= */
  // the carapace: an oval, broader in front, low-domed, the scutes drawn by its material (from position)
  function carapaceGeo() {
    const g = new THREE.SphereGeometry(1, 56, 22, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const w = 0.37 * (1 + 0.1 * z - 0.08 * z * z), dome = 0.21 * (1 - 0.2 * Math.max(0, -z)) * (1 - 0.08 * z * z);
      p.setXYZ(i, x * w, y * dome - 0.012 * (1 - y), z * 0.48);
    }
    g.computeVertexNormals();
    return g;
  }
  function makeGreenTurtle(): Robot {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const shell = own(new THREE.Mesh(carapaceGeo(), M.carapace)); body.add(shell);
    const plastron = ell(0.32, 0.065, 0.42, M.plastron); plastron.position.y = -0.03; body.add(plastron);
    // the head: blunt and rounded, a short snout, a serrated horn beak, big dark eyes; one pair of prefrontal scales
    const neckG = new THREE.Group(); neckG.position.set(0, 0.0, 0.44); body.add(neckG);
    const neck = ell(0.07, 0.058, 0.09, M.skin); neck.position.z = 0.02; neckG.add(neck);
    const head = new THREE.Group(); head.position.set(0, 0.01, 0.09); neckG.add(head);
    const skull = ell(0.072, 0.064, 0.095, M.skin); skull.position.set(0, 0.012, 0.04); head.add(skull);
    const snout = ell(0.05, 0.042, 0.045, M.skin); snout.position.set(0, 0.005, 0.11); head.add(snout);
    const beakU = ell(0.033, 0.013, 0.022, M.beak, 16); beakU.position.set(0, -0.016, 0.135); head.add(beakU);
    const jaw = new THREE.Group(); jaw.position.set(0, -0.03, 0.06); head.add(jaw);
    const beakL = ell(0.031, 0.012, 0.05, M.beak, 16); beakL.position.set(0, -0.004, 0.055); jaw.add(beakL);
    const eyes = [-1, 1].map((sx) => {
      const lid = ell(0.024, 0.02, 0.022, M.skin, 14); lid.position.set(sx * 0.05, 0.03, 0.085); head.add(lid);
      const e = ell(0.018, 0.017, 0.012, M.eye, 14); e.position.set(sx * 0.064, 0.03, 0.09); e.rotation.y = sx * 0.9; head.add(e);
      return e;
    });
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
      neckG.rotation.x = -upK * 0.35 + grazeK * (0.45 + tug * 0.2) + sleepK * 0.15 + baskK * 0.2 - landK * 0.1 * (1 - baskK);
      neckG.rotation.y = (act === 'look' || act === 'idle' ? Math.sin(t * 0.3) * 0.5 : Math.sin(t * 0.25) * 0.15) * (1 - sleepK) * (1 - grazeK);
      jaw.rotation.x = grazeK * Math.pow(Math.max(0, Math.sin(t * 2.4 - 0.6)), 2) * 0.4 + (act === 'breathe' ? 0.1 : 0);
      const shut = sleepK > 0.5 ? 0.1 : baskK > 0.5 ? 0.4 : Math.sin(t * 0.6) > 0.99 ? 0.2 : 1;
      eyes.forEach((e) => { e.scale.y = ease(e.scale.y, 0.017 * shut, dt, 10); });
    } };
  }
  return { makeSeaOtter, makeGreenTurtle };
}
