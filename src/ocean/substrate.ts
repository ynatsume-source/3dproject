// The seabed's solid things in one register (docs/proposals/kayama-review/SUBSTRATE_LAYERS.md, step 1). Each coral
// colony is entered as its body — how wide it reaches at each height, from its own geometry — and a colony is only
// set down where its body keeps clear of every other's, a little apart, as colonies on a reef keep a strip between
// them where they meet (they sting and overgrow one another; tissue dies back at the edge). A thicket is one tangle
// of many colonies grown together: its own members may run into one another. A table's plate stands high, so it
// can spread over a low colony beneath it (overtopping, as tabular Acropora does), but never through one.
import * as THREE from 'three';
import { hyp } from '../core/math';

const NB = 6;                 // height bands a body is measured in
const SHRINK = 0.8;           // (a body a little inside its widest reach: leaves touching tips alone)
export interface Body { x: number; z: number; r: Float32Array; y0: Float32Array; y1: Float32Array; R: number; group: number }

const profiles = new Map<THREE.BufferGeometry, { r: number[]; lo: number; h: number }>();
/** How wide a form reaches in each band of its height (per unit of scale), and its height. */
export function profileOf(g: THREE.BufferGeometry) {
  let p = profiles.get(g); if (p) return p;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox!, P = g.attributes.position, h = b.max.y - b.min.y, r = new Array(NB).fill(0);
  for (let j = 0; j < P.count; j++) { const i = Math.min(NB - 1, Math.floor((P.getY(j) - b.min.y) / h * NB)); r[i] = Math.max(r[i], hyp(P.getX(j), P.getZ(j))); }
  p = { r, lo: b.min.y, h }; profiles.set(g, p); return p;
}

/** A colony's body where it stands: its bands scaled and lifted to its place (a tilted one reaches a little wider). */
export function bodyOf(g: THREE.BufferGeometry, it: { x: number; z: number; y: number; sx: number; sy: number; sz: number; up?: number[] }, group = -1): Body {
  const p = profileOf(g), s = Math.max(it.sx, it.sz), lean = it.up ? Math.sqrt(Math.max(0, 1 - it.up[1] * it.up[1])) : 0;
  const r = new Float32Array(NB), y0 = new Float32Array(NB), y1 = new Float32Array(NB);
  let R = 0;
  for (let i = 0; i < NB; i++) {
    r[i] = p.r[i] * s * SHRINK + lean * (i + 0.5) / NB * p.h * it.sy;
    y0[i] = it.y + (p.lo + p.h * i / NB) * it.sy; y1[i] = it.y + (p.lo + p.h * (i + 1) / NB) * it.sy;
    R = Math.max(R, r[i]);
  }
  return { x: it.x, z: it.z, r, y0, y1, R, group };
}

export class Bodies {
  private cell = 2;
  private map = new Map<string, Body[]>();
  private key(i: number, j: number) { return i + ',' + j; }
  add(b: Body) { const k = this.key(Math.floor(b.x / this.cell), Math.floor(b.z / this.cell)); let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(b); }
  remove(b: Body) { const a = this.map.get(this.key(Math.floor(b.x / this.cell), Math.floor(b.z / this.cell))); if (a) { const i = a.indexOf(b); if (i >= 0) a.splice(i, 1); } }
  /** Whether this body keeps clear of every other one (apart by `gap`, at least 5 cm and a twentieth of the larger). */
  fits(b: Body) {
    const reach = b.R + 6, c = this.cell;
    for (let i = Math.floor((b.x - reach) / c); i <= Math.floor((b.x + reach) / c); i++) for (let j = Math.floor((b.z - reach) / c); j <= Math.floor((b.z + reach) / c); j++) {
      for (const o of this.map.get(this.key(i, j)) ?? []) {
        if (b.group >= 0 && o.group === b.group) continue;                 // (the same tangle)
        const d = hyp(b.x - o.x, b.z - o.z), gap = Math.max(0.05, 0.05 * Math.max(b.R, o.R));
        if (d >= b.R + o.R + gap) continue;
        for (let p = 0; p < NB; p++) for (let q = 0; q < NB; q++) {
          if (b.y1[p] + 0.12 <= o.y0[q] || o.y1[q] + 0.12 <= b.y0[p]) continue;   // (one band clear above the other, by a hand's breadth)
          if (d < b.r[p] + o.r[q] + gap) return false;
        }
      }
    }
    return true;
  }
}
