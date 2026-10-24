// Carpet sharks held against the rock (eco/carpetsharks; sea level step 3, before any way out is tried — the science
// team, 2026-10-22): since a turn or a step that would put part of a long body into the rock beside it is not taken
// (3800bed), a swimming one can find every step it tries refused and stay where it is. This measures how often, and
// for how long, at the year's lowest water, mean sea level and the year's highest (-1.04, 0, +0.91 m), by day and by
// night (by day they rest: DAY=1 for both), the camera cruising a wide loop as in carpet-check.
//   held      a frame swimming (not resting, not coming in to lie) in which it moved less than 1 mm across the ground —
//             every step refused; held for: the longest run of such frames, one shark
//   circling  swimming, and less than 0.5 m across the ground in the last 30 s (a tight loop, or held); an episode ends
//             once it has gone 0.5 m
//   shallow   a frame whose water over the bottom here is less than its body needs (the bottom within 0.8 m of the top)
// Want: held no more than 1% of the swimming, never for 10 s on end; no shallow frame.
// Usage: npx tsx --import ./scripts/node-assets.mjs scripts/carpet-stuck-check.ts [sea ...]   (env MIN 4, SEED 1, DAY)
import * as THREE from 'three';
import { LOCATIONS } from '../src/data/locations';
import { buildOcean } from '../src/ocean/build';
import { setSeaLevel, waterTopAt } from '../src/ocean/air';
import { skyState, sunEvents } from '../src/time/clock';
import { mulberry32 } from '../src/core/math';

const MIN = +(process.env.MIN || 4), seas = process.argv.slice(2), dt = 0.05, WIN = 30 / dt;
const rows: string[] = [];
let fail = 0;
for (const id of seas.length ? seas : LOCATIONS.filter((l: any) => l.carpets).map((l) => l.id))
  for (const level of [-1.04, 0, 0.91]) for (const night of process.env.DAY ? [false, true] : [true]) {
    Math.random = mulberry32(Number(process.env.SEED ?? 1));   // (the same run each time, for each sea, water and hour)
    setSeaLevel(level);
    const loc: any = LOCATIONS.find((l) => l.id === id)!;
    const oc: any = buildOcean(loc);
    const ev = sunEvents(Date.UTC(2026, 8, 29, 3), loc);
    oc.eco.setSky(skyState(night ? ev.noon + 12 * 3600e3 : ev.noon, loc), new THREE.Vector2(0.3, 0.1));
    const C = oc.carpets, T = oc.T, R0 = 60, W = 1.1 / R0, cam = new THREE.Vector3();
    const all = () => C.kinds.flatMap((K: any) => K.groups.flatMap((g: any) => g.members.map((m: any) => ({ m, g }))));
    const track = new Map<any, { trail: { x: number; z: number }[]; px: number; pz: number; stuckFor: number; heldFor: number }>();
    let t = 0, swim = 0, held = 0, stuckFrames = 0, episodes = 0, longest = 0, shallow = 0, heldLongest = 0;
    for (let k = 0; k < MIN * 60 / dt; k++) {
      t += dt;
      const a = t * W;
      cam.set(Math.cos(a) * R0, Math.max(T.top(Math.cos(a) * R0, Math.sin(a) * R0) + 3, level - 6), Math.sin(a) * R0);
      oc.eco.step(dt, t, cam, -Math.sin(a), Math.cos(a));
      for (const { m, g } of all()) {
        if (!g.placed) { track.delete(m); continue; }
        let s = track.get(m); if (!s) { s = { trail: [], px: m.pos.x, pz: m.pos.z, stuckFor: 0, heldFor: 0 }; track.set(m, s); }
        const step = Math.hypot(m.pos.x - s.px, m.pos.z - s.pz); s.px = m.pos.x; s.pz = m.pos.z;
        s.trail.push({ x: m.pos.x, z: m.pos.z }); if (s.trail.length > WIN) s.trail.shift();
        if (waterTopAt(m.pos.x, m.pos.z) - T.top(m.pos.x, m.pos.z) < 0.8) shallow++;
        const lying = m.mode === 'move' && m.goal && Math.hypot(m.goal.x - m.pos.x, m.goal.z - m.pos.z) < 4;
        if (m.mode === 'rest' || lying || m.speed < 0.05) { s.heldFor = 0; if (s.stuckFor) { longest = Math.max(longest, s.stuckFor); s.stuckFor = 0; } continue; }
        swim++;
        if (step < 0.001) { held++; s.heldFor += dt; heldLongest = Math.max(heldLongest, s.heldFor); } else s.heldFor = 0;
        const o = s.trail[0], gone = Math.hypot(m.pos.x - o.x, m.pos.z - o.z);
        if (s.trail.length >= WIN && gone < 0.5) { if (!s.stuckFor) episodes++; s.stuckFor += dt; stuckFrames++; }
        else if (s.stuckFor && gone >= 0.5) { longest = Math.max(longest, s.stuckFor); s.stuckFor = 0; }
      }
    }
    for (const s of track.values()) longest = Math.max(longest, s.stuckFor);
    const ok = held <= swim * 0.01 && heldLongest < 10 && shallow === 0;
    if (!ok) fail++;
    rows.push(`${id} ${night ? 'night' : 'day  '} sea ${level >= 0 ? '+' : ''}${level.toFixed(2)} m: swimming ${(swim * dt / 60).toFixed(1)} shark-min; held ${(held / Math.max(1, swim) * 100).toFixed(1)}% of it, at most ${heldLongest.toFixed(1)} s on end; circling ${episodes} times, ${(stuckFrames * dt).toFixed(0)} s in all, longest ${longest.toFixed(0)} s (after 30 s); in water too shallow ${(shallow * dt).toFixed(0)} shark-s — ${ok ? 'PASS' : 'FAIL'}`);
    console.log(rows.at(-1));
  }
setSeaLevel(0);
process.exit(fail ? 1 : 0);
