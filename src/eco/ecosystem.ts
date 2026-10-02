// Ties one sea's living things together: owns the environment they share and steps them each frame.
import * as THREE from 'three';
import { LIMIT } from '../ocean/scenery';
import { Plankton } from './plankton';
import { updateTurtles, updateMantas } from './animals';
import { updateOctopi } from './octopus';
import { updateWhales, whaleSubjects, inSeason } from './whale';

// ?month=2 previews a season's visitors (whales in winter) without changing the sky
const SEASON_MONTH = typeof location !== 'undefined' && /[?&]month=(\d+)/.test(location.search) ? +RegExp.$1 : null;
import type { Env, SeaEvent, Subject } from './env';
import type { FishSystem } from './fish';
import type { SkyState } from '../time/clock';

export class Ecosystem {
  env: Env;
  private oc: any;

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
    const TS: Record<string, [number, string]> = { travel: [2.0, '泳いでいる'], graze: [2.6, '食事中'], toRest: [2.2, '寝床へ向かっている'], rest: [2.6, '岩陰で眠っている'], breathe: [3.2, '息継ぎに浮上中'] };
    const turtleName = (this.oc.loc.extraGuide || []).find((e: any) => e.id === 'turtle')?.ja ?? 'ウミガメ';
    this.oc.turtles.forEach((t: any, i: number) => {
      const hawk = this.oc.loc.animals.turtle?.style === 'hawksbill';
      out.push({ key: `turtle:${i}`, label: turtleName, len: t.size * 0.95, adult: hawk ? 0.85 : 1.05, lenK: hawk ? 0.1 : 0.07, lenWhat: '甲長', kind: 'turtle', prio: (TS[t.state] || TS.travel)[0], size: 1.2 * t.size,
        pos: () => t.pos, status: () => (TS[t.state] || TS.travel)[1], live: () => t.placed });
    });
    const mantaName = (this.oc.loc.extraGuide || []).find((e: any) => e.id === 'manta')?.ja ?? 'ナンヨウマンタ';
    const giant = mantaName === 'オニイトマキエイ';
    this.oc.mantas.forEach((m: any, i: number) => {
      out.push({ key: `manta:${i}`, label: mantaName, len: m.span, adult: giant ? 6 : 4.5, lenK: 0.2, lenWhat: '翼幅', kind: 'manta', prio: 3.2, size: 4,
        pos: () => m.pos, status: () => (m.feeding ? 'プランクトンを食べている' : 'クリーニングステーションを回っている'), live: () => m.placed });
    });
    for (const o of this.oc.octopi || []) out.push(o.subject);
    this.oc.critters?.subjects(out);
    this.oc.lobosVisitors?.subjects(out);
    this.oc.lobosOtters?.subjects(out);
    this.oc.rare?.subjects(out);
    whaleSubjects(this.oc, out);
    this.oc.breach?.subjects(out);
    if (this.oc.bait) out.push(...this.oc.bait.subjects());
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
    for (const f of this.oc.fish as FishSystem[]) f.update(dt, e, cam, fx, fz);
    updateTurtles(this.oc, dt, e, cam, fx, fz);
    updateMantas(this.oc, dt, e, cam, fx, fz);
    updateOctopi(this.oc, dt, e, cam, fx, fz);
    const ws = this.oc.loc.whales;
    updateWhales(this.oc, dt, e, cam, !!ws && inSeason(e.month, e.mday, ws));
    this.oc.breach?.update(dt, e, cam, fx, fz, !!ws && inSeason(e.month, e.mday, ws));
    if (this.oc.bait) this.oc.bait.update(dt, e, cam, fx, fz, e.sound);
    this.oc.riders?.update(dt, t);
    this.oc.critters?.update(dt, e, cam, fx, fz);
    this.oc.rare?.update(dt, e, cam, fx, fz);
    this.oc.lobosBenthos?.update(cam, dt, t);
    this.oc.lobosVisitors?.update(dt, e, cam);
    this.oc.lobosOtters?.update(dt, e, cam);
    return e.events;
  }
}
