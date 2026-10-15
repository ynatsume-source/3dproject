import {
 COIR_CORD_ASSUMPTION_ID, COIR_CORD_RULES as R, cordAssert as check, cordInteger as integer,
 cordId as id, cordShape as shape, cordCanonical as canonical, cordSum as sum, cordMass,
 type CoirMass, type CoirBundle, type CoirPiece,
} from './coir-cord-types';
import {currentCordStrength} from './coir-cord-damage';

export type CoirInput =
 | {operation:'dry'; bundle:CoirBundle; roofed:true}
 | {operation:'sieve'; bundle:CoirBundle}
 | {operation:'twist'; bundle:CoirBundle; requestedLengthMm:number}
 | {operation:'ply'; strands:[CoirPiece,CoirPiece,CoirPiece]};
export interface CoirContext {worldId:string;worldEpoch:string;runId:string;seed:number;clock:'world'|'island';openedAtMs:number}
export interface CoirInterval {
 confirmationId:string;worldId:string;worldEpoch:string;runId:string;clock:'world'|'island';
 fromMs:number;toMs:number;confirmedAtMs:number;
 kind:'host-confirmed-manual-work'|'host-confirmed-roofed-wait';
 actorId?:string;attendance?:'present';
}
export interface CoirState {
 schema:'prototype-coir-cord/1';binding:string;intervals:CoirInterval[];
}
const zero=():CoirMass=>({fiberDryMg:0,pithDryMg:0,waterMg:0});
const mass=(x:CoirMass):CoirMass=>({fiberDryMg:x.fiberDryMg,pithDryMg:x.pithDryMg,waterMg:x.waterMg});
const dry=(m:CoirMass)=>sum(m.fiberDryMg,m.pithDryMg);
const floor=(a:number,b:number,c:number)=>Number(BigInt(a)*BigInt(b)/BigInt(c));
const ceil=(a:number,b:number,c:number)=>Number((BigInt(a)*BigInt(b)+BigInt(c)-1n)/BigInt(c));
function validateBundle(b:CoirBundle) {
 check(shape(b,['lotId','fiberDryMg','pithDryMg','waterMg'])&&id(b.lotId),'invalid-bundle');
 cordMass(b);check(b.fiberDryMg>0,'fiber-required');
}
function validatePiece(p:CoirPiece) {
 check(shape(p,['lotId','material','lengthMm','fiberDryMg','pithDryMg','waterMg','baseStrengthGf','damage',...(p?.inheritedWear!==undefined?['inheritedWear']:[])])&&id(p.lotId),'invalid-piece');
 cordMass(p);check(p.fiberDryMg>0&&integer(p.lengthMm,1)&&integer(p.baseStrengthGf),'invalid-piece-values');
 check(shape(p.damage,['sunMs','shadeMs','abrasions'])&&Object.values(p.damage).every(x=>integer(x)),'invalid-damage');
 check(dry(p)>=p.lengthMm,'strand-too-little-material-per-mm');
 if(p.inheritedWear!==undefined)check(shape(p.inheritedWear,['faded','abraded'])&&Object.values(p.inheritedWear).every(x=>typeof x==='boolean'),'invalid-inherited-wear');
}
function jitter(seed:number) {
 let n=(seed^0x9e3779b9)>>>0;n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);n=(n^(n>>>15))>>>0;
 return R.jitterMinPpm+n%(R.jitterRangePpm+1);
}
/** Split by DRY amount, retaining rounding water in the product. The residual
 * stays at or below its original water/dry ratio and can be twisted again. */
function allocate(b:CoirMass,usedDry:number) {
 const D=dry(b),remainingDry=D-usedDry;
 const f=usedDry?ceil(b.fiberDryMg,usedDry,D):0,p=usedDry-f;
 const rw=floor(b.waterMg,remainingDry,D);
 return {product:{fiberDryMg:f,pithDryMg:p,waterMg:b.waterMg-rw},
  remaining:{fiberDryMg:b.fiberDryMg-f,pithDryMg:b.pithDryMg-p,waterMg:rw}};
}

/** Pure cumulative snapshots; the host reserves inputs and commits inventories
 * only once. Snapshots/hidden truth are NOT resident observations. */
export function createCoirCordModel(original:CoirInput,assumptionId:string,ctx:CoirContext) {
 check(assumptionId===COIR_CORD_ASSUMPTION_ID,'explicit-assumption-required');
 check(shape(ctx,['worldId','worldEpoch','runId','seed','clock','openedAtMs'])&&id(ctx.worldId)&&id(ctx.worldEpoch)&&id(ctx.runId)
  &&integer(ctx.seed)&&ctx.seed<=0xffffffff&&integer(ctx.openedAtMs),'invalid-context');
 const op=original?.operation;
 check(['dry','sieve','twist','ply'].includes(op),'invalid-operation');
 check(ctx.clock===(op==='dry'?'island':'world'),'wrong-clock');
 let duration=0,finalLength=0,minimumLength=0,strength=0;
 if(original.operation==='ply'){
  check(shape(original,['operation','strands'])&&Array.isArray(original.strands)&&original.strands.length===3,'three-strands-required');
  original.strands.forEach(validatePiece);
  check(original.strands.every(x=>x.material==='coir_strand')&&new Set(original.strands.map(x=>x.lotId)).size===3,'three-distinct-strands-required');
  minimumLength=Math.min(...original.strands.map(x=>x.lengthMm));
  const longest=Math.max(...original.strands.map(x=>x.lengthMm));
  check(minimumLength>=3,'strands-too-short');
  check(BigInt(longest)-BigInt(minimumLength)<=BigInt(Math.max(1,Math.floor(minimumLength/R.lengthToleranceDenominator))),'strands-not-similar-length');
  finalLength=floor(minimumLength,R.ropeLengthNumerator,R.ropeLengthDenominator);
  duration=sum(Number(BigInt(finalLength)*BigInt(R.plyMsPerMm)));
  strength=Number(BigInt(Math.min(...original.strands.map(currentCordStrength)))*BigInt(R.ropeStrengthNumerator)/BigInt(R.ropeStrengthDenominator));
  check(integer(strength),'strength-overflow');
  sum(...original.strands.flatMap(x=>[x.fiberDryMg,x.pithDryMg,x.waterMg]));
 } else {
  check(shape(original,op==='dry'?['operation','bundle','roofed']:op==='twist'?['operation','bundle','requestedLengthMm']:['operation','bundle']),'invalid-input');
  validateBundle(original.bundle);const b=original.bundle,D=dry(b);
  if(original.operation==='dry'){
   check(original.roofed===true,'roof-required');
   duration=b.waterMg>Math.floor(D/10)?R.dryIslandMs:0;
  }else if(original.operation==='sieve'){
   duration=b.pithDryMg>Math.floor(b.fiberDryMg/10)?ceil(b.fiberDryMg,R.sieveWorldMs,R.sieveReferenceFiberMg):0;
  }else{
   check(BigInt(b.waterMg)*10n<=BigInt(D),'wet-fiber-cannot-twist');
   check(BigInt(b.pithDryMg)*10n<=BigInt(b.fiberDryMg)*2n,'too-much-pith-sieve-first');
   check(integer(original.requestedLengthMm,1),'invalid-requested-length');
   check(BigInt(original.requestedLengthMm)*BigInt(R.dryMgPerStrandMm)<=BigInt(D),'insufficient-fiber');
   finalLength=original.requestedLengthMm;
   duration=Number(BigInt(finalLength)*BigInt(R.twistMsPerMm));check(integer(duration,1),'duration-overflow');
   const extra=10n*BigInt(b.pithDryMg)-BigInt(b.fiberDryMg);
   const penalty=extra>0n?Number(300000n*extra/BigInt(b.fiberDryMg)):0;
   strength=Number(BigInt(R.strandStrengthGf)*BigInt(1000000-penalty)*BigInt(jitter(ctx.seed))/1000000000000n);
  }
 }
 check(integer(duration),'duration-overflow');
 const input=structuredClone(original),context=structuredClone(ctx);
 const binding=canonical([COIR_CORD_ASSUMPTION_ID,R,input,context]);
 const stateOf=(intervals:CoirInterval[]):CoirState=>({schema:'prototype-coir-cord/1',binding,intervals:structuredClone(intervals)});
 function interval(r:unknown):asserts r is CoirInterval {
  check(shape(r,op==='dry'?['confirmationId','worldId','worldEpoch','runId','clock','fromMs','toMs','confirmedAtMs','kind']:
   ['confirmationId','worldId','worldEpoch','runId','clock','fromMs','toMs','confirmedAtMs','kind','actorId','attendance']),'invalid-interval');
  check(id(r.confirmationId)&&r.worldId===context.worldId&&r.worldEpoch===context.worldEpoch&&r.runId===context.runId&&r.clock===context.clock
   &&integer(r.fromMs)&&integer(r.toMs)&&integer(r.confirmedAtMs)&&r.fromMs>=context.openedAtMs&&r.toMs>r.fromMs&&r.confirmedAtMs>=r.toMs,'invalid-confirmation');
  check(op==='dry'?r.kind==='host-confirmed-roofed-wait':r.kind==='host-confirmed-manual-work'&&id(r.actorId)&&r.attendance==='present','unconfirmed-work-or-roof');
 }
 function rebuild(records:unknown) {
  check(Array.isArray(records),'invalid-history');let total=0,last=context.openedAtMs;const seen=new Set<string>();
  for(const r of records){interval(r);check(!seen.has(r.confirmationId)&&r.fromMs>=last,'overlap-or-duplicate');seen.add(r.confirmationId);total=sum(total,r.toMs-r.fromMs);last=r.toMs;}
  return {total,last};
 }
 function restore(value:unknown):CoirState {
  check(shape(value,['schema','binding','intervals'])&&value.schema==='prototype-coir-cord/1'&&value.binding===binding,'incompatible-save');
  rebuild(value.intervals);return stateOf(value.intervals);
 }
 function project(value:CoirState) {
  const state=restore(value),{total}=rebuild(state.intervals),work=Math.min(total,duration),completed=total>=duration;
  let product=zero(),remaining:CoirMass[]=[],fallenPith=zero(),releasedWaterMg=0,lengthMm=0;
  if(input.operation==='dry'){
   const b=input.bundle,target=Math.min(b.waterMg,Math.floor(dry(b)/10));
   releasedWaterMg=duration?floor(b.waterMg-target,work,duration):0;
   product={...mass(b),waterMg:b.waterMg-releasedWaterMg};
  }else if(input.operation==='sieve'){
   const b=input.bundle,removed=duration?floor(b.pithDryMg-Math.floor(b.fiberDryMg/10),work,duration):0;
   const rw=floor(b.waterMg,dry(b)-removed,dry(b));
   product={fiberDryMg:b.fiberDryMg,pithDryMg:b.pithDryMg-removed,waterMg:rw};
   fallenPith={fiberDryMg:0,pithDryMg:removed,waterMg:b.waterMg-rw};
  }else if(input.operation==='twist'){
   lengthMm=Math.min(finalLength,Math.floor(work/R.twistMsPerMm));
   const a=allocate(input.bundle,lengthMm*R.dryMgPerStrandMm);product=a.product;remaining=[a.remaining];
  }else{
   lengthMm=Math.min(finalLength,Math.floor(work/R.plyMsPerMm));
   const usedLength=floor(minimumLength,lengthMm,finalLength);
   for(const p of input.strands){
    const a=allocate(p,floor(dry(p),usedLength,p.lengthMm));
    product={fiberDryMg:sum(product.fiberDryMg,a.product.fiberDryMg),pithDryMg:sum(product.pithDryMg,a.product.pithDryMg),waterMg:sum(product.waterMg,a.product.waterMg)};
    remaining.push({...a.remaining});
   }
  }
  const productId=context.runId+':product';
  const piece:CoirPiece|null=(op==='twist'||op==='ply')&&completed?{
   ...product,lotId:productId,material:op==='twist'?'coir_strand':'coir_rope',lengthMm,baseStrengthGf:strength,
   damage:{sunMs:0,shadeMs:0,abrasions:0},
   ...(input.operation==='ply'?{inheritedWear:{faded:input.strands.some(x=>x.inheritedWear?.faded||x.damage.sunMs/R.yearIslandMs+x.damage.shadeMs/(10*R.yearIslandMs)>=1),abraded:input.strands.some(x=>x.inheritedWear?.abraded||x.damage.abrasions>0)}}:{})}:null;
  const leftovers=input.operation==='ply'?remaining.map((m,i)=>({
   ...input.strands[i],...m,lotId:context.runId+':remainder:'+i,lengthMm:input.strands[i].lengthMm-floor(minimumLength,lengthMm,finalLength),
   damage:{...input.strands[i].damage},...(input.strands[i].inheritedWear?{inheritedWear:{...input.strands[i].inheritedWear}}:{})})).filter(x=>x.lengthMm>0):null;
  return {status:completed?'completed' as const:'partial' as const,clock:context.clock,totalTimeMs:total,
   product,remaining,fallenPith,releasedWaterMg,lengthMm,piece,leftovers,
   bundle:(op==='dry'||op==='sieve')&&completed?{...product,lotId:productId}:null};
 }
 function observe(value:CoirState,measurement?:{kind:'host-confirmed-length-measurement';worldId:string;worldEpoch:string;runId:string;atMs:number}) {
  const p=project(value),{last}=rebuild(value.intervals);
  let text:string;
  if(op==='dry')text=BigInt(p.product.waterMg)*10n>BigInt(dry(p.product))?'繊維の束はまだ湿っている。':'繊維の束は乾いた手ざわりになった。';
  else if(op==='sieve')text=p.fallenPith.pithDryMg?'振るった束から、細かな髄が落ちている。':'目立つ髄はまだ落ちていない。';
  else if(!p.lengthMm)text=op==='twist'?'撚り糸はまだできていない。':'縄はまだできていない。';
  else text=(BigInt(p.product.pithDryMg)*10n>BigInt(p.product.fiberDryMg)?'毛羽の多い':'毛羽の少ない')+(op==='twist'?'細い撚り糸になっている。':'三本を合わせた太めの縄になっている。');

  const out:{text:string;lengthMm?:number}={text};
  if(measurement){
   check(shape(measurement,['kind','worldId','worldEpoch','runId','atMs'])&&measurement.kind==='host-confirmed-length-measurement'
    &&measurement.worldId===context.worldId&&measurement.worldEpoch===context.worldEpoch&&measurement.runId===context.runId
    &&integer(measurement.atMs)&&measurement.atMs>=last&&(op==='twist'||op==='ply'),'invalid-measurement');
   out.lengthMm=p.lengthMm;
  }
  return out;
 }
 return Object.freeze({
  start:()=>stateOf([]),restore,project,observe,
  commit(value:CoirState,receipt:CoirInterval):CoirState{
   const state=restore(value);interval(receipt);
   const old=state.intervals.find(x=>x.confirmationId===receipt.confirmationId);
   if(old){check(canonical(old)===canonical(receipt),'conflicting-replay');return state;}
   const records=[...state.intervals,receipt];rebuild(records);return stateOf(records);
  },
 });
}
