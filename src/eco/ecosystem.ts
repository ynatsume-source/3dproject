// Ties one sea's living things together: owns the environment they share and steps them each frame.
import * as THREE from 'three';
import { LIMIT } from '../ocean/scenery';
import { Plankton } from './plankton';
import { updateTurtles, updateMantas } from './animals';
import { updateOctopi } from './octopus';
import { updateWhales, whaleSubjects, inSeason } from './whale';
import { updateDolphins, dolphinSubjects } from './dolphins';
import { unseen } from './unseen';
import { rr, mulberry32, hyp } from '../core/math';

// ?month=2 previews a season's visitors (whales in winter) without changing the sky
const SEASON_MONTH = typeof location !== 'undefined' && /[?&]month=(\d+)/.test(location.search) ? +RegExp.$1 : null;
import type { Env, SeaEvent, Subject } from './env';
import type { FishSystem } from './fish';
import type { SkyState } from '../time/clock';

export class Ecosystem {
  env: Env;
  private oc: any;
  // Keeping the sea about the camera lived in (owner's choice, 2026-10: B). Fish were put down 32-48 m ahead
  // and kept to their own patch there, so as the cruise went on the water close by could empty for minutes
  // (Miyako: 1,340 fish within 25 m at the start, 3 six minutes on). Every few seconds the fish within 30 m
  // of the camera, and those already on their way into that, are counted; short of the aim, a group left
  // far behind, out of sight, is sent on: put down off to the side where it cannot be seen (CLAUDE.md:
  // nothing comes out of nowhere) with its home patch moving on to the way ahead, so it swims in.
  private keepT = 2;
  // The day's lot (owner's choice F, 2026-10): the place one goes in at stays the same, but who is about it changes
  // from day to day — which schools are close on arriving and how many of them, and whether a big one comes by in
  // the first minutes. Drawn from the sea and the date, so the same day gives the same sea. The first moments keep
  // their rush of fish: at least two schooling kinds are always close.
  dayLot: { key: string; near: Record<string, number>; visitor: string | null; at: number } | null = null;
  private visitT = 0; private visitor: any = null;
  startDay() {
    const e = this.env, oc = this.oc, key = `${oc.loc.id}:${e.month}-${e.mday}`;
    let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = mulberry32(h >>> 0);
    const fish = (oc.fish as any[]).filter((f) => f.setStart);
    const near: Record<string, number> = {};
    for (const f of fish) near[f.sp.id] = rnd() < 0.25 ? 0.15 + rnd() * 0.25 : 0.5 + rnd() * 0.5;   // (some days a kind is mostly elsewhere)
    const schooling = fish.filter((f) => f.sp.habitat === 'shoal' || (f.sp.habitat === 'reef' && (f.sp.n ?? 1) > 6));
    for (let k = 0; k < 2 && schooling.length; k++) near[schooling.splice(Math.floor(rnd() * schooling.length), 1)[0].sp.id] = 1;
    for (const f of fish) f.setStart(near[f.sp.id]);
    const big = (oc.fish as any[]).filter((f) => f.visit && f.sp.habitat !== 'reef' && f.sp.habitat !== 'anemone' && f.sp.habitat !== 'shoal' && (f.sp.size?.[1] ?? 0) >= 1);
    const go = big.length && rnd() < 0.7;
    this.visitor = go ? big[Math.floor(rnd() * big.length)] : null;
    this.visitT = go ? 40 + rnd() * 110 : 0;
    this.dayLot = { key, near, visitor: this.visitor?.sp.ja ?? null, at: Math.round(this.visitT) };
  }
  static readonly KEEP_NEAR = 30;     // (m: what counts as about the camera)
  static readonly KEEP_AIM = 300;     // (fish about the camera, counting those on their way in)
  /** Fish about the camera now, and those on their way in (for the check, and the aim below). */
  nearFishCount(cam: THREE.Vector3) {
    let near = 0;
    for (const f of this.oc.fish as any[]) for (const m of f.movers?.() ?? []) {
      const d = hyp(m.x - cam.x, m.z - cam.z), gd = m.goal ? hyp(m.goal.x - cam.x, m.goal.z - cam.z) : 1e9;
      if (d < Ecosystem.KEEP_NEAR || (m.going && gd < Ecosystem.KEEP_NEAR + 25)) near += m.n;
    }
    return near;
  }
  private keepAbout(dt: number, cam: THREE.Vector3, fx: number, fz: number) {
    if ((this.keepT -= dt) > 0) return;
    this.keepT = 2;
    const oc = this.oc, T = oc.T, fl = hyp(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
    if (oc.loc.pelagic || this.nearFishCount(cam) >= Ecosystem.KEEP_AIM) return;
    // the one to send: well off behind or to the side, out of sight, not already on its way (the biggest found)
    let best: any = null;
    for (const f of oc.fish as any[]) for (const m of f.movers?.() ?? []) {
      if (m.going) continue;
      const dx = m.x - cam.x, dz = m.z - cam.z, d = hyp(dx, dz);
      if (d < 45 || (dx * ux + dz * uz) / d > 0.2 || !unseen(oc, m.x, m.y, m.z, cam, ux, uz, 4)) continue;   // (well off, behind or to the side, out of sight)
      if (!best || m.n > best.n) best = m;
    }
    if (!best) return;
    // where it goes: on the way ahead, on reef in the water; where it is put down: off to one side of the way
    // ahead, further than one can see that way (more than 75° off the view and over 22 m off)
    for (let k = 0; k < 16; k++) {
      const ad = rr(34, 50), al = rr(-8, 8), ax = cam.x + ux * ad - uz * al, az = cam.z + uz * ad + ux * al;
      if (T.top(ax, az) > -2.5 || !T.wet(ax, az, 2)) continue;
      const side = k % 2 ? 1 : -1, a = rr(80, 100) * Math.PI / 180, sd = rr(24, 32);
      const sx = cam.x + (ux * Math.cos(a) - uz * Math.sin(a) * side) * sd, sz = cam.z + (uz * Math.cos(a) + ux * Math.sin(a) * side) * sd;
      if (T.top(sx, sz) > -2.5 || !T.wet(sx, sz, 2) || !unseen(oc, sx, best.y, sz, cam, ux, uz, 4)) continue;
      best.move(sx, sz, ax, az);
      return;
    }
  }

  constructor(oc: any) {
    this.oc = oc;
    this.env = {
      t: 0, day: 1, night: 0, twilight: 0, sunI: 1, month: 1, mday: 1,
      cur: { x: 0.3, z: 0.1 },
      plankton: new Plankton(LIMIT + 40),
      threats: [], threatsOut: [],
      prey: (oc.fish as FishSystem[]).flatMap((f) => f.preyGroups()),
      cam: { x: 0, y: 0, z: 0 }, shy: 1,
      events: [],
      crunch: () => { /* set by the app */ },
      sound: { frenzy: () => { /* set by the app */ }, plop: () => { /* set by the app */ } },
    };
  }

  setSky(s: SkyState, current: THREE.Vector2) {
    const e = this.env;
    e.day = s.day; e.night = s.night; e.twilight = s.twilight; e.sunI = s.sunI;
    e.month = SEASON_MONTH ?? s.month; e.mday = SEASON_MONTH ? 15 : s.mday;
    e.cur.x = current.x; e.cur.z = current.y;
  }

  subjects(): Subject[] {
    const out: Subject[] = [];
    for (const f of this.oc.fish as FishSystem[]) f.subjects(out);
    const TS: Record<string, [number, string]> = { travel: [2.0, 'ゆったり泳いで移動している'], graze: [2.6, '海底の藻や海草をはんでいる'], toRest: [2.2, '寝床の岩陰へ向かっている'], rest: [1.7, '岩陰で眠っている'], breathe: [3.2, '息継ぎに水面へ上がっていく'] };
    const turtleName = (this.oc.loc.extraGuide || []).find((e: any) => e.id === 'turtle')?.ja ?? 'ウミガメ';
    this.oc.turtles.forEach((t: any, i: number) => {
      const hawk = this.oc.loc.animals.turtle?.style === 'hawksbill';
      out.push({ key: `turtle:${i}`, label: turtleName, len: t.size * 0.95, adult: hawk ? 0.85 : 1.05, lenK: hawk ? 0.1 : 0.07, lenWhat: '甲長', kind: 'turtle', prio: (TS[t.state] || TS.travel)[0], size: 1.2 * t.size,
        pos: () => t.pos, status: () => (TS[t.state] || TS.travel)[1], live: () => t.placed,
        // (lying still, its body's own heading; swimming, where it is going)
        heading: () => (t.state === 'rest' && t.yaw != null ? { x: Math.sin(t.yaw), z: Math.cos(t.yaw) } : { x: Math.cos(t.head), z: Math.sin(t.head) }),
        brief: () => t.state === 'rest',
        // (the same reach as its startle in animals.ts: closer than this, it drives off)
        shy: () => (t.state === 'rest' ? 1.4 : t.state === 'graze' ? 2.2 : 3.0) * (this.env.shy > 0 ? Math.max(0.5, this.env.shy) : 0) * t.size });
    });
    const mantaName = (this.oc.loc.extraGuide || []).find((e: any) => e.id === 'manta')?.ja ?? 'ナンヨウマンタ';
    const giant = mantaName === 'オニイトマキエイ';
    this.oc.mantas.forEach((m: any, i: number) => {
      out.push({ key: `manta:${i}`, label: mantaName, len: m.span, adult: giant ? 6 : 4.5, lenK: 0.2, lenWhat: '翼幅', kind: 'manta', prio: 3.2, size: 4,
        pos: () => m.pos, status: () => (m.transit || (m.stationTarget && hyp(m.st.x - m.stationTarget.x, m.st.z - m.stationTarget.z) > 3) ? '次の場所へ泳いでいる' : m.feeding ? '口を開けてプランクトンを食べている' : 'クリーニングステーションを回っている'), live: () => m.placed });   // (its own state: on its way, feeding with its mouth open, or circling a reef top)
    });
    for (const o of this.oc.octopi || []) out.push(o.subject);
    this.oc.critters?.subjects(out);
    this.oc.lobosVisitors?.subjects(out);
    this.oc.lobosOtters?.subjects(out);
    this.oc.rare?.subjects(out);
    whaleSubjects(this.oc, out);
    dolphinSubjects(this.oc, out);
    this.oc.breach?.subjects(out);
    if (this.oc.bait) out.push(...this.oc.bait.subjects());
    if (this.oc.jacks) out.push(...this.oc.jacks.subjects());
    const wreck = this.oc.wreck;
    if (wreck) out.push({ key: 'wreck', label: 'カルナティック号', kind: 'cave', prio: 2.8, size: 20, reach: 140, pos: () => wreck.centre, live: () => true,
      status: () => (this.env.night > 0.6 ? 'ライトに浮かぶ鉄の肋骨' : '肋骨の間から光が差し込む'),
      tour: { length: wreck.tourLength, start: (rev: boolean) => wreck.tourStart(rev), at: (t: number, rev: boolean, p: any, l: any) => wreck.tourAt(t, rev, p, l) } });
    const cave = this.oc.cave;
    if (cave) {
      const c = { x: cave.cx, y: cave.top - 4, z: cave.cz };
      out.push({ key: 'cave', label: '海底洞窟', kind: 'cave', prio: 2.6, size: 8, reach: 95, pos: () => c, live: () => true,
        status: () => (this.env.night > 0.6 ? 'ライトで照らしながら' : '天窓から光が差し込む'),
        tour: { length: cave.tourLength, start: (rev: boolean) => cave.tourStart(rev), at: (t: number, rev: boolean, p: any, l: any) => cave.tourAt(t, rev, p, l) } });
    }
    return out;
  }

  step(dt: number, t: number, cam: THREE.Vector3, fx: number, fz: number): SeaEvent[] {
    const e = this.env;
    e.t = t;
    e.cam.x = cam.x; e.cam.y = cam.y; e.cam.z = cam.z;
    e.threats = e.threatsOut; e.threatsOut = [];
    e.events = [];
    e.plankton.update(dt, e.cur, e.sunI, e.night, t);
    this.keepAbout(dt, cam, fx, fz);
    if (this.visitor && (this.visitT -= dt) <= 0) { if (this.visitor.visit(cam, fx, fz) || this.visitT < -60) this.visitor = null; }   // (the day's big one, coming by)
    for (const f of this.oc.fish as FishSystem[]) f.update(dt, e, cam, fx, fz);
    updateTurtles(this.oc, dt, e, cam, fx, fz);
    updateMantas(this.oc, dt, e, cam, fx, fz);
    updateOctopi(this.oc, dt, e, cam, fx, fz);
    const ws = this.oc.loc.whales;
    updateWhales(this.oc, dt, e, cam, !!ws && inSeason(e.month, e.mday, ws));
    this.oc.breach?.update(dt, e, cam, fx, fz, !!ws && inSeason(e.month, e.mday, ws));
    updateDolphins(this.oc, dt, e, cam, fx, fz);
    if (this.oc.bait) this.oc.bait.update(dt, e, cam, fx, fz, e.sound);
    this.oc.jacks?.update(dt, e, cam, fx, fz);
    this.oc.riders?.update(dt, t);
    this.oc.critters?.update(dt, e, cam, fx, fz);
    this.oc.rare?.update(dt, e, cam, fx, fz);
    this.oc.lobosBenthos?.update(cam, dt, t);
    this.oc.lobosVisitors?.update(dt, e, cam);
    this.oc.lobosOtters?.update(dt, e, cam);
    return e.events;
  }
}
