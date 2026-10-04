// Headless check: nothing comes out of nowhere (src/eco/unseen.ts). Runs each rare scene with the camera held
// still, looking one way, and watches every mesh and instance the scene adds (and the bait ball's): one that
// appears must appear where it cannot be seen, and one that goes must already be out of sight. Also the
// manta train over the reef: never down inside it.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/appear-check.ts [sea]
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { skyState, sunEvents } from '../src/time/clock';
import { unseen } from '../src/eco/unseen';

const seaId = process.argv[2] || 'miyako';
const loc = LOCATIONS.find((l) => l.id === seaId)!;
let fails = 0;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
for (const id of ['mantatrain', 'fishwall', 'tornado', 'hammers', 'heatrun', 'bigbait']) {
  const oc: any = buildOcean(loc);
  const ev = sunEvents(Date.UTC(2026, 1, 10, 3), loc);
  oc.eco.setSky(skyState(ev.noon, loc), new THREE.Vector2(0.5, 0.2));
  // a spot over open water to watch from, looking north
  let cam = new THREE.Vector3(0, -5, 0);
  for (let r = 0; r < 100; r += 6) { let hit = false; for (let a = 0; a < 6.28; a += 0.5) { const x = Math.cos(a) * r, z = Math.sin(a) * r; if (oc.T.top(x, z) < -12) { cam = new THREE.Vector3(x, Math.max(oc.T.top(x, z) + 4, -8), z); hit = true; break; } } if (hit) break; }
  const fx = 0, fz = -1;
  let t = 0;
  for (let k = 0; k < 50; k++) { t += 0.1; oc.eco.step(0.1, t, cam, fx, fz); }
  const before = new Set(oc.group.children);
  // (the bait school and its hunters are part of the sea from the start, ADR 0005: what of them is in sight before
  // the event is asked for was already there, not appearing — the frame before counts as the first)
  const baitMeshes = () => oc.group.children.filter((o: any) => o.isInstancedMesh && o.visible && (o.count >= 1000 || o.userData?.baitPack));
  const pre = new Map<string, THREE.Vector3>();
  if (id === 'bigbait') for (const im of baitMeshes()) { const step = Math.max(1, Math.floor(im.count / 400)); for (let i = 0; i < im.count; i += step) { im.getMatrixAt(i, _m); const e = _m.elements; if (Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]) > 1e-6) pre.set(im.uuid + ':' + i, new THREE.Vector3(e[12], e[13], e[14])); } }
  const ok = oc.rare.start(id, oc.eco.env, cam, fx, fz);
  if (!ok) { console.log(`${id}: could not start here (no suitable water) — skipped`); continue; }
  const mine = new Set(oc.group.children.filter((o: THREE.Object3D) => !before.has(o)));   // (what the scene itself put in)
  const watch = () => {
    const list: THREE.Object3D[] = oc.group.children.filter((o: THREE.Object3D) => mine.has(o));
    if (id === 'bigbait' && oc.bait) { for (const o of oc.group.children) if ((o as any).isInstancedMesh && ((o as any).count >= 1000 || (o as any).userData?.baitPack)) list.push(o); }
    return list;
  };
  // present: key → position
  let last = pre;
  const snap = () => {
    const now = new Map<string, THREE.Vector3>();
    for (const o of watch()) {
      if (!o.visible) continue;
      const im = o as THREE.InstancedMesh;
      if ((im as any).isInstancedMesh) {
        const step = Math.max(1, Math.floor(im.count / 400));
        // (present: a matrix with any size at all — hidden instances are all zeros, which decompose() reports as scale 1)
        for (let i = 0; i < im.count; i += step) { im.getMatrixAt(i, _m); const e = _m.elements; if (Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]) > 1e-6) now.set(o.uuid + ':' + i, _p.set(e[12], e[13], e[14]).clone()); }
      } else now.set(o.uuid, o.getWorldPosition(new THREE.Vector3()));
    }
    return now;
  };
  let appearedSeen = 0, vanishedSeen = 0, eaten = 0, frames = 0, worstClip = 0, ended = -1;
  for (let k = 0; k < 6000; k++) {   // up to 10 minutes
    t += 0.1; oc.eco.step(0.1, t, cam, fx, fz);
    const now = snap();
    {   // (from the first frame on: what the scene puts down as it begins counts as appearing too)
      for (const [key, p] of now) if (!last.has(key) && !unseen(oc, p.x, p.y, p.z, cam, fx, fz, 1)) { if (appearedSeen++ < 3) console.log(`  ${id}: appeared in sight at ${p.distanceTo(cam).toFixed(0)} m (t=${(k / 10).toFixed(0)} s)`); }
      // (fish of a school gone in a frame, in sight, all from one spot a mouthful across: eaten — a predator's doing,
      // not a vanishing; gone from all over at once is)
      const gone = [...last].filter(([key, p]) => !now.has(key) && !unseen(oc, p.x, p.y, p.z, cam, fx, fz, 1));
      const byObj = new Map<string, THREE.Vector3[]>(); for (const [key, p] of gone) if (key.includes(':')) { const o = key.split(':')[0]; if (!byObj.has(o)) byObj.set(o, []); byObj.get(o)!.push(p); }
      const mouthful = (key: string) => { const ps = byObj.get(key.split(':')[0]); if (!ps) return false; const c = ps.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(ps.length); return ps.every((p) => p.distanceTo(c) < 3); };
      eaten += gone.filter(([key]) => key.includes(':') && mouthful(key)).length;
      for (const [key, p] of gone) if (!(key.includes(':') && mouthful(key))) { if (vanishedSeen++ < 3) console.log(`  ${id}: vanished in sight at ${p.distanceTo(cam).toFixed(0)} m (t=${(k / 10).toFixed(0)} s) key ${key.slice(-8)} p ${p.toArray().map((v) => v.toFixed(1))} cam ${cam.toArray().map((v) => v.toFixed(1))} running ${!!oc.rare.running}`); }
    }
    if (id === 'mantatrain') for (const o of watch()) if ((o as any).isMesh && !(o as any).isInstancedMesh) { const w = o.position, span = o.scale.x; for (const [dx, dz] of [[0, 0], [span * 0.5, 0], [-span * 0.5, 0], [0, span * 0.5], [0, -span * 0.5]]) worstClip = Math.max(worstClip, oc.T.top(w.x + dx, w.z + dz) - (w.y - 0.15)); }
    last = now; frames++;
    if (!oc.rare.running && (id !== 'bigbait' || !oc.bait.st.active)) { ended = k / 10; break; }
  }
  const bad = appearedSeen + vanishedSeen > 0 || worstClip > 0.3 || ended < 0;
  if (bad) fails++;
  console.log(`${id}: ${ended < 0 ? 'still running after 10 min' : `over after ${ended.toFixed(0)} s`}, appeared in sight ${appearedSeen}, vanished in sight ${vanishedSeen} (eaten ${eaten})${id === 'mantatrain' ? `, deepest into the reef ${Math.max(0, worstClip).toFixed(2)} m` : ''} ${bad ? 'FAIL' : 'ok'}`);
}
console.log(fails ? `FAIL (${fails})` : 'PASS');
if (fails) process.exit(1);
