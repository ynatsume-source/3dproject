import assert from 'node:assert/strict';
import type {LotView,ScienceStepResult} from '../src/world/science-contract';
import {emptyLedger,addLot} from '../src/world/process-runner';
import {beginManualHuskWork,recordManualHuskSpan} from '../src/world/manual-husk-work';
import {MANUAL_HUSK_ASSUMPTION as A} from '../src/science/prototypes/manual-husk-assumptions';
import {currentCordStrength} from '../src/science/prototypes/coir-cord-damage';
import {COIR_CORD_RULES as R,type CoirPiece} from '../src/science/prototypes/coir-cord-types';
import {CordLotError,readCordBundle,readCordPiece,readCordHistory,writeCordBundle,writeCordPiece,writeCordPith} from '../src/world/coir-cord-lots';
let groups=0;const test=(n:string,f:()=>void)=>{f();groups++;console.log('PASS '+n);};
const json=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const rejects=(f:()=>unknown)=>assert.throws(f,CordLotError);
function lot(p:ScienceStepResult['produced'][number],id='lot'):LotView{return{lotId:id,materialId:p.materialId,amount:{...p.amount},quality:{...p.quality},location:p.into!};}
function piece():CoirPiece{return{lotId:'piece',material:'coir_rope',fiberDryMg:5000,pithDryMg:600,waterMg:560,lengthMm:1000,baseStrengthGf:40000,damage:{sunMs:R.yearIslandMs,shadeMs:1234,abrasions:7},inheritedWear:{faded:true,abraded:true}};}
test('actual PR22 output decodes complete water/provenance and canonical roundtrip',()=>{
 for(const history of [0,1]){
 const L=emptyLedger('codec','1'),input={materialId:'wet_unseparated_coconut_husk' as const,lotId:'husk',separation:'never-separated' as const,dryMg:300000,waterMg:600000,soakHistory:[]};
 addLot(L,{lotId:'husk',materialId:input.materialId,amount:{value:900000,unit:'mg'},location:'site',quality:{dry_mg:300000,water_mg:600000,husk_count:1,unseparated:1,history_complete:history}});
 const {runId}=beginManualHuskWork(L,{commandId:'start',assumptionId:A.id,operatorId:'actor',huskCount:1,input,worksite:{locationId:'site',x:0,z:0,reachM:1},openedAtWorldMs:1000});
 recordManualHuskSpan(L,runId,{kind:'executor-activity-span',spanId:'end',worldId:'codec',worldEpoch:'1',runId,actorId:'actor',fromWorldMs:1000,toWorldMs:241000,confirmedAtWorldMs:241000,activity:'separate-wet-husk',targetLotId:'husk',targetSiteId:'site',arrived:true,fromPosition:{x:0,z:0},toPosition:{x:0,z:0}},241000);
 const l=Object.values(L.lots).find(l=>l.materialId==='coir_fiber_bundle')!,b=readCordBundle(l);
 assert.deepEqual(b,{lotId:l.lotId,fiberDryMg:72000,pithDryMg:14400,waterMg:115200});assert.equal(readCordHistory(l),history);
 assert.deepEqual(readCordBundle(lot(writeCordBundle(b,'site',history),l.lotId)),b);
 for(const change of [(q:any)=>delete q.fiber_water_mg,(q:any)=>q.fiber_water_mg++,(q:any)=>q.attached_pith_water_mg=0.5]){const x=json(l);change(x.quality);rejects(()=>readCordBundle(x));}
 }
});
test('tiny and maximum-safe bundles conserve integers; overflow refuses',()=>{
 for(const m of [{fiberDryMg:1,pithDryMg:0,waterMg:0},{fiberDryMg:1,pithDryMg:1,waterMg:2},{fiberDryMg:Number.MAX_SAFE_INTEGER-2,pithDryMg:1,waterMg:1}])
 assert.deepEqual(readCordBundle(lot(writeCordBundle(m,'site',1))),{lotId:'lot',...m});
 rejects(()=>writeCordBundle({fiberDryMg:Number.MAX_SAFE_INTEGER,pithDryMg:1,waterMg:0},'site',1));
});
test('wrong mass, quantity, hidden fields, material, provenance and codecs reject',()=>{
 const source=lot(writeCordBundle({fiberDryMg:10,pithDryMg:2,waterMg:1},'site',1));
 for(const f of [(l:any)=>l.materialId='coconut_husk',(l:any)=>l.amount.unit='g',(l:any)=>l.amount.value++,(l:any)=>l.quality.history_complete=2,
 (l:any)=>delete l.quality.codec_version,(l:any)=>l.quality.hidden_strength=40000,(l:any)=>l.quality.water_mg=NaN]){
 const b=json(source);f(b);rejects(()=>readCordBundle(b));}
});
test('piece roundtrip keeps all hidden damage and inherited wear with defensive objects',()=>{
 const p=piece(),l=lot(writeCordPiece(p,'site',0)),b=readCordPiece(json(l));
 assert.deepEqual(b,{...p,lotId:'lot'});assert.equal(currentCordStrength(b),currentCordStrength(p));assert.equal(readCordHistory(l),0);
 const old=json(l);b.damage.abrasions=999;b.inheritedWear!.faded=false;p.damage.sunMs=0;assert.deepEqual(l,old);
});
test('malformed piece fields and nested damage refuse while zero strength is valid',()=>{
 const source=lot(writeCordPiece(piece(),'site',1));
 for(const key of ['fiber_dry_mg','attached_pith_dry_mg','water_mg','length_mm','base_strength_gf','sun_ms','shade_ms','abrasions'])
 for(const value of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){const b=json(source);b.quality![key]=value;rejects(()=>readCordPiece(b));}
 for(const f of [(p:any)=>p.damage=null,(p:any)=>p.damage=[],(p:any)=>p.damage.extra=1,(p:any)=>p.inheritedWear.faded=1]){const p=piece();f(p);rejects(()=>writeCordPiece(p,'site',1));}
 const z=piece();z.baseStrengthGf=0;assert.equal(readCordPiece(lot(writeCordPiece(z,'site',1))).baseStrengthGf,0);
});
test('fallen pith cannot hide fiber and cannot be reread as a strand or bundle',()=>{
 const p=writeCordPith({fiberDryMg:0,pithDryMg:1,waterMg:2},'floor',1);assert.equal(p.amount.value,3);
 rejects(()=>readCordBundle(lot(p)));rejects(()=>readCordPiece(lot(p)));rejects(()=>writeCordPith({fiberDryMg:1,pithDryMg:1,waterMg:0},'site',1));
});
test('deterministic 500-case serialization sweep preserves component and hidden strength',()=>{
 let seed=12345;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(let n=0;n<500;n++){
 const m={fiberDryMg:1+next()%100000,pithDryMg:next()%10000,waterMg:next()%100000};
 assert.deepEqual(readCordBundle(lot(writeCordBundle(m,'site',n%2))),{lotId:'lot',...m});
 const p:CoirPiece={...m,lotId:'piece',material:n%2?'coir_strand':'coir_rope',lengthMm:1+next()%10000,baseStrengthGf:next()%100000,damage:{sunMs:next()*100,shadeMs:next()*100,abrasions:next()%100}};
 const q=readCordPiece(lot(writeCordPiece(p,'site',n%2)));assert.equal(currentCordStrength(q),currentCordStrength(p));assert.deepEqual(q.damage,p.damage);
 }
});
console.log('PASS coir cord lots: '+groups+' groups.');
