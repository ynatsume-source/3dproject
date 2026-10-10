// Independent review of self-made gauge interval/reading/settlement semantics.
// Run from TARGET: node --import tsx --import ./scripts/node-assets.mjs /absolute/repro.mjs TARGET [RESULT.json]
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const target = process.argv[2];
const { scienceStep } = await import(pathToFileURL(`${target}/src/science/step/index.ts`).href);
const { BAROMETER_POT_PROCESS } = await import(pathToFileURL(`${target}/src/science/step/barometer-pot.ts`).href);
const { validateResult } = await import(pathToFileURL(`${target}/src/science/step/validate.ts`).href);
const { rise } = await import(pathToFileURL(`${target}/src/science/step/barometer.ts`).href);
const { TAR_SEAL_PROCESS, potToEquipmentParams } = await import(pathToFileURL(`${target}/src/science/step/vessel.ts`).href);
const H = 3_600_000, M = 60_000;
const counters = { requests: 0, exceptions: [], nonFinite: [], validatorFailures: [], checks: [] };
const finite = x => typeof x === 'number' ? Number.isFinite(x) : Array.isArray(x) ? x.every(finite) : x && typeof x === 'object' ? Object.values(x).every(finite) : true;
const check = (name, condition, detail) => counters.checks.push({ name, passed: !!condition, ...(detail === undefined ? {} : { detail }) });
const step = q => {
  counters.requests++;
  try { const r = scienceStep(q); if (!finite(r)) counters.nonFinite.push(q.requestId); counters.validatorFailures.push(...validateResult(q, r).map(v => `${q.requestId}: ${v}`)); return r; }
  catch (e) { counters.exceptions.push(`${q.requestId}: ${e.stack}`); throw e; }
};
const water = { lotId: 'lot:water', materialId: 'process_water', amount: { unit: 'mg', value: 20_000 }, location: 'site:jar', quality: { history_complete: 1 } };
// Actual sealing output and assembly table make the main fixture, rather than inventing a leak/tau pair.
const seal = step({ contract: '0.2.1', ...TAR_SEAL_PROCESS, catalogVersion: 'civ-sci-test-2', requestId: 'fixture:seal', runId: 'run:fixture-seal',
  world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, interval: { from: 0, to: H }, state: null,
  environment: { sampleId: 'env:fixture', source: 'simulation', effectiveAt: 0, airTempC: 28 },
  lots: [
    { lotId: 'lot:pot', materialId: 'fired_pot_test', amount: { value: 600_000, unit: 'mg' }, location: 'site:shelf', quality: { capacity_ml: 500, absorption_ppm: 120_000 } },
    { lotId: 'lot:tar', materialId: 'wood_tar', amount: { value: 30_000, unit: 'mg' }, location: 'site:shelf', quality: { x_wood_tar_ppm: 1_000_000 } },
    { lotId: 'lot:tube', materialId: 'gauge_tube_test', amount: { value: 40_000, unit: 'mg' }, location: 'site:shelf', quality: { bore_mm: 8, length_mm: 200 } },
    { lotId: 'lot:wood', materialId: 'firewood', amount: { value: 2_000_000, unit: 'mg' }, location: 'site:shelf', quality: { water_ppm: 150_000 } },
  ], equipment: [
    { equipmentId: 'eq:brush', kind: 'fixture_tar_brush', catalogEntry: 'fixture_tar_brush', catalogVersion: 'civ-sci-test-2', condition: 1 },
    { equipmentId: 'eq:fire', kind: 'open_fire_pit', catalogEntry: 'open_fire_pit', catalogVersion: 'civ-sci-test-2', condition: 1, params: { maxBurnKgPerH: 3 } },
  ], energy: [{ sourceId: 'src:hands', kind: 'mechanical', maxJ: 72_000 }], seed: 1,
  actions: [{ at: M, action: 'seal', residentId: 'res:lantern', params: { jointTarG: 6 } }] });
const producedPot = seal.produced.find(p => p.materialId === 'fired_pot_test');
if (!producedPot) throw new Error(`Fixture did not seal: ${JSON.stringify(seal)}`);
const lotPot = { lotId: 'lot:sealed', materialId: producedPot.materialId, amount: producedPot.amount, quality: producedPot.quality, location: producedPot.into };
const assembledParams = { ...potToEquipmentParams(lotPot), markMm: 5 };
const bulb = (params = {}) => ({ equipmentId: 'eq:bulb', kind: 'assembled_pot', catalogEntry: 'assembled_pot', catalogVersion: 'civ-sci-test-2', condition: 1, params: { ...assembledParams, ...params } });
function request(from, to, state, env = {}, actions = [], extra = {}) {
  return { contract: '0.2.1', ...BAROMETER_POT_PROCESS, catalogVersion: 'civ-sci-test-2', requestId: `g:${from}:${to}`, runId: 'run:gauge',
    world: { worldId: 'w', worldEpoch: 'e', worldVersion: 1 }, interval: { from, to }, state,
    environment: { sampleId: 'env:gauge', source: 'record', effectiveAt: from, airTempC: 28, pressureHPa: 1010, ...env }, lots: [water],
    equipment: [bulb()], energy: [], seed: 1, actions: actions.map(a => ({ ...a, residentId: 'res:lantern' })), ...extra };
}
const clone = x => JSON.parse(JSON.stringify(x));
const physical = r => ({ state: r.state, produced: r.produced, released: r.released, consumed: r.consumed, energy: r.energy, equipmentWear: r.equipmentWear });
function chain({ origin = 1007, duration = H, chunk = duration, changes = [], reads = [], takeOut, stop = 'operator', params = {}, loseEquipment = false } = {}) {
  let state = null, last; const observations = [], all = [];
  const envAt = t => { let env = {}; for (const p of changes) if (t >= origin + p.at) env = p.env; return env; };
  for (let from = origin; from < origin + duration;) {
    const futureChanges = changes.filter(c => origin + c.at > from).map(c => origin + c.at);
    const to = Math.min(origin + duration, from + chunk, ...futureChanges);
    const isLast = to === origin + duration;
    const actions = reads.filter(at => origin + at >= from && origin + at < to).map(at => ({ at: origin + at, action: 'read_gauge' }));
    if (takeOut !== undefined && origin + takeOut >= from && origin + takeOut < to) actions.push({ at: origin + takeOut, action: 'take_out' });
    last = step(request(from, to, state, envAt(from), actions, { equipment: loseEquipment && isLast && state ? [] : [bulb(params)], ...(isLast && stop ? { stop } : {}) }));
    state = clone(last.state); all.push(last); observations.push(...last.observations);
    if (last.status !== 'running') break;
    from = to;
  }
  return { last, observations, all };
}

// Deliberately tune only the accepted tube length to a subsecond local peak.
// This is a C-level precision limit of a 1-second scan, not an ordinary weather case.
const params={tubeLengthMm:600,airLeakTauMin:95};
const cloneJ=x=>JSON.parse(JSON.stringify(x));
const eq=p=>[bulb(p)];
let state=null,localPeak=null;
const env={airTempC:40,pressureHPa:1010};
for(let t=0;t<3*H;t+=30000) {
 const actions=[{at:t,action:'read_gauge'}];
 const r=step(request(t,t+30000,state,t===0?{}:env,actions,{equipment:eq(params)}));
 state=cloneJ(r.state);
 const d=r.state.data,s=d.s,c=d.ctl;
 const yy=sec=>(s.sHi+c.dsHi*sec)*(c.Ta+(s.bHi-c.Ta)*Math.exp(-sec/d.g.tauS));
 const derivative=sec=>c.dsHi*(c.Ta+(s.bHi-c.Ta)*Math.exp(-sec/d.g.tauS))+(s.sHi+c.dsHi*sec)*(-(s.bHi-c.Ta)/d.g.tauS)*Math.exp(-sec/d.g.tauS);
 if(derivative(0)>0&&derivative(30)<0) {
  let lo=0,hi=30;for(let j=0;j<70;j++){let m=(lo+hi)/2;if(derivative(m)>0)lo=m;else hi=m;}
  const sec=(lo+hi)/2,ts=s.tMs;
  const xAt=dt=>rise(d.g,s.sHi+c.dsHi*dt,c.Pa,c.Ta+(s.bHi-c.Ta)*Math.exp(-dt/d.g.tauS));
  const oneSecMax=Math.max(...Array.from({length:31},(_,i)=>xAt(i)));
  const peakAtMs=Math.round(ts+1000*sec),sampledPeak=xAt((peakAtMs-ts)/1000),half=(sampledPeak+oneSecMax)/2;
  localPeak={start:ts,sec,peakAtMs,sampledPeak,oneSecMax,half,tubeLengthMm:half*2000,peakMissWidthM:sampledPeak-oneSecMax,derivativeAtStart:derivative(0),derivativeAtEnd:derivative(30)};
  break;
 }
}
if(!localPeak)throw new Error('No local peak found');
const narrow={...params,tubeLengthMm:localPeak.tubeLengthMm};
function run(read) {
 let state=null,observations=[],last;
 for(let t=0;t<=localPeak.start;t+=30000){
  const actions=read&&t===localPeak.start?[{at:localPeak.peakAtMs,action:'read_gauge'}]:[];
  last=step(request(t,t+30000,state,t===0?{}:env,actions,{equipment:eq(narrow),...(t===localPeak.start?{stop:'operator'}:{})}));
  state=cloneJ(last.state);observations.push(...last.observations);
 }
 return {last,observations};
}
const withRead=run(true),withoutRead=run(false);
const reproduced=withRead.observations.some(x=>String(x.text??'').includes('あふれ'))&&withRead.last.state.data.condition==='ok'&&withRead.last.released.length===0;
const result={target:'731850666455de96a1e206028fc1cafe4f15f7c0',impact:'C',localPeak,reproduced,withRead,withoutRead,summary:{requests:counters.requests,exceptions:counters.exceptions.length,validatorFailures:counters.validatorFailures.length}};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({localPeak,reproduced,condition:withRead.last.state.data.condition,observations:withRead.observations,summary:result.summary},null,2));
