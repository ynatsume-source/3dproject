// The night beach's crabs on the residents' island: their lives (eco/crabs.ts) given the island's night, weather and
// lights each frame, and drawn (ocean/crab.ts, the nature team's). Only for the look: nothing here is saved, draws the
// island's random numbers, or goes back to the world or a resident.
import * as THREE from 'three';
import { U } from '../render/common';
import { sun } from '../time/astro';
import { islandWeather } from '../world/island-time';
import { makeCrabLife, crabKeen, type CrabLight, type CrabTrunk } from './crabs';
import { makeCrabLook, makeBurrowLook } from '../ocean/crab';

const DARK = -6 * Math.PI / 180, STEP = 5 * 60e3;   // (the dark: the sun six degrees down; looked for in five-minute steps)

/** The dark around `ms` (the sun below six degrees down): its start and end, or null by day or in the twilight. */
export function darkAround(ms: number, lat: number, lon: number): [number, number] | null {
  const down = (t: number) => sun(t, lat, lon).alt < DARK;
  if (!down(ms)) return null;
  let a = ms, b = ms;
  for (let k = 0; k < 200 && down(a - STEP); k++) a -= STEP;
  for (let k = 0; k < 200 && down(b + STEP); k++) b += STEP;
  return [Math.floor(a / STEP) * STEP, Math.floor(b / STEP) * STEP];
}

export function makeCrabHost(loc: any, T: any, shore: any, home: [number, number], group: THREE.Group) {
  const life = makeCrabLife({
    ground: (x, z) => loc.f(x, z),
    sandy: (x, z) => { const c = T.landCover?.(x, z); return !!c && c.sand > 0.5 && c.can < 0.3; },
    home,
    trunks: (x, z, rad) => { const out: CrabTrunk[] = []; shore.trunks(x, z, rad, (t: CrabTrunk) => out.push(t)); return out; },
  });
  const crabs = makeCrabLook(group), burrows = makeBurrowLook(group);
  let dark: [number, number] | null = null, wxAt = -1, keen = 1;
  return {
    life,
    /** The crab up nearest (x, z) within `r` m — out, going out, or going down its burrow — or null: for the camera to
     *  come down to it (main.ts, watching a resident). Its ground position and what it is doing. */
    near(x: number, z: number, r: number): { x: number; y: number; z: number; kind: 'ghost' | 'coconut'; going: boolean } | null {
      const c = life.poses({ x, z }).crabs[0];
      if (!c || Math.hypot(c.x - x, c.z - z) > r) return null;
      const m = life.state(c.id)?.mode;
      return { x: c.x, y: c.y, z: c.z, kind: c.kind, going: m === 'home' || m === 'down' };
    },
    /** A frame on: `nowMs` the island's time, `cam` the camera. */
    update(dt: number, nowMs: number, cam: THREE.Vector3) {
      if (!dark || nowMs < dark[0] || nowMs > dark[1]) dark = darkAround(nowMs, loc.lat, loc.lon);
      if (Math.abs(nowMs - wxAt) > 600e3) { wxAt = nowMs; const w = islandWeather(nowMs); keen = crabKeen(w?.air, w?.rain); }
      const lights: CrabLight[] = [];
      U.uLights.value.forEach((L: THREE.Vector4, i: number) => { if (L.w > 0.05) lights.push({ x: L.x, z: L.z, r: (U.uLightR.value as THREE.Vector4).getComponent(i) }); });
      const F = U.uFire.value; if (F.w > 0.1) lights.push({ x: F.x, z: F.z, r: 5 });
      if (U.uLamp.value > 0.1) lights.push({ x: U.uLampPos.value.x, z: U.uLampPos.value.z, r: 4 });
      life.update(dt, nowMs, dark && { key: String(dark[0]), dark }, keen, lights);
      const P = life.poses(cam); crabs.show(P.crabs); burrows.show(P.burrows);
    },
  };
}
