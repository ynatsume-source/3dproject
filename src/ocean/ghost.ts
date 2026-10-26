// Plants seen through (viewer design D27, screens/CAMERA.md §3; the owner's choice, plan 1): a plant that stands
// between the camera and the resident it is watching is drawn faint, the whole of it, trunk and leaves — never a part
// of it cut away, as the tube cut through the leaves did (render/common.ts cutSight). About a third as strong, its
// colour a little washed and a little bluer, so it is still there and reads as stepped aside for the camera. It comes
// in over 0.4 s and goes over 0.8 s; which plants are in the way is worked out again every 0.3 s.
//  - Drawn: each plant's own amount (0 drawn as it is .. 1 seen through) rides on its instance colour's red
//    (InstancedMesh.instanceColor, set here), so the shared geometries carry nothing new; anything drawn with the
//    same material but not through these meshes (a resident's felled tree, a young casuarina) is never faint.
//  - Faint by coverage: with the scene multisampled (uA2C), the alpha goes to coverage; without it, a fixed fine
//    screen of pixels is left out (the lightest tier).
//  - The look only: no plant is moved or taken away, nothing is saved, no random draws.
import * as THREE from 'three';

/** In a plant's vertex shader: its amount, from its instance colour (0 when it has none). */
export const GHOST_VS = /* glsl */ `
varying float vGh;
void ghostVs(){
  #ifdef USE_INSTANCING_COLOR
  vGh = instanceColor.r;
  #else
  vGh = 0.0;
  #endif
}`;
/** In a plant's fragment shader: ghostCut(cover) before anything is drawn (left out where it is seen through and the
 *  scene is not multisampled); ghostCol(col) on the colour; ghostA(alpha) on the alpha. */
export const GHOST_FS = /* glsl */ `
varying float vGh;
const float GHOST_A = 0.3;   // (how strong a plant seen through is drawn)
float ghostAlpha(){ return 1.0 - (1.0 - GHOST_A) * vGh; }
// (a 4x4 ordered screen: a pixel is drawn while the plant's strength is above its place in it)
float ghostScreen(){
  vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
  float b = mod(q.x + 2.0 * q.y, 4.0) * 4.0 + mod(floor(q.x * 0.5) + 2.0 * floor(q.y * 0.5), 4.0);
  return (b + 0.5) / 16.0;
}
bool ghostCut(){ return uA2C < 0.5 && vGh > 0.0 && ghostAlpha() < ghostScreen(); }
vec3 ghostCol(vec3 col){
  vec3 g = vec3(dot(col, vec3(0.3, 0.5, 0.2)));
  return mix(col, mix(g, col, 0.6) * vec3(0.92, 0.97, 1.08), vGh);   // (a little washed, a little bluer)
}
float ghostA(float a){ return a * mix(1.0, ghostAlpha(), uA2C); }`;

/** One plant that may be seen through: its mesh and instance, and the upright cylinder it fills. */
export interface GhostPlant { mesh: THREE.InstancedMesh; i: number; key: string; x: number; z: number; y0: number; y1: number; r: number; g: number; t: number }

const IN_S = 0.4, OUT_S = 0.8, EVERY = 0.3, NEAR_CAM = 1.2;

/** Gives the mesh an instance colour (red: the amount seen through), all 0, if it has none. */
export function ghostable(mesh: THREE.InstancedMesh) {
  if (!mesh.instanceColor || mesh.instanceColor.count < mesh.instanceMatrix.count) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3);
  }
  return mesh;
}

/** Whether the plant is in the way of the eye: on the line from it to any of the points (and short of them), or right
 *  in front of the eye (within 1.2 m: cut by the near plane, it would show its inside). */
export function inTheWay(p: GhostPlant, eye: THREE.Vector3, pts: THREE.Vector3[]) {
  const ex = eye.x - p.x, ez = eye.z - p.z;
  if (ex * ex + ez * ez < (p.r + NEAR_CAM) ** 2 && eye.y > p.y0 - NEAR_CAM && eye.y < p.y1 + NEAR_CAM) return true;
  for (const q of pts) {
    const dx = q.x - eye.x, dz = q.z - eye.z, L2 = dx * dx + dz * dz;
    const t = L2 > 1e-6 ? Math.min(1, Math.max(0, -(ex * dx + ez * dz) / L2)) : 0;
    if (t > 0.97) continue;   // (at the point itself or beyond it: not in front of it)
    const cx = ex + dx * t, cz = ez + dz * t, y = eye.y + (q.y - eye.y) * t;
    if (cx * cx + cz * cz < p.r * p.r && y > p.y0 && y < p.y1) return true;
  }
  return false;
}

/** The plants of a sea that may be seen through, and how much each is now. */
export function makeGhosts() {
  let fixed: GhostPlant[] = [], moving: GhostPlant[] = [];   // (fixed: the beach's, placed once; moving: the forest's, refilled as the camera goes)
  const live = new Set<GhostPlant>();   // (those not at rest at 0)
  let since = EVERY, held: (() => THREE.Vector3[]) | null | undefined;   // (held: LAB, the points as set by hand)
  const write = (p: GhostPlant) => { const c = p.mesh.instanceColor; if (c && p.i < c.count) { (c.array as Float32Array)[p.i * 3] = p.g; c.needsUpdate = true; } };
  return {
    /** The beach's plants (once, as built). */
    setFixed(list: GhostPlant[]) { fixed = list; },
    /** The forest's drawn trees (each time it is refilled): those faint before keep how faint they were. */
    setMoving(list: GhostPlant[]) {
      const was = new Map<string, GhostPlant>(); for (const p of moving) if (p.g > 0 || p.t > 0) was.set(p.key, p);
      for (const p of live) if (moving.includes(p)) live.delete(p);
      moving = list;
      for (const p of moving) { const o = was.get(p.key); if (o) { p.g = o.g; p.t = o.t; live.add(p); } write(p); }
    },
    /** Each frame: which plants are in the way of the eye to the points (head, middle, feet of the one watched — asked
     *  for only when it is worked out again; none: all come back), and each eased toward it. */
    update(eye: THREE.Vector3, ask: (() => THREE.Vector3[]) | null, dt: number) {
      if (held !== undefined) ask = held;
      since += dt;
      if (since >= EVERY || (!ask && live.size && since > 0)) {
        since = 0;
        const pts = ask ? ask() : null;
        const reach = pts ? Math.max(...pts.map((q) => Math.hypot(q.x - eye.x, q.z - eye.z))) + 6 : 0;
        for (const list of [fixed, moving]) for (const p of list) {
          const near = pts && Math.abs(p.x - eye.x) < reach && Math.abs(p.z - eye.z) < reach;
          const t = near && inTheWay(p, eye, pts!) ? 1 : 0;
          if (t !== p.t) { p.t = t; live.add(p); }
        }
      }
      for (const p of live) {
        p.g = p.t > p.g ? Math.min(p.t, p.g + dt / IN_S) : Math.max(p.t, p.g - dt / OUT_S);
        write(p);
        if (p.g === p.t && p.t === 0) live.delete(p);
      }
    },
    /** LAB: hold the points by hand (null: none; undefined: back to the camera's). */
    lab(pts: THREE.Vector3[] | null | undefined) { held = pts === undefined ? undefined : pts && (() => pts); since = EVERY; },
    /** LAB: the growing beach plant nearest (x, z), as it is held here. */
    nearest(x: number, z: number) { let b: GhostPlant | null = null, bd = Infinity; for (const p of fixed) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; b = p; } } return b && { x: b.x, z: b.z, y0: b.y0, y1: b.y1, r: b.r }; },
    /** How many plants are seen through (LAB). */
    get faint() { let n = 0; for (const p of live) if (p.g > 0.5) n++; return n; },
  };
}
export type Ghosts = ReturnType<typeof makeGhosts>;
