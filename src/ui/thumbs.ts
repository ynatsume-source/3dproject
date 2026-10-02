// Field-guide pictures: each creature's own 3D model, rendered once in a small off-screen renderer
// under clear, even light, and kept as an image per sea.
import * as THREE from 'three';
import { ridersFor } from '../eco/riders';
import { critterModel } from '../eco/critters';
import { U } from '../render/common';
import { fishGeometry, fishMaterial, SHAPES, makeTurtle, MANTA_GEO, mantaMaterial, WHALE_GEO, whaleMaterial, CORAL_GEO, CORAL_MAT, PALETTE } from '../ocean/models';
import { octopusModel } from '../eco/octopus';
import { birdModel } from '../eco/birds';
import { flyingFishModel } from '../eco/flyingfish';
import { makeHarborSeal } from '../ocean/lobos-visitor-models';
import { creatureKit } from '../robots/creatures';
import { cmats } from '../robots/residents';
import type { Sea } from '../data/locations';

const W = 176, H = 104;
let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, Record<string, string>>();

function model(loc: Sea, id: string): { obj: THREE.Object3D; view: [number, number, number] } | null {
  const sp = loc.species.find((s) => s.id === id) ?? (loc.bait?.sp.id === id ? loc.bait.sp : undefined) ?? ridersFor(loc).find((s) => s.id === id);
  if (sp) {
    const g = fishGeometry(SHAPES[sp.shape]);
    g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 1]), 3));
    const m = new THREE.InstancedMesh(g, fishMaterial(sp), 1); m.setMatrixAt(0, new THREE.Matrix4());
    return { obj: m, view: sp.shape === 'hammer' ? [0.35, 1.0, 0.12] : [1, 0.22, 0.55] };   // a hammerhead is best seen from above
  }
  const cr = (loc.critters || []).find((c) => c.id === id);
  if (cr) return critterModel(cr);
  // (for checking a reef form close up, ?debug: 'coral:<kind>[:variant]', in its first colour)
  if (id.startsWith('coral:')) {
    const [, kind, vs] = id.split(':'), base = (CORAL_GEO as any)[kind]?.[+(vs ?? 0)]; if (!base) return null;
    const g = new THREE.BufferGeometry(); for (const n in base.attributes) g.setAttribute(n, base.attributes[n]); g.setIndex(base.index);
    const [c, c2] = (PALETTE as any)[kind][0];
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(c), 3)); g.setAttribute('aCol2', new THREE.InstancedBufferAttribute(new Float32Array(c2), 3)); g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array([0.3]), 1));
    const m = new THREE.InstancedMesh(g, (CORAL_MAT as any)[kind], 1); m.setMatrixAt(0, new THREE.Matrix4()); m.frustumCulled = false;
    return { obj: m, view: [0.2, 0.25, 1] };
  }
  if (id === 'turtle') return { obj: makeTurtle(loc.animals.turtle?.style === 'hawksbill' ? 'hawksbill' : 'green').group, view: [0.9, 0.75, 0.9] };
  if (id === 'manta') return { obj: new THREE.Mesh(MANTA_GEO, mantaMaterial((loc.extraGuide || []).some((e) => e.id === 'manta' && e.ja === 'オニイトマキエイ'))), view: [0.35, 1.1, 0.75] };
  if (id === 'tobiuo' && !loc.species.some((s) => s.id === 'tobiuo')) { const m = flyingFishModel(); m.position.y = 20; return { obj: m, view: [0.3, 0.45, 0.4] }; }   // (in the air, wings spread)
  if (id === 'whale') return { obj: new THREE.Mesh(WHALE_GEO, whaleMaterial(0.3)), view: [1, 0.3, 0.45] };
  if (id === 'octopus') return { obj: octopusModel(), view: [0.8, 0.9, 1] };
  if (id === 'sea-otter' && loc.id === 'pointlobos') { const o = creatureKit(cmats()).makeSeaOtter(); for (let i = 0; i < 40; i++) o.update(i * 0.1, 0.1, { act: 'eat', walk: 0, wet: true, food: 'urchin' }); o.root.scale.setScalar(1.15); o.root.position.y = 20; return { obj: o.root, view: [0.9, 0.7, 0.35] }; }   // (on its back, eating, up in the light)
  if (id === 'harbor-seal' && loc.id === 'pointlobos') return { obj: makeHarborSeal().group, view: [0.7, 0.3, 1] };
  const bird = (loc.birds || []).find((b) => b.id === id);
  if (bird) { const m = birdModel(bird); m.position.y = 20; return { obj: m, view: [0.55, 0.9, 0.75] }; }   // lifted into the air, out of the water's haze
  // (garden eels duck into their burrows when a camera comes close, so they get no portrait)
  return null;
}

// Pictures for the given guide ids (data URLs), rendered on first request per sea — at most `budget` new
// ones per call (each is a model, its shaders and a render in a second WebGL context: all forty at once
// froze the page when the guide opened; a couple a frame do not).
export function guideThumbs(loc: Sea, ids: string[], budget = Infinity): Record<string, string> {
  const have = cache.get(loc.id) ?? {};
  cache.set(loc.id, have);
  const todo = ids.filter((id) => !(id in have)).slice(0, budget);
  if (!todo.length) return have;
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H, false); renderer.setPixelRatio(1);
  }
  // clear, shallow-water light for every picture; the live values are put back afterwards
  const keep = { cam: U.uCamPos.value.clone(), sun: U.uSunDir.value.clone(), sunI: U.uSunI.value, amb: U.uAmb.value, fog: U.uFogDen.value, abs: U.uAbs.value.clone(), night: U.uNight.value,
    airSun: U.uAirSun.value.clone(), cloud: U.uCloud.value, moonI: U.uMoonI.value, tint: U.uTint.value.clone(), lamp: U.uLamp.value, cave: U.uCaveOn.value, up: U.uUp.value.clone(), hor: U.uHor.value.clone(), down: U.uDown.value.clone(), gold: U.uGolden.value };
  U.uSunDir.value.set(0.35, 0.85, 0.4).normalize(); U.uSunI.value = 1; U.uAmb.value = 1.1; U.uFogDen.value = 0.0001; U.uAbs.value.set(0, 0, 0); U.uNight.value = 0;
  U.uTint.value.setRGB(1, 1, 1); U.uLamp.value = 0; U.uAirSun.value.set(0.35, 0.85, 0.4).normalize(); U.uCloud.value = 0; U.uMoonI.value = 0; U.uCaveOn.value = 0; U.uGolden.value = 0;
  U.uUp.value.setRGB(0.4, 0.6, 0.7); U.uHor.value.setRGB(0.3, 0.45, 0.55); U.uDown.value.setRGB(0.2, 0.3, 0.35);
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.01, 100);
  for (const id of todo) {
    const m = model(loc, id);
    if (!m) { have[id] = ''; continue; }
    const scene = new THREE.Scene(); scene.add(m.obj);
    m.obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.obj), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y * 1.6, size.z) * 0.62;
    const dir = new THREE.Vector3(...m.view).normalize();
    cam.position.copy(c).addScaledVector(dir, r / Math.tan(14 * Math.PI / 180) * 0.62); cam.lookAt(c); cam.updateMatrixWorld();
    U.uCamPos.value.copy(cam.position);
    renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(scene, cam);
    have[id] = renderer.domElement.toDataURL('image/png');
  }
  U.uCamPos.value.copy(keep.cam); U.uSunDir.value.copy(keep.sun); U.uSunI.value = keep.sunI; U.uAmb.value = keep.amb; U.uFogDen.value = keep.fog; U.uAbs.value.copy(keep.abs);
  U.uNight.value = keep.night; U.uAirSun.value.copy(keep.airSun); U.uCloud.value = keep.cloud; U.uMoonI.value = keep.moonI; U.uTint.value.copy(keep.tint); U.uLamp.value = keep.lamp; U.uCaveOn.value = keep.cave; U.uUp.value.copy(keep.up); U.uHor.value.copy(keep.hor); U.uDown.value.copy(keep.down); U.uGolden.value = keep.gold;
  cache.set(loc.id, have);
  return have;
}

// A big portrait of one animal from any side, close in on a point of it (?debug: for checking models)
let studioR: THREE.WebGLRenderer | null = null;
export function studio(loc: Sea, id: string, view: [number, number, number], zoom = 1, focus: [number, number, number] | null = null, set: Record<string, number> = {}, w = 800, h = 500): string {
  const m = model(loc, id); if (!m) return '';
  m.obj.traverse((o: any) => { const u = o.material?.uniforms; if (u) for (const k in set) if (u[k]) u[k].value = set[k]; });   // (e.g. a manta feeding: { uFeed: 1 })
  if (!studioR) { studioR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); studioR.setPixelRatio(1); }
  studioR.setSize(w, h, false);
  const keep = { sun: U.uSunDir.value.clone(), sunI: U.uSunI.value, amb: U.uAmb.value, fog: U.uFogDen.value, abs: U.uAbs.value.clone(), cam: U.uCamPos.value.clone(), lamp: U.uLamp.value, tint: U.uTint.value.clone() };
  U.uSunDir.value.set(0.35, 0.85, 0.4).normalize(); U.uSunI.value = 1; U.uAmb.value = 1.1; U.uFogDen.value = 0.0001; U.uAbs.value.set(0, 0, 0); U.uLamp.value = 0; U.uTint.value.setRGB(1, 1, 1);
  const scene = new THREE.Scene(); scene.add(m.obj); m.obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m.obj), c = focus ? new THREE.Vector3(...focus) : box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(28, w / h, 0.005, 100);
  cam.position.copy(c).addScaledVector(new THREE.Vector3(...view).normalize(), Math.max(size.x, size.y, size.z) * 1.6 / zoom); cam.lookAt(c); cam.updateMatrixWorld();
  U.uCamPos.value.copy(cam.position);
  studioR.setClearColor(0x2a5560, 1); studioR.clear(); studioR.render(scene, cam);
  const url = studioR.domElement.toDataURL('image/png');
  U.uSunDir.value.copy(keep.sun); U.uSunI.value = keep.sunI; U.uAmb.value = keep.amb; U.uFogDen.value = keep.fog; U.uAbs.value.copy(keep.abs); U.uCamPos.value.copy(keep.cam); U.uLamp.value = keep.lamp; U.uTint.value.copy(keep.tint);
  return url;
}
