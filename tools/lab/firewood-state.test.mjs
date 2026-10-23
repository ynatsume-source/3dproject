import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFirewoodState } from './firewood-state.mjs';
const world = () => ({ lab:{lots:{},equipment:{},runs:{}}, village:{labRuns:[],felled:[]},trees:[0,1] });
const lot = (mg,extra={}) => ({lotId:'wood',materialId:'firewood',location:'shelf',amount:{value:mg,unit:'mg'},quality:{water_ppm:450000},...extra});
test('shelf includes reserved real mass; excludes building timber and off-shelf fuel; reader is pure',()=>{
  const s=world(); s.lab.equipment['eq:firewood_stack']={};
  s.lab.lots={a:lot(3000001,{reservedBy:'dry'}),b:lot(6000000,{materialId:'wood'}),c:lot(12000000,{location:'fire'})};
  const before=JSON.stringify(s), random=Math.random;
  Math.random=()=>{throw Error('Display reader consumed random');};
  try { const r=readFirewoodState(s); assert.equal(r.shelfMg,3000001); assert.equal(r.visibleLogModels,2); assert.equal(JSON.stringify(s),before); }
  finally {Math.random=random;}
});
test('empty, missing roof, full, and overflow do not invent physical log counts',()=>{
  const s=world(); s.lab.lots.a=lot(60000000);
  assert.equal(readFirewoodState(s).visibleLogModels,0);
  s.lab.equipment['eq:firewood_stack']={};
  assert.equal(readFirewoodState(s).visibleLogModels,15);
  s.lab.lots.a.amount.value=0; assert.equal(readFirewoodState(s).visibleLogModels,0);
});
test('internal drying changes neither shelf state nor visible progress',()=>{
  const s=world(); s.lab.lots.a=lot(45000000,{reservedBy:'dry'});
  s.lab.runs.dry={runId:'dry',processId:'p15x_firewood_dry',status:'running',state:{data:{water_ppm:400000}}};
  s.village.labRuns=[{runId:'dry'}]; const a=readFirewoodState(s);
  s.lab.runs.dry.state.data.water_ppm=180000;
  assert.deepEqual(readFirewoodState(s),a);
  assert.equal('progress' in a,false);
});
test('firing takes display precedence over boiling and ends with its actual run',()=>{
  const s=world();
  s.lab.runs.fire={runId:'fire',processId:'p13y_pot_pit_fire',status:'running',state:{data:{kilnC:650}}};
  s.lab.runs.boil={runId:'boil',processId:'p31x_coconut_oil_boil',status:'needs-input'};
  s.village.labRuns=[{runId:'fire'},{runId:'boil'}];
  assert.equal(readFirewoodState(s).firing.kilnC,650);
  assert.equal(readFirewoodState(s).boilVisible,false);
  s.lab.runs.fire.status='completed';
  assert.equal(readFirewoodState(s).heapVisible,false);
  assert.equal(readFirewoodState(s).boilVisible,true);
});
test('local forest stumps and legacy saplings retain separate facts',()=>{
  const s=world();s.village.felled=[{x:61,z:-145,kind:2,h:4,at:100},{x:100,z:-145,kind:1,h:7,at:200}];
  const r=readFirewoodState(s);assert.equal(r.felled.length,1);assert.deepEqual(r.saplingDown,[0,1]);
});
