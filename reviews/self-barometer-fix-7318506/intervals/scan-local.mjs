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

// Local regression matrix around the actual ramp spill; all setup uses accepted steps.
const origin = 1007;
const rampChanges = Array.from({ length: 49 }, (_, i) => ({ at: i * 5 * M, env: { airTempC: 28 + i * 0.25, pressureHPa: 1010 } }));
const prefix = chain({ origin, duration: 11_820_000, changes: rampChanges, reads: [], stop: null });
const from = origin + 11_820_000, env = { airTempC: 37.75, pressureHPa: 1010 };
const saved = clone(prefix.last.state);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function tail({duration=30000, chunk=duration, reads=[], stop='operator', take=false, lose=false}={}) {
 let state=clone(saved), last; const observations=[], all=[];
 for(let f=from; f<from+duration;) {
  const t=Math.min(from+duration,f+chunk), isLast=t===from+duration;
  const actions=reads.filter(x=>x>=f-from&&x<t-from).map(x=>({at:from+x,action:'read_gauge'}));
  if(take&&isLast)actions.push({at:t,action:'take_out'});
  last=step(request(f,t+(take&&isLast?1:0),state,env,actions,{equipment:lose&&isLast?[]:[bulb()],...(isLast&&!take?{stop}: {})}));
  state=clone(last.state); all.push(last);observations.push(...last.observations);f=t;
 }
 return {last,observations,all};
}
const matrix=[];
for(const duration of [28000,29000,29137,29737,29999,30000,30137]) {
 const reads=[0,137,737,1000,15000,duration-1].filter(x=>x>=0&&x<duration);
 const ref=tail({duration,reads}), noRead=tail({duration});
 check(`no reads change physical settlement at ${duration}`,equal(physical(ref.last),physical(noRead.last)));
 for(const chunk of [duration,30000,1000,737,137]) {
  const out=tail({duration,chunk,reads});
  const p=equal(physical(ref.last),physical(out.last)),o=equal(ref.observations,out.observations);
  check(`same scan/settlement ${duration}/${chunk}`,p&&o);
  matrix.push({duration,chunk,physicalExact:p,observationsExact:o,condition:out.last.state.data.condition,spilledMg:out.last.state.data.spilledMg});
 }
 for(const mode of [{take:true},{lose:true,stop:'equipment-lost'}]) {
  const out=tail({duration,reads,...mode});
  check(`same termination ${duration}/${JSON.stringify(mode)}`,equal(physical(ref.last),physical(out.last))&&equal(ref.observations,out.observations));
 }
 check(`mass is closed ${duration}`,ref.last.consumed.reduce((s,x)=>s+x.amount.value,0)===ref.last.produced.reduce((s,x)=>s+x.amount.value,0)+ref.last.released.reduce((s,x)=>s+x.amount.value,0));
}
const head=step(request(from,from+1,clone(saved),env));
check('fresh /2 state is returned',head.state.schema==='civ-sci.air-barometer-pot/2');
const r1=step(request(from+1,from+30000,head.state,env,[],{stop:'operator'}));
const r2=step(request(from+1,from+30000,clone(head.state),env,[],{stop:'operator'}));
check('current /2 JSON roundtrip preserves final floats and settlement',equal(physical(r1),physical(r2)));
const legacy=step(request(from+1,from+30000,{schema:'civ-sci.air-barometer-pot/1',data:clone(head.state.data)},env,[],{stop:'operator'}));
check('old /1 refused without any physical settlement',legacy.status==='failed'&&legacy.evidence.notes.includes('unsupported-state-schema')&&!legacy.consumed.length&&!legacy.produced.length&&!legacy.released.length);
const at=tail({duration:30000,reads:[29999]});
const again=step(request(from+30000,from+60000,clone(at.last.state),{airTempC:28,pressureHPa:1010.1},[{at:from+30000,action:'read_gauge'},{at:from+59999,action:'read_gauge'}],{stop:'operator'}));
check('already spilled remains spilled on restore at new pressure',again.state.data.condition==='spilled-top'&&again.observations.every(o=>o.value===undefined));
const result={target:'731850666455de96a1e206028fc1cafe4f15f7c0',prefix:{from,state:saved},matrix,restored:again,checks:counters.checks,summary:{requests:counters.requests,checks:counters.checks.length,failed:counters.checks.filter(x=>!x.passed).length,exceptions:counters.exceptions.length,validatorFailures:counters.validatorFailures.length}};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.summary,null,2));
