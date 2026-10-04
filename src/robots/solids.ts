// What a body cannot go through, one list for the whole island: the trunks of the trees and the beach's
// casuarinas and pandanus, the beach rocks, the driftwood, and what the residents have built (the hut's posts,
// the workbench, the shelf, the pier's pilings). Kept apart from what is drawn — none of it comes and goes with
// the level of detail or with where the camera is — and from what a resident knows (an obstacle it has not seen
// still stops it; knowing of it is for its perception: robots/residents.ts sense()).
//
// Each solid is an upright cylinder: where it stands, how wide (its radius), from what height to what height.
// A body is one too (robots/residents.ts BODY): it cannot overlap a solid, except one low enough to step over.
// The same answer is used to plan a way (findPath's cost), to check each step taken, and to find where to stand
// to reach something (approach) — never its middle, which is inside it.

export type SolidKind = 'trunk' | 'rock' | 'driftwood' | 'post' | 'bench' | 'shelf' | 'pile' | 'fire';
export interface Solid { kind: SolidKind; x: number; z: number; r: number; y0: number; y1: number }
/** A body: radius r (m, with what it carries), standing y0..y1, stepping over anything no higher than step above its feet. */
export interface Body { r: number; y0: number; y1: number; step: number }
/** Solids within rad of (x, z), handed to out (a source may be the forest's trees, worked out cell by cell as asked). */
export type SolidSource = (x: number, z: number, rad: number, out: (s: Solid) => void) => void;

const CELL = 4;

export class Solids {
  private cells = new Map<number, Solid[]>();
  private sources: SolidSource[] = [];
  private dyn: (() => Solid[])[] = [];
  /** something that stays where it is */
  add(s: Solid) {
    const i0 = Math.floor((s.x - s.r) / CELL), i1 = Math.floor((s.x + s.r) / CELL), j0 = Math.floor((s.z - s.r) / CELL), j1 = Math.floor((s.z + s.r) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = (i + 32768) * 65536 + (j + 32768); let c = this.cells.get(k); if (!c) this.cells.set(k, c = []); if (!c.includes(s)) c.push(s); }
  }
  /** a whole kind of thing kept elsewhere, asked by place (the forest's trunks) */
  source(f: SolidSource) { this.sources.push(f); }
  /** things that change (what has been built so far): listed afresh each time they are asked for */
  changing(f: () => Solid[]) { this.dyn.push(f); }
  each(x: number, z: number, rad: number, f: (s: Solid) => void) {
    const i0 = Math.floor((x - rad) / CELL), i1 = Math.floor((x + rad) / CELL), j0 = Math.floor((z - rad) / CELL), j1 = Math.floor((z + rad) / CELL);
    const seen = new Set<Solid>();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const s of this.cells.get((i + 32768) * 65536 + (j + 32768)) ?? []) if (!seen.has(s)) { seen.add(s); f(s); }
    for (const src of this.sources) src(x, z, rad, f);
    for (const d of this.dyn) for (const s of d()) if (Math.abs(s.x - x) < rad + s.r && Math.abs(s.z - z) < rad + s.r) f(s);
  }
  /** The solid a body standing at (x, z) with its feet at fy would be inside, or null. */
  hit(x: number, z: number, b: Body, fy: number): Solid | null {
    let got: Solid | null = null, worst = 0;
    this.each(x, z, b.r + 1.5, (s) => {
      if (s.y1 <= fy + b.step || s.y0 >= fy + b.y1) return;   // (low enough to step over; or overhead)
      const d = Math.hypot(s.x - x, s.z - z), over = s.r + b.r - d;
      if (over > worst) { worst = over; got = s; }
    });
    return got;
  }
  /** The first solid a body would run into going straight from a to b (its feet at fy), or null. */
  along(ax: number, az: number, bx: number, bz: number, b: Body, fy: (x: number, z: number) => number): Solid | null {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / Math.max(0.1, b.r * 0.5)));
    for (let k = 1; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n, s = this.hit(x, z, b, fy(x, z)); if (s) return s; }
    return null;
  }
  /** Where a body can stand to reach what is at (x, z), coming from (fx, fz): (x, z) itself if it is clear,
   *  otherwise just outside whatever is there (reach: how far it may stand off), on the side nearest where it
   *  comes from first; ok: whether a place is one it can stand on at all (dry ground, for one that walks).
   *  null: nowhere round it will do. */
  approach(x: number, z: number, b: Body, fy: (x: number, z: number) => number, fx: number, fz: number, ok: (x: number, z: number) => boolean, reach = 0.6): [number, number] | null {
    const s = this.hit(x, z, b, fy(x, z));
    if (!s) return ok(x, z) ? [x, z] : null;
    const from = Math.atan2(fz - s.z, fx - s.x);
    for (const ring of [0.08, 0.3, reach]) {
      const R = s.r + b.r + ring;
      for (let k = 0; k < 16; k++) {
        const a = from + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8, px = s.x + Math.cos(a) * R, pz = s.z + Math.sin(a) * R;
        if (ok(px, pz) && !this.hit(px, pz, b, fy(px, pz))) return [px, pz];
      }
    }
    return null;
  }
}
