import assert from 'node:assert/strict';
import {draw} from '../src/science/rng';
import {createCoirCordModel, COIR_CORD_MODEL_SCHEMA, type CoirInput, type CoirContext, type CoirInterval} from '../src/science/prototypes/coir-cord';
import {createCordDamageModel,currentCordStrength,type CordDamageEvent} from '../src/science/prototypes/coir-cord-damage';
import {COIR_CORD_ASSUMPTION_ID as ID,COIR_CORD_RULES as R,cordShape,cordCanonical,type CoirMass,type CoirBundle,type CoirPiece} from '../src/science/prototypes/coir-cord-types';
import {createManualHuskSeparation} from '../src/science/prototypes/manual-husk-separation';
import {MANUAL_HUSK_ASSUMPTION,createManualHuskAssumptionProfile} from '../src/science/prototypes/manual-husk-assumptions';

let groups=0;
const test=(name:string,f:()=>void)=>{f();groups++;console.log('PASS '+name);};
const rejects=(f:()=>unknown)=>assert.throws(f);
const json=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const ctx=(op:CoirInput['operation'],runId='cord',seed=12345):CoirContext=>({worldId:'fixture',worldEpoch:'1',runId,seed,clock:op==='dry'?'island':'world',openedAtMs:1000});
const bundle=(fiberDryMg=72000,pithDryMg=14400,waterMg=115200):CoirBundle=>({lotId:'bundle',fiberDryMg,pithDryMg,waterMg});
function receipt(c:CoirContext,fromMs:number,toMs:number,confirmationId='work'):CoirInterval{
 return {confirmationId,worldId:c.worldId,worldEpoch:c.worldEpoch,runId:c.runId,clock:c.clock,fromMs,toMs,confirmedAtMs:toMs,
  ...(c.clock==='island'?{kind:'host-confirmed-roofed-wait' as const}:{kind:'host-confirmed-manual-work' as const,actorId:'res:worker',attendance:'present' as const})};
}
function make(input:CoirInput,runId='cord',seed=12345){
 const c=ctx(input.operation,runId,seed),m=createCoirCordModel(input,ID,c);
 return {c,m,at:(duration:number)=>m.project(duration?m.commit(m.start(),receipt(c,1000,1000+duration)):m.start())};
}
const total=(m:CoirMass)=>BigInt(m.fiberDryMg)+BigInt(m.pithDryMg)+BigInt(m.waterMg);
function massCheck(input:CoirMass,outputs:CoirMass[],vapor=0){
 for(const p of outputs)for(const v of [p.fiberDryMg,p.pithDryMg,p.waterMg])assert.ok(Number.isSafeInteger(v)&&v>=0);
 assert.ok(Number.isSafeInteger(vapor)&&vapor>=0);
 assert.equal(outputs.reduce((n,p)=>n+BigInt(p.fiberDryMg),0n),BigInt(input.fiberDryMg));
 assert.equal(outputs.reduce((n,p)=>n+BigInt(p.pithDryMg),0n),BigInt(input.pithDryMg));
 assert.equal(outputs.reduce((n,p)=>n+BigInt(p.waterMg),BigInt(vapor)),BigInt(input.waterMg));
}
function strand(lengthMm:number,lotId='strand',seed=12345){
 return make({operation:'twist',bundle:bundle(lengthMm*5,0,0),requestedLengthMm:lengthMm},lotId,seed).at(lengthMm*120).piece!;
}
const damageContext={worldId:'fixture',worldEpoch:'1',runId:'damage',openedAtIslandMs:1000,openedAtWorldMs:1000};
const event=(kind:'abrasion'|'load',eventId:string,value:number,atMs=1000):CordDamageEvent=>({
 eventId,worldId:'fixture',worldEpoch:'1',runId:'damage',clock:'world',atMs,...(kind==='abrasion'?{kind,count:value}:{kind,gf:value}),
});
const exposure=(fromIslandMs:number,toIslandMs:number,shade=false,eventId='sun'):CordDamageEvent=>({
 eventId,worldId:'fixture',worldEpoch:'1',runId:'damage',clock:'island',atMs:toIslandMs,kind:'exposure',fromIslandMs,toIslandMs,shade,
});
test('explicit versioned assumptions, valid clocks, no default recipe',()=>{
 assert.equal(cordShape({'a|b':1},['a','b']),false);
 const i:CoirInput={operation:'dry',bundle:bundle(),roofed:true};
 rejects(()=>createCoirCordModel(i,undefined,ctx('dry')));
 rejects(()=>createCoirCordModel(i,'calibrated-default',ctx('dry')));
 rejects(()=>createCoirCordModel(i,ID,ctx('twist')));
 assert.equal(R.evidence,'owner-assumption-not-calibrated');assert.ok(Object.isFrozen(R));
 rejects(()=>createCoirCordModel({...i,roofed:false} as any,ID,ctx('dry')));
 rejects(()=>createCoirCordModel(i,ID,{...ctx('dry'),seed:0x100000000}));
 rejects(()=>createCoirCordModel(i,ID,{...ctx('dry'),seed:NaN}));
});
test('three roofed island days remove only water, exactly and monotonically',()=>{
 const b=bundle(),{at}=make({operation:'dry',bundle:b,roofed:true});
 const end=at(R.dryIslandMs);
 assert.deepEqual(end.product,{fiberDryMg:72000,pithDryMg:14400,waterMg:8640});
 assert.equal(end.releasedWaterMg,106560);
 let previous=b.waterMg;
 for(const t of [0,1,30000,86400000,172800000,R.dryIslandMs-1,R.dryIslandMs,R.dryIslandMs+1]){
  const p=at(t);massCheck(b,[p.product],p.releasedWaterMg);assert.ok(p.product.waterMg<=previous);previous=p.product.waterMg;
 }
 assert.deepEqual(at(R.dryIslandMs+1).product,end.product);
});
test('already dry fibers never absorb invented water; waiting needs no resident',()=>{
 const b=bundle(1000,0,20),{m,at,c}=make({operation:'dry',bundle:b,roofed:true});
 assert.equal(at(0).status,'completed');assert.deepEqual(at(0).product,{fiberDryMg:1000,pithDryMg:0,waterMg:20});
 rejects(()=>m.commit(m.start(),{...receipt(c,1000,1001),kind:'host-confirmed-manual-work',actorId:'worker',attendance:'present'}));
});
test('sieving returns dry pith and its water, including tiny rounding and wet input',()=>{
 const b=bundle(72000,14400,8640),p=make({operation:'sieve',bundle:b}).at(60000);
 assert.deepEqual(p.product,{fiberDryMg:72000,pithDryMg:7200,waterMg:7920});
 assert.deepEqual(p.fallenPith,{fiberDryMg:0,pithDryMg:7200,waterMg:720});
 massCheck(b,[p.product,p.fallenPith]);
 const tiny=bundle(1,9,1),q=make({operation:'sieve',bundle:tiny}).at(1);
 assert.deepEqual(q.product,{fiberDryMg:1,pithDryMg:0,waterMg:0});massCheck(tiny,[q.product,q.fallenPith]);
 const wet=make({operation:'sieve',bundle:bundle()}).at(60000);massCheck(bundle(),[wet.product,wet.fallenPith]);
 const low=bundle(100,1,1);assert.deepEqual(make({operation:'sieve',bundle:low}).at(0).product,{fiberDryMg:100,pithDryMg:1,waterMg:1});
});
test('twisting rejects wet fiber, absent fiber, excess pith, invalid lengths and shortages',()=>{
 for(const input of [
  {bundle:bundle(100,10,12),requestedLengthMm:1},
  {bundle:bundle(0,10,0),requestedLengthMm:1},
  {bundle:bundle(100,21,0),requestedLengthMm:1},
  {bundle:bundle(10,0,0),requestedLengthMm:3},
  {bundle:bundle(10,0,0),requestedLengthMm:0},
  {bundle:bundle(10,0,0),requestedLengthMm:1.5},
 ])rejects(()=>make({operation:'twist',...input}));
 assert.ok(make({operation:'twist',bundle:bundle(100,10,11),requestedLengthMm:1}).at(120).piece);
});
test('partial twist uses cumulative whole mm and leaves reusable dry fiber',()=>{
 const b=bundle(900,90,99),{at}=make({operation:'twist',bundle:b,requestedLengthMm:100});
 for(const [time,length] of [[0,0],[119,0],[120,1],[121,1],[11999,99],[12000,100]]){
  const p=at(time);assert.equal(p.lengthMm,length);massCheck(b,[p.product,...p.remaining]);
  assert.equal(p.product.fiberDryMg+p.product.pithDryMg,length*5);
  const rest=p.remaining[0];assert.ok(BigInt(rest.waterMg)*10n<=BigInt(rest.fiberDryMg+rest.pithDryMg));
 }
 assert.equal(at(119).piece,null);assert.equal(at(12000).piece!.lengthMm,100);
 const rem=at(12000).remaining[0],next=make({operation:'twist',bundle:{...rem,lotId:'remainder'},requestedLengthMm:98}).at(11760);
 massCheck(rem,[next.product,...next.remaining]);assert.equal(next.remaining[0].waterMg,0);
});
test('same seed is deterministic, different seeds vary only hidden twist quality',()=>{
 const strengths=new Set<number>();const observations=new Set<string>();
 for(let seed=0;seed<30;seed++){
  const a=make({operation:'twist',bundle:bundle(1000,100,0),requestedLengthMm:100},'seeded',seed);
  const b=make({operation:'twist',bundle:bundle(1000,100,0),requestedLengthMm:100},'seeded',seed);
  const p=a.at(12000).piece!,q=b.at(12000).piece!;
  assert.deepEqual(p,q);assert.ok(p.baseStrengthGf>=34000&&p.baseStrengthGf<=46000);strengths.add(p.baseStrengthGf);
  observations.add(JSON.stringify(a.m.observe(a.m.commit(a.m.start(),receipt(a.c,1000,13000)))));
  const high=make({operation:'twist',bundle:bundle(1000,200,0),requestedLengthMm:100},'seeded',seed).at(12000).piece!;
  assert.ok(Math.abs(high.baseStrengthGf-p.baseStrengthGf*0.7)<=1);
 }
 assert.ok(strengths.size>20);assert.equal(observations.size,1);
});
test('three similar strands make shorter rope and retain long suffixes',()=>{
 const strands:[CoirPiece,CoirPiece,CoirPiece]=[strand(1000,'a'),strand(1050,'b'),strand(1100,'c')];
 const {at}=make({operation:'ply',strands});
 const p=at(54000);assert.equal(p.lengthMm,900);assert.equal(p.piece!.material,'coir_rope');
 assert.deepEqual(p.leftovers!.map(x=>x.lengthMm),[50,100]);
 const initial=strands.reduce((a,x)=>({fiberDryMg:a.fiberDryMg+x.fiberDryMg,pithDryMg:a.pithDryMg+x.pithDryMg,waterMg:a.waterMg+x.waterMg}),{fiberDryMg:0,pithDryMg:0,waterMg:0});
 massCheck(initial,[p.product,...p.remaining]);
 const strengths=strands.map(currentCordStrength),expected=Number(BigInt(Math.min(...strengths))*255n/100n);
 assert.equal(p.piece!.baseStrengthGf,expected);assert.ok(expected<=strengths.reduce((a,b)=>a+b));
 for(const t of [0,59,60,61,53999,54000]){const q=at(t);massCheck(initial,[q.product,...q.remaining]);}
});
test('ply refuses insufficient, duplicated, short or mismatched strands',()=>{
 const s=[strand(1000,'a'),strand(1000,'b'),strand(1000,'c')];
 for(const values of [[s[0],s[1]],[s[0],s[0],s[2]],[strand(2,'a'),strand(2,'b'),strand(2,'c')],[s[0],s[1],strand(1101,'c')]]){
  rejects(()=>make({operation:'ply',strands:values as any}));
 }
 rejects(()=>make({operation:'ply',strands:[s[0],s[1],{...s[2],material:'coir_rope'}] as any}));
});
test('all four operations match off-knot partitions, pauses, JSON restore and replay',()=>{
 const inputs:CoirInput[]=[
  {operation:'dry',bundle:bundle(),roofed:true},
  {operation:'sieve',bundle:bundle(72000,14400,8640)},
  {operation:'twist',bundle:bundle(900,90,99),requestedLengthMm:100},
  {operation:'ply',strands:[strand(1000,'a'),strand(1050,'b'),strand(1100,'c')]},
 ];
 const durations=[R.dryIslandMs,60000,12000,54000];
 inputs.forEach((input,index)=>{
  const {m,c,at}=make(input),duration=durations[index],end=duration+17;
  for(const fractions of [[1,0.17,0.31,0.62],[0.5,0.50001,0.91]]){
   const cuts=[0,...fractions.map(x=>Math.max(1,Math.min(end-1,Math.floor(end*x)))),end].sort((a,b)=>a-b).filter((x,i,a)=>!i||x>a[i-1]);
   let s=m.start(),cursor=1000;
   for(let i=1;i<cuts.length;i++){
    const n=cuts[i]-cuts[i-1],r=receipt(c,cursor,cursor+n,'piece:'+i);
    s=m.commit(m.restore(json(s)),r);cursor+=n+77;
    const snapshot=JSON.stringify(s);s=m.commit(s,r);assert.equal(JSON.stringify(s),snapshot);
    rejects(()=>m.commit(s,{...r,confirmedAtMs:r.confirmedAtMs+1}));
   }
   assert.deepEqual(m.project(s),at(end));
  }
 });
 const i:CoirInput={operation:'twist',bundle:bundle(100,10,11),requestedLengthMm:13},a=make(i);
 let s=a.m.start();for(let t=0;t<1560;t++)s=a.m.commit(s,receipt(a.c,1000+t,1001+t,'ms:'+t));
 assert.deepEqual(a.m.project(s),a.at(1560));
});
test('save validation, context binding and defensive copies remain strict',()=>{
 const input:CoirInput={operation:'twist',bundle:bundle(900,90,99),requestedLengthMm:100};
 const a=make(input),s=a.m.commit(a.m.start(),receipt(a.c,1000,1600));
 for(const mutate of [(x:any)=>x.binding+='x',(x:any)=>x.schema='old',(x:any)=>x.intervals[0].toMs++,(x:any)=>x.intervals.push(x.intervals[0]),(x:any)=>x.extra=1]){
  const b=json(s);mutate(b);rejects(()=>a.m.restore(b));
 }
 rejects(()=>createCoirCordModel(input,ID,{...a.c,seed:2}).restore(s));
 rejects(()=>createCoirCordModel({...input,requestedLengthMm:99},ID,a.c).restore(s));
 const saved=a.m.project(s);input.bundle.waterMg=0;
 assert.deepEqual(a.m.project(s),saved);const copy=a.m.project(s);copy.product.fiberDryMg=0;assert.deepEqual(a.m.project(s),saved);
});
test('resident observations contain no strength, quality jitter or unmeasured mass/length',()=>{
 const a=make({operation:'twist',bundle:bundle(900,90,99),requestedLengthMm:100}),s=a.m.commit(a.m.start(),receipt(a.c,1000,13000));
 assert.deepEqual(Object.keys(a.m.observe(s)),['text']);
 assert.ok(!/\d|gf|mg|seed|strength|850|40000/.test(JSON.stringify(a.m.observe(s))));
 const measured=a.m.observe(s,{kind:'host-confirmed-length-measurement',worldId:'fixture',worldEpoch:'1',runId:'cord',atMs:13000});
 assert.deepEqual(Object.keys(measured).sort(),['lengthMm','text']);assert.equal(measured.lengthMm,100);
 rejects(()=>a.m.observe(s,{kind:'host-confirmed-length-measurement',worldId:'other',worldEpoch:'1',runId:'cord',atMs:13000}));
 assert.match(a.m.observe(a.m.start()).text,/まだ/);
});
test('one sunny year and ten shaded years agree; cumulative rounding is partition invariant',()=>{
 const p={...strand(1000),baseStrengthGf:40000},m=createCordDamageModel(p,ID,damageContext),Y=R.yearIslandMs;
 const sunny=m.commit(m.start(),exposure(1000,1000+Y));
 const shady=m.commit(m.start(),exposure(1000,1000+10*Y,true));
 assert.equal(m.project(sunny).strengthGf,20000);assert.equal(m.project(shady).strengthGf,20000);
 let s=m.start();for(let k=0;k<100;k++)s=m.commit(m.restore(json(s)),exposure(1000+Y*k/100,1000+Y*(k+1)/100,false,'part:'+k));
 assert.deepEqual(m.project(s),m.project(sunny));
 const gap=m.commit(m.start(),exposure(1000+Y,1000+2*Y));assert.equal(m.project(gap).strengthGf,20000);
 const shade1=m.commit(m.start(),exposure(1000,1000+Y,true));assert.ok(m.project(shade1).strengthGf>20000);
});
test('abrasion uses cumulative confirmed counts and damage is monotone',()=>{
 const p=strand(1000),m=createCordDamageModel(p,ID,damageContext);
 const whole=m.commit(m.start(),event('abrasion','whole',100));
 let s=m.start(),prev=p.baseStrengthGf;
 for(let n=0;n<100;n++){s=m.commit(m.restore(json(s)),event('abrasion','hit:'+n,1,1000+n));const q=m.project(s);assert.ok(q.strengthGf<=prev);prev=q.strengthGf;assert.equal(total(q.pieces[0]),total(p));}
 assert.deepEqual(m.project(s),m.project(whole));
 const saved=JSON.stringify(s);assert.equal(JSON.stringify(m.commit(s,s.events[0])),saved);
 rejects(()=>m.commit(s,{...s.events[0],count:2} as any));
 for(let n=1;n<=40;n++){s=m.commit(s,exposure(1000+(n-1)*R.yearIslandMs,1000+n*R.yearIslandMs,false,'year:'+n));const now=m.project(s).strengthGf;assert.ok(now<=prev&&now>=0);prev=now;}
});
test('load threshold is strict and broken pieces conserve all masses and length',()=>{
 const p:CoirPiece={lotId:'odd',material:'coir_rope',lengthMm:7,fiberDryMg:31,pithDryMg:4,waterMg:3,baseStrengthGf:40000,damage:{sunMs:0,shadeMs:0,abrasions:0}};
 const m=createCordDamageModel(p,ID,damageContext);
 let s=m.commit(m.start(),event('load','equal',40000));assert.equal(m.project(s).status,'intact');
 const load={...event('load','break',40001,1001),breakAtMm:2} as CordDamageEvent;
 s=m.commit(m.restore(json(s)),load);const q=m.project(s);
 assert.equal(q.status,'broken');assert.deepEqual(q.pieces.map(x=>x.lengthMm),[2,5]);massCheck(p,q.pieces);
 assert.ok(q.pieces.every(x=>currentCordStrength(x)===40000));
 assert.equal(JSON.stringify(m.commit(s,load)),JSON.stringify(s));rejects(()=>m.commit(s,event('abrasion','after',1,1002)));
 const half=m.project(m.commit(m.start(),event('load','half',40001)));assert.deepEqual(half.pieces.map(x=>x.lengthMm),[3,4]);
});
test('broken pieces and plied aged strands retain damage and visible wear',()=>{
 const aged={...strand(1000,'aged'),damage:{sunMs:R.yearIslandMs,shadeMs:0,abrasions:3}};
 const m=createCordDamageModel(aged,ID,damageContext),before=currentCordStrength(aged);
 const q=m.project(m.commit(m.start(),event('load','break',before+1)));
 for(const p of q.pieces){
  assert.equal(currentCordStrength(p),before);
  const next=createCordDamageModel(p,ID,{...damageContext,runId:'next'});
  assert.equal(next.project(next.start()).strengthGf,before);assert.match(next.observe(next.start()).join(' '),/色あせ/);
 }
 const strands:[CoirPiece,CoirPiece,CoirPiece]=[aged,strand(1000,'b'),strand(1000,'c')];
 const rope=make({operation:'ply',strands}).at(54000).piece!;
 assert.equal(rope.baseStrengthGf,Number(BigInt(Math.min(...strands.map(currentCordStrength)))*255n/100n));
 const rm=createCordDamageModel(rope,ID,damageContext);assert.match(rm.observe(rm.start()).join(' '),/色あせ/);assert.match(rm.observe(rm.start()).join(' '),/擦れ/);
});
test('damage restores binding and refuses overlap, wrong clock, reversed events or corrupt state',()=>{
 const p=strand(1000),m=createCordDamageModel(p,ID,damageContext),s=m.commit(m.start(),exposure(1000,2000));
 rejects(()=>m.commit(s,exposure(1500,2500)));
 rejects(()=>m.commit(s,{...event('abrasion','bad',1),clock:'island'} as any));
 const a=m.commit(s,event('abrasion','later',1,2000));rejects(()=>m.commit(a,event('load','earlier',1,1999)));
 rejects(()=>m.commit(s,{...event('load','other',1),runId:'other'}));
 for(const mutate of [(x:any)=>x.schema='old',(x:any)=>x.binding+='x',(x:any)=>x.events[0].shade='yes',(x:any)=>x.extra=1]){
  const bad=json(s);mutate(bad);rejects(()=>m.restore(bad));
 }
 rejects(()=>createCordDamageModel({...p,baseStrengthGf:p.baseStrengthGf+1},ID,damageContext).restore(s));
 rejects(()=>createCordDamageModel(p,undefined,damageContext));
});
test('one-mm or unrepresentable cuts refuse without duplication or mutation',()=>{
 for(const p of [
  {...strand(1),material:'coir_rope' as const},
  {lotId:'tiny',material:'coir_rope' as const,lengthMm:2,fiberDryMg:1,pithDryMg:0,waterMg:0,baseStrengthGf:1,damage:{sunMs:0,shadeMs:0,abrasions:0}},
 ]){
  const m=createCordDamageModel(p,ID,damageContext),s=m.start(),before=JSON.stringify(s);
  rejects(()=>m.commit(s,event('load','break',p.baseStrengthGf+1)));assert.equal(JSON.stringify(s),before);
 }
 const p=strand(1000),m=createCordDamageModel(p,ID,damageContext);
 for(const breakAtMm of [0,1000,1001,0.5])rejects(()=>m.commit(m.start(),{...event('load','bad',999999),breakAtMm} as any));
});
test('wet and salt-water interpretation does not change v1 strength or leak it',()=>{
 const p=strand(1000),wet={...p,waterMg:10000};
 assert.equal(currentCordStrength(p),currentCordStrength(wet));
 const m=createCordDamageModel(wet,ID,damageContext),words=m.observe(m.start());
 assert.ok(!/\d|gf|strength|seed|40000/.test(JSON.stringify(words)));
 assert.equal(m.project(m.start()).pieces[0].waterMg,10000);
});
test('deterministic property sweep conserves every component through partial twisting',()=>{
 let n=12345;const rand=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n;};
 for(let k=0;k<500;k++){
  const f=10+rand()%100000,p=Math.floor(f*(rand()%21)/100),w=Math.floor((f+p)/10),len=1+rand()%Math.floor((f+p)/5);
  const b=bundle(f,p,w),input:CoirInput={operation:'twist',bundle:b,requestedLengthMm:len};
  const a=make(input,'fuzz',rand()),duration=len*120,t=rand()%(duration+1),q=a.at(t);
  massCheck(b,[q.product,...q.remaining]);
  const split=Math.floor(t/2);let s=a.m.start();
  if(split)s=a.m.commit(s,receipt(a.c,1000,1000+split,'a'));
  if(t>split)s=a.m.commit(a.m.restore(json(s)),receipt(a.c,5000+split,5000+t,'b'));
  assert.deepEqual(a.m.project(s),q);
 }
});
test('PR20 extraction to drying, sieving, strands and rope closes the complete 900-g source',()=>{
 const h={materialId:'wet_unseparated_coconut_husk' as const,lotId:'husk',separation:'never-separated' as const,dryMg:300000,waterMg:600000,soakHistory:[]};
 const c={worldId:'fixture',worldEpoch:'1',runId:'manual',openedAtWorldMs:1000};
 const hm=createManualHuskSeparation(h,createManualHuskAssumptionProfile(h,MANUAL_HUSK_ASSUMPTION.id),c);
 const hp=hm.commit(hm.start(),{kind:'host-confirmed-manual-work',confirmationId:'manual',worldId:c.worldId,worldEpoch:c.worldEpoch,runId:c.runId,actorId:'worker',attendance:'present',operation:'separate-wet-husk',fromWorldMs:1000,toWorldMs:241000,confirmedAtWorldMs:241000}).pools;
 const raw=bundle(hp.fiber.dryMg,hp.attachedPith.dryMg,hp.fiber.waterMg+hp.attachedPith.waterMg);
 const d=make({operation:'dry',bundle:raw,roofed:true}).at(R.dryIslandMs);
 const sieved=make({operation:'sieve',bundle:d.bundle!}).at(60000);
 let source=sieved.bundle!;const strands:CoirPiece[]=[];
 for(let k=0;k<3;k++){
  const t=make({operation:'twist',bundle:source,requestedLengthMm:5280},'strand:'+k).at(633600);
  strands.push(t.piece!);source={...t.remaining[0],lotId:'remaining:'+k};
 }
 const rope=make({operation:'ply',strands:strands as [CoirPiece,CoirPiece,CoirPiece]}).at(285120);
 assert.equal(rope.lengthMm,4752);assert.equal(total(rope.product),87120n);
 assert.equal(total(rope.product)+total(sieved.fallenPith)+BigInt(d.releasedWaterMg)+BigInt(hp.residualHusk.dryMg)+BigInt(hp.residualHusk.waterMg)+BigInt(hp.dischargedWaterMg),900000n);
 assert.equal(rope.product.fiberDryMg,72000);assert.equal(rope.product.pithDryMg,7200);assert.equal(rope.product.waterMg,7920);
});
test('C1 draw keys include run and source lot, with stable JSON/replay decisions',()=>{
 const runStrengths=new Set<number>(),lotStrengths=new Set<number>(),seed=12345;
 const input:CoirInput={operation:'twist',bundle:bundle(1000,100,0),requestedLengthMm:100};
 for(let k=0;k<64;k++){
  const runId='keyed:'+k,lotId='source:'+k;
  const run=make(input,runId,seed),lot=make({...input,bundle:{...input.bundle,lotId}},'keyed',seed);
  const first=run.m.commit(run.m.start(),receipt(run.c,1000,1737,'a'));
  const resumed=createCoirCordModel(json(input),ID,json(run.c));
  const s=resumed.commit(resumed.restore(json(first)),receipt(run.c,2000,13263,'b'));
  const replayed=resumed.commit(resumed.restore(json(s)),receipt(run.c,1000,1737,'a'));
  assert.deepEqual(resumed.project(s),run.at(12000));assert.deepEqual(replayed,s);
  const ppm=R.jitterMinPpm+Math.floor(draw(seed,runId,input.bundle.lotId,'coir-twist-quality')*(R.jitterRangePpm+1));
  assert.equal(run.at(12000).piece!.baseStrengthGf,Number(BigInt(R.strandStrengthGf)*BigInt(ppm)/1000000n));
  runStrengths.add(run.at(12000).piece!.baseStrengthGf);lotStrengths.add(lot.at(12000).piece!.baseStrengthGf);
  assert.deepEqual(lot.at(12000).product,run.at(12000).product);assert.deepEqual(lot.m.observe(lot.m.start()),run.m.observe(run.m.start()));
 }
 assert.ok(runStrengths.size>50);assert.ok(lotStrengths.size>50);
});
test('C1 algorithm version rejects old saves, including schema-only relabel',()=>{
 const input:CoirInput={operation:'twist',bundle:bundle(1000,100,0),requestedLengthMm:100},a=make(input);
 const fresh=a.m.start(),old={...json(fresh),schema:'prototype-coir-cord/1',binding:cordCanonical([ID,R,input,a.c])};
 assert.equal(fresh.schema,COIR_CORD_MODEL_SCHEMA);rejects(()=>a.m.restore(old));rejects(()=>a.m.restore({...old,schema:COIR_CORD_MODEL_SCHEMA}));
 assert.deepEqual(a.m.restore(json(fresh)),fresh);
});
console.log('PASS coir cord science: '+groups+' groups; isolated owner assumptions only.');
