import assert from 'node:assert/strict';
import {emptyLedger,addLot,startRun} from '../src/world/process-runner';
import {COIR_CORD_ASSUMPTION_ID as ID,COIR_CORD_RULES as R,type CoirPiece} from '../src/science/prototypes/coir-cord-types';
import {
  currentIntegerCordStrength as currentCordStrength,
  createIntegerCordDamageModel as createCordDamageModel,
} from '../src/science/prototypes/coir-cord-damage';
import {readCordPiece,writeCordPiece} from '../src/world/coir-cord-lots';
import {applyCordLoad,applyCordLoadForResident,validateCordLoadLedger,CordLoadError,type CordLoadLedger,type CordLoadRequest,type CordHostEvent} from '../src/world/coir-cord-load';
let groups=0;function test(n:string,f:()=>void){f();groups++;console.log('PASS '+n);}
const json=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const piece=(lotId='cord'):CoirPiece=>({lotId,material:'coir_rope',lengthMm:7,fiberDryMg:31,pithDryMg:4,waterMg:3,baseStrengthGf:40000,damage:{sunMs:0,shadeMs:0,abrasions:0}});
function fixture(p=piece()){const L:CordLoadLedger=emptyLedger('fixture','epoch'),o=writeCordPiece(p,'site',1);addLot(L,{lotId:p.lotId,materialId:o.materialId,amount:o.amount,quality:o.quality,location:o.into!});return L;}
const req=(lotId:string,commandId:string,event:CordHostEvent,worldAtMs=1000,islandAtMs=1000):CordLoadRequest=>({commandId,assumptionId:ID,lotId,worldAtMs,islandAtMs,event});
const read=(L:CordLoadLedger,id:string)=>readCordPiece(L.lots[id]);
const semantic=(p:CoirPiece)=>{const{lotId:_,...v}=p;return v;};
const mass=(p:CoirPiece)=>[p.fiberDryMg,p.pithDryMg,p.waterMg];
function atomic(L:CordLoadLedger,f:()=>unknown){const old=JSON.stringify(L);assert.throws(f,CordLoadError);assert.equal(JSON.stringify(L),old);}
test('explicit assumptions and strict event shapes reject atomically',()=>{
 const L=fixture(),q=req('cord','q',{kind:'load',gf:1});
 for(const b of [{...q,assumptionId:'default'},{...q,extra:1},{...q,event:{kind:'load',gf:NaN}},{...q,event:{kind:'abrasion',count:-1}},
 {...q,event:{kind:'load',gf:1,breakAtMm:0}},{...q,event:{kind:'exposure',fromIslandMs:0,toIslandMs:1001,shade:false}}])atomic(L,()=>applyCordLoad(L,b as any));
});
test('strict load threshold and integer-conservative fracture followed by child reuse',()=>{
 const L=fixture(),a=applyCordLoad(L,req('cord','equal',{kind:'load',gf:40000}));assert.equal(a.lotIds.length,1);
 const b=applyCordLoad(L,req(a.lotIds[0],'over',{kind:'load',gf:40001,breakAtMm:2},1001,1001));
 assert.deepEqual(b.lotIds.map(id=>read(L,id).lengthMm),[2,5]);assert.deepEqual(b.lotIds.map(id=>read(L,id)).reduce((n,p)=>n.map((v,i)=>v+mass(p)[i]),[0,0,0]),mass(piece()));
 for(const id of b.lotIds){const c=applyCordLoad(L,req(id,'abrade:'+id,{kind:'abrasion',count:1},1002,1002));assert.equal(currentCordStrength(read(L,c.lotIds[0])),39600);}
 validateCordLoadLedger(json(L));
});
test('adapter matches core damage exactly and keeps strength in hidden quality',()=>{
 const L=fixture(),source=read(L,'cord'),out=applyCordLoad(L,req('cord','load',{kind:'load',gf:40001,breakAtMm:3}));
 const m=createCordDamageModel(source,ID,{worldId:'fixture',worldEpoch:'epoch',runId:out.runId,openedAtWorldMs:1000,openedAtIslandMs:1000});
 const s=m.commit(m.start(),{eventId:'load',worldId:'fixture',worldEpoch:'epoch',runId:out.runId,atMs:1000,clock:'world',kind:'load',gf:40001,breakAtMm:3});
 assert.deepEqual(out.lotIds.map(id=>semantic(read(L,id))),m.project(s).pieces.map(semantic));assert.deepEqual(out.observations,m.observe(s));
});
test('sunny exposure partitions and JSON resumes preserve cumulative strength',()=>{
 const Y=R.yearIslandMs,a=fixture(),b=fixture(),end=applyCordLoad(a,req('cord','whole',{kind:'exposure',fromIslandMs:1000,toIslandMs:1000+Y,shade:false},1000,1000+Y));
 let id='cord';for(let n=0;n<10;n++){Object.assign(b,json(b));id=applyCordLoad(b,req(id,'part:'+n,{kind:'exposure',fromIslandMs:1000+Y*n/10,toIslandMs:1000+Y*(n+1)/10,shade:false},1000+n,1000+Y*(n+1)/10)).lotIds[0];}
 assert.deepEqual(semantic(read(b,id)),semantic(read(a,end.lotIds[0])));assert.equal(currentCordStrength(read(b,id)),20000);
});
test('shade and repeated abrasion monotonically weaken without changing mass',()=>{
 const L=fixture(),Y=R.yearIslandMs;let out=applyCordLoad(L,req('cord','shade',{kind:'exposure',fromIslandMs:0,toIslandMs:10*Y,shade:true},0,10*Y)),prev=20000;
 for(let n=0;n<20;n++){out=applyCordLoad(L,req(out.lotIds[0],'hit:'+n,{kind:'abrasion',count:1},n+1,10*Y));const p=read(L,out.lotIds[0]);assert.ok(currentCordStrength(p)<=prev);prev=currentCordStrength(p);assert.deepEqual(mass(p),mass(piece()));}
});
test('durable replay survives consumed source, JSON, and trimmed global committed list',()=>{
 const L=fixture(),q=req('cord','durable',{kind:'abrasion',count:2}),a=applyCordLoad(L,q),b=json(L);b.committed=[];const old=json(b);
 assert.deepEqual(applyCordLoad(b,q),a);assert.deepEqual(b,old);atomic(b,()=>applyCordLoad(b,{...q,event:{kind:'abrasion',count:3}}));
});
test('overlap and clock reversal are rejected for returned lots and fracture children',()=>{
 const L=fixture(),a=applyCordLoad(L,req('cord','sun',{kind:'exposure',fromIslandMs:1000,toIslandMs:2000,shade:false},1000,2000));
 atomic(L,()=>applyCordLoad(L,req(a.lotIds[0],'again',{kind:'exposure',fromIslandMs:1999,toIslandMs:2500,shade:false},1001,2500)));
 atomic(L,()=>applyCordLoad(L,req(a.lotIds[0],'past',{kind:'load',gf:0},999,2000)));
 const b=applyCordLoad(L,req(a.lotIds[0],'break',{kind:'load',gf:50000},1001,2000));
 for(const id of b.lotIds)atomic(L,()=>applyCordLoad(L,req(id,'child:'+id,{kind:'exposure',fromIslandMs:1000,toIslandMs:3000,shade:false},1002,3000)));
});
test('unreported gaps add no damage and confirmations close the past',()=>{
 const L=fixture(),a=applyCordLoad(L,req('cord','gap',{kind:'exposure',fromIslandMs:1000,toIslandMs:2000,shade:false},1000,5000));assert.equal(read(L,a.lotIds[0]).damage.sunMs,1000);
 atomic(L,()=>applyCordLoad(L,req(a.lotIds[0],'retro',{kind:'exposure',fromIslandMs:2000,toIslandMs:5000,shade:false},1001,5000)));
});
test('reserved, unsplittable and altered hidden material is never consumed',()=>{
 const L=fixture();startRun(L,{processId:'other',processVersion:'1',catalogVersion:'test',contract:'0.2.1',clock:'world',lotIds:['cord'],equipmentIds:[],operator:'other'},1000);
 atomic(L,()=>applyCordLoad(L,req('cord','steal',{kind:'load',gf:50000})));
 const tiny=fixture({...piece(),lengthMm:1});atomic(tiny,()=>applyCordLoad(tiny,req('cord','tiny',{kind:'load',gf:50000})));
 const changed=fixture(),a=applyCordLoad(changed,req('cord','first',{kind:'abrasion',count:0}));changed.lots[a.lotIds[0]].quality!.base_strength_gf=50000;
 atomic(changed,()=>applyCordLoad(changed,req(a.lotIds[0],'changed',{kind:'load',gf:1},1001,1001)));
});
test('corrupt nested receipts, cursor metadata and saved checkpoints reject atomically', () => {
  const L = fixture();
  const a = applyCordLoad(L, req('cord', 'first', { kind: 'abrasion', count: 1 }));
  const mutations: ((x: any) => void)[] = [
    x => { delete x.coirCordLoads; },
    x => { delete x.coirCordLoadFormat; },
    x => { x.coirCordLoads.cords.cord.recent[0].request.event.count = 2; },
    x => { x.coirCordLoads.cords.cord.recent[0].result.lotIds[0] = 'other'; },
    x => { x.coirCordLoads.cords.cord.latest.quality.abrasions++; },
    x => { x.coirCordLoads.cords.cord.recent[0].result.observations[0] = 'hidden 40000'; },
    x => { x.coirCordLoads.cords.cord.cursor.islandAtMs--; },
  ];
  for (const mutate of mutations) {
    const bad = json(L);
    mutate(bad);
    assert.throws(() => validateCordLoadLedger(bad), CordLoadError);
    atomic(bad, () => applyCordLoad(bad,
      req(a.lotIds[0], 'next', { kind: 'load', gf: 0 }, 1001, 1001)));
  }
});

test('resident wrapper whitelists only observed words with no quantities or routing IDs',()=>{
 const L=fixture(),v=applyCordLoadForResident(L,req('cord','resident',{kind:'load',gf:40001}));
 assert.deepEqual(Object.keys(v).sort(),['observations','ok']);assert.ok(!/\d|gf|mg|strength|seed|lot:|run:/.test(JSON.stringify(v)));
 const bad=applyCordLoadForResident(L,req('missing40000','fail',{kind:'load',gf:999999}));assert.equal(bad.ok,false);assert.ok(!/\d|strength|seed/.test(JSON.stringify(bad)));
});
console.log('PASS coir cord load: '+groups+' groups.');
