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
test('no-break load, abrasion and exposure preserve one original ID and every mass',()=>{
 const L=fixture(),before=mass(read(L,'cord'));
 let out=applyCordLoad(L,req('cord','equal',{kind:'load',gf:40000}));assert.deepEqual(out.lotIds,['cord']);
 out=applyCordLoad(L,req('cord','sun',{kind:'exposure',fromIslandMs:1000,toIslandMs:2000,shade:false},1001,2000));
 out=applyCordLoad(L,req('cord','abrade',{kind:'abrasion',count:1},1002,2000));assert.deepEqual(out.lotIds,['cord']);assert.deepEqual(Object.keys(L.lots),['cord']);
 const p=read(L,'cord');assert.equal(p.damage.sunMs,1000);assert.equal(p.damage.abrasions,1);assert.deepEqual(mass(p),before);
 validateCordLoadLedger(json(L));
});
test('many same-ID events and JSON snapshots preserve chronology and monotone damage',()=>{
 const L=fixture();let previous=40000;for(let n=0;n<40;n++){
 Object.assign(L,json(L));const r=applyCordLoad(L,req('cord','event:'+n,{kind:'abrasion',count:1},1000+n,1000+n));
 assert.deepEqual(r.lotIds,['cord']);assert.equal(Object.keys(L.lots).length,1);assert.ok(currentCordStrength(read(L,'cord'))<=previous);previous=currentCordStrength(read(L,'cord'));
 }
 assert.equal(read(L,'cord').damage.abrasions,40);
 atomic(L,()=>applyCordLoad(L,req('cord','past',{kind:'load',gf:0},1038,1039)));
});
test('only fracture creates two new IDs, retaining independent child identity',()=>{
 const L=fixture(),source=piece(),out=applyCordLoad(L,req('cord','break',{kind:'load',gf:40001,breakAtMm:2}));
 assert.equal(out.lotIds.length,2);assert.ok(out.lotIds.every(id=>id!=='cord'));assert.ok(!L.lots.cord);
 const [a,b]=out.lotIds,sibling=json(L.lots[b]);
 assert.deepEqual(out.lotIds.map(id=>read(L,id)).reduce((n,p)=>n.map((v,i)=>v+mass(p)[i]),[0,0,0]),mass(source));
 const r=applyCordLoad(L,req(a,'child',{kind:'abrasion',count:1},1001,1001));assert.deepEqual(r.lotIds,[a]);assert.deepEqual(L.lots[b],sibling);
 assert.equal(read(L,a).damage.abrasions,1);assert.equal(read(L,b).damage.abrasions,0);
});
test('old intact replay after later fracture is idempotent and never resurrects',()=>{
 const L=fixture(),q=req('cord','before',{kind:'abrasion',count:0}),first=applyCordLoad(L,q);
 applyCordLoad(L,req('cord','break',{kind:'load',gf:40001},1001,1001));L.committed=[];const before=json(L);
 assert.deepEqual(applyCordLoad(L,q),first);assert.deepEqual(L,before);assert.ok(!L.lots.cord);
});
test('retired source cannot return and latest hidden quality cannot be replaced',()=>{
 const L=fixture(),old=json(L.lots.cord);applyCordLoad(L,req('cord','break',{kind:'load',gf:40001}));
 L.lots.cord=old;atomic(L,()=>applyCordLoad(L,req('cord','resurrect',{kind:'load',gf:0},1001,1001)));
 const a=fixture();applyCordLoad(a,req('cord','first',{kind:'abrasion',count:1}));a.lots.cord.quality!.abrasions=0;
 assert.throws(()=>validateCordLoadLedger(a),CordLoadError);atomic(a,()=>applyCordLoad(a,req('cord','rewind',{kind:'load',gf:0},1001,1001)));
});
test('identity receipts and old schemas are verified before changes', () => {
  const L = fixture();
  applyCordLoad(L, req('cord', 'first', { kind: 'load', gf: 0 }));
  const mutations: ((x: any) => void)[] = [
    x => { x.coirCordLoads.schema = 'civ-world.coir-cord-load-ledger/1'; },
    x => { x.coirCordLoads.cords.cord.recent[0].result.lotIds[0] = 'another'; },
    x => { x.coirCordLoads.strengthPolicyId = 'legacy-floating-strength'; },
    x => { x.coirCordLoads.cords.cord.latest.quality.base_strength_gf++; },
  ];
  for (const mutate of mutations) {
    const bad = json(L);
    mutate(bad);
    atomic(bad, () => applyCordLoad(bad,
      req('cord', 'second', { kind: 'load', gf: 0 }, 1001, 1001)));
  }
  const unsupported = json(L);
  (unsupported.coirCordLoads as any).schema = 'civ-world.coir-cord-load-ledger/1';
  assert.throws(() => validateCordLoadLedger(unsupported),
    (error: unknown) => error instanceof CordLoadError
      && error.code === 'unsupported-load-schema');
});

test('known relocation is allowed; extant-only validation permits later consumption',()=>{
 const L=fixture();applyCordLoad(L,req('cord','first',{kind:'load',gf:0}));L.lots.cord.location='elsewhere';
 applyCordLoad(L,req('cord','next',{kind:'load',gf:0},1001,1001));assert.equal(L.lots.cord.location,'elsewhere');
 delete L.lots.cord;validateCordLoadLedger(L);
});
console.log('PASS stable cord identity: '+groups+' groups.');
