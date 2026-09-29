// Ties one sea's living things together: owns the environment they share and steps them each frame.
import * as THREE from 'three';
import { LIMIT } from '../ocean/scenery';
import { Plankton } from './plankton';
import { updateTurtles, updateMantas } from './animals';
import type { Env, SeaEvent } from './env';
import type { FishSystem } from './fish';
import type { SkyState } from '../time/clock';

export class Ecosystem {
  env: Env;
  private oc: any;

  constructor(oc: any) {
    this.oc = oc;
    this.env = {
      t: 0, day: 1, night: 0, twilight: 0, sunI: 1,
      cur: { x: 0.3, z: 0.1 },
      plankton: new Plankton(LIMIT + 40),
      threats: [], threatsOut: [],
      prey: (oc.fish as FishSystem[]).flatMap((f) => f.preyGroups()),
      cam: { x: 0, y: 0, z: 0 },
      events: [],
      crunch: () => { /* set by the app */ },
    };
  }

  setSky(s: SkyState, current: THREE.Vector2) {
    const e = this.env;
    e.day = s.day; e.night = s.night; e.twilight = s.twilight; e.sunI = s.sunI;
    e.cur.x = current.x; e.cur.z = current.y;
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
    return e.events;
  }
}
