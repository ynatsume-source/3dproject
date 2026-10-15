import type {CoirContext,CoirInterval} from './coir-cord';
import type {CoirPiece} from './coir-cord-types';
import {currentIntegerCordStrength} from './coir-cord-damage';
import {INTEGER_HALF_LIFE_POLICY_ID} from './integer-half-life';
import {SAIL_RAFT_ID,SAIL_RULES as R,choose,check,uint,shape,id,canonical,copy,sum,mulDiv,ceilDiv,
 qualityPpm,validateMat,validateMast,sailStrength,type PlantMass,type SailMat,type BambooMast} from './sail-raft-rules';
export interface RaftHull {lotId:string;material:'raft';dryMg:number;waterMg:number}
export interface SailRig {lotId:string;material:'sail_raft';hull:RaftHull;mat:SailMat;mast:BambooMast;cords:CoirPiece[]}
export type SailManufactureInput=
 | {operation:'harvest';source:PlantMass}
 | {operation:'dry';source:PlantMass;roofed:true}
 | {operation:'split';source:PlantMass}
 | {operation:'weave';source:PlantMass;requestedAreaCm2:number}
 | {operation:'mast';source:PlantMass}
 | {operation:'rig';hull:RaftHull;mat:SailMat;mast:BambooMast;cords:CoirPiece[]};
export interface SailManufactureState {schema:'prototype-sail-manufacture/1';binding:string;intervals:CoirInterval[]}
export function validateRig(r:SailRig){
 check(shape(r,['lotId','material','hull','mat','mast','cords'])&&id(r.lotId)&&r.material==='sail_raft','invalid-rig');
 validateParts(r.hull,r.mat,r.mast,r.cords);
}
function validateParts(h:RaftHull,m:SailMat,b:BambooMast,cords:CoirPiece[]){
 check(shape(h,['lotId','material','dryMg','waterMg'])&&id(h.lotId)&&h.material==='raft'&&uint(h.dryMg,1)&&uint(h.waterMg),'invalid-raft');
 sum(h.dryMg,h.waterMg);validateMat(m);validateMast(b);
 check(!m.torn&&!b.broken&&sailStrength(m)>0,'broken-rig-part');
 check(Array.isArray(cords)&&cords.length>0,'cords-required');
 for(const p of cords){
  currentIntegerCordStrength(p);
  check(p.lengthMm>=2&&BigInt(p.fiberDryMg)*BigInt(Math.floor(p.lengthMm/2))/BigInt(p.lengthMm)>0n,'unsplittable-rig-cord');
 }
 check(sum(...cords.map(p=>p.lengthMm))>=R.minRigCordMm,'insufficient-rig-cord');
 const ids=[h.lotId,m.lotId,b.lotId,...cords.map(p=>p.lotId)];
 check(new Set(ids).size===ids.length,'duplicate-rig-part');
 sum(h.dryMg,h.waterMg,m.dryMg,m.waterMg,b.dryMg,b.waterMg,...cords.flatMap(p=>[p.fiberDryMg,p.pithDryMg,p.waterMg]));
}
function source(p:PlantMass){
 check(shape(p,['lotId','material','dryMg','waterMg',...(p?.lengthMm===undefined?[]:['lengthMm'])])
 &&id(p.lotId)&&uint(p.dryMg,1)&&uint(p.waterMg),'invalid-plant-material');
 sum(p.dryMg,p.waterMg);
}
export function createSailManufacturingModel(original:SailManufactureInput,assumptionId:string,ctx:CoirContext){
 choose(assumptionId);
 check(shape(ctx,['worldId','worldEpoch','runId','seed','clock','openedAtMs'])&&id(ctx.worldId)&&id(ctx.worldEpoch)&&id(ctx.runId)
 &&uint(ctx.seed)&&ctx.seed<=0xffffffff&&uint(ctx.openedAtMs),'invalid-context');
 const op=original?.operation;check(['harvest','dry','split','weave','mast','rig'].includes(op),'unknown-operation');
 check(ctx.clock===(op==='dry'?'island':'world'),'wrong-clock');
 let duration=0,mastDry=0,mastWater=0,strength=0;
 if(original.operation==='rig'){
  check(shape(original,['operation','hull','mat','mast','cords']),'invalid-rig-input');
  validateParts(original.hull,original.mat,original.mast,original.cords);duration=R.rigMs;
 }else{
  check(shape(original,op==='dry'?['operation','source','roofed']:op==='weave'?['operation','source','requestedAreaCm2']:['operation','source']),'invalid-stage-input');
  source(original.source);const s=original.source;
  if(original.operation==='harvest'){
   check(s.material==='pandanus_standing_leaves'&&s.lengthMm===undefined,'standing-leaf-source-required');
   duration=ceilDiv(s.dryMg,R.harvestMs,R.leafReferenceDryMg);
  }else if(original.operation==='dry'){
   check(s.material==='pandanus_leaves'&&s.lengthMm===undefined&&original.roofed===true,'roofed-leaves-required');
   duration=s.waterMg>Math.floor(s.dryMg/5)?R.roofDryMs:0;
  }else if(original.operation==='split'){
   check(s.material==='pandanus_leaves'&&s.lengthMm===undefined&&BigInt(s.waterMg)*5n<=BigInt(s.dryMg),'dry-leaves-required');
   duration=ceilDiv(s.dryMg,R.splitMs,R.leafReferenceDryMg);
  }else if(original.operation==='weave'){
   check(s.material==='pandanus_strips'&&s.lengthMm===undefined&&BigInt(s.waterMg)*5n<=BigInt(s.dryMg),'dry-strips-required');
   check(uint(original.requestedAreaCm2,1)&&BigInt(original.requestedAreaCm2)*BigInt(R.weaveDryMgPerCm2)<=BigInt(s.dryMg),'insufficient-weave-material');
   duration=mulDiv(original.requestedAreaCm2,R.weaveMsPerCm2,1);
   strength=mulDiv(original.requestedAreaCm2,R.sailGfPerCm2*qualityPpm(ctx.seed,ctx.runId,s.lotId,'sail-weave-quality',850000,300000),1000000);
  }else{
   check(s.material==='bamboo'&&uint(s.lengthMm,R.mastMm),'long-bamboo-required');
   mastDry=mulDiv(s.dryMg,R.mastMm,s.lengthMm!);mastWater=mulDiv(s.waterMg,R.mastMm,s.lengthMm!);
   check(mastDry>=R.mastMinDryMg,'insufficient-mast-dry-mass');
   duration=R.mastMs;strength=mulDiv(R.mastBaseGf,qualityPpm(ctx.seed,ctx.runId,s.lotId,'mast-cut-quality',900000,200000),1000000);
  }
 }
 check(uint(duration),'invalid-duration');
 const input=copy(original),c=copy(ctx),binding=canonical([SAIL_RAFT_ID,R,INTEGER_HALF_LIFE_POLICY_ID,input,c]);
 const save=(intervals:CoirInterval[]):SailManufactureState=>({schema:'prototype-sail-manufacture/1',binding,intervals:copy(intervals)});
 function receipts(records:unknown){
  check(Array.isArray(records),'invalid-work-history');let total=0,last=c.openedAtMs;const ids=new Set<string>();
  for(const r of records){
   check(shape(r,op==='dry'?['confirmationId','worldId','worldEpoch','runId','clock','fromMs','toMs','confirmedAtMs','kind']:
   ['confirmationId','worldId','worldEpoch','runId','clock','fromMs','toMs','confirmedAtMs','kind','actorId','attendance']),'invalid-confirmation');
   check(id(r.confirmationId)&&!ids.has(r.confirmationId)&&r.worldId===c.worldId&&r.worldEpoch===c.worldEpoch&&r.runId===c.runId&&r.clock===c.clock
   &&uint(r.fromMs)&&uint(r.toMs)&&uint(r.confirmedAtMs)&&r.fromMs>=last&&r.toMs>r.fromMs&&r.confirmedAtMs>=r.toMs,'invalid-confirmed-work');
   check(op==='dry'?r.kind==='host-confirmed-roofed-wait':r.kind==='host-confirmed-manual-work'&&id(r.actorId)&&r.attendance==='present','unconfirmed-attendance-or-roof');
   ids.add(r.confirmationId);total=sum(total,r.toMs-r.fromMs);last=r.toMs;
  }return total;
 }
 function restore(v:unknown):SailManufactureState{
  check(shape(v,['schema','binding','intervals'])&&v.schema==='prototype-sail-manufacture/1'&&v.binding===binding,'unsupported-manufacture-save');
  receipts(v.intervals);return save(v.intervals);
 }
 function project(v:SailManufactureState){
  const state=restore(v),total=receipts(state.intervals),work=Math.min(total,duration),done=total>=duration;
  let material:PlantMass|SailMat|BambooMast|null=null,remaining:PlantMass|null=null,scrap:PlantMass|null=null,releasedWaterMg=0,areaCm2=0;
  let product={dryMg:0,waterMg:0},rig:SailRig|null=null;
  const lotId=c.runId+':product';
  if(input.operation==='rig'){
   if(done)rig={lotId,material:'sail_raft',hull:copy(input.hull),mat:copy(input.mat),mast:copy(input.mast),cords:copy(input.cords)};
  }else{
   const s=input.source;
   if(input.operation==='harvest'){
    const d=duration?mulDiv(s.dryMg,work,duration):s.dryMg,w=s.waterMg-mulDiv(s.waterMg,s.dryMg-d,s.dryMg);
    product={dryMg:d,waterMg:w};remaining={...s,dryMg:s.dryMg-d,waterMg:s.waterMg-w};
    if(done)material={lotId,material:'pandanus_leaves',...product};
   }else if(input.operation==='dry'){
    releasedWaterMg=duration?mulDiv(s.waterMg-Math.floor(s.dryMg/5),work,duration):0;
    product={dryMg:s.dryMg,waterMg:s.waterMg-releasedWaterMg};if(done)material={lotId,material:'pandanus_leaves',...product};
   }else if(input.operation==='split'){
    const d=mulDiv(Math.floor(s.dryMg/10),work,duration),w=mulDiv(s.waterMg,d,s.dryMg);
    product={dryMg:s.dryMg-d,waterMg:s.waterMg-w};scrap={lotId:c.runId+':scrap',material:'pandanus_leaf_scrap',dryMg:d,waterMg:w};
    if(done)material={lotId,material:'pandanus_strips',...product};
   }else if(input.operation==='weave'){
    areaCm2=Math.min(input.requestedAreaCm2,Math.floor(work/R.weaveMsPerCm2));
    const d=areaCm2*R.weaveDryMgPerCm2,w=s.waterMg-mulDiv(s.waterMg,s.dryMg-d,s.dryMg);
    product={dryMg:d,waterMg:w};remaining={...s,dryMg:s.dryMg-d,waterMg:s.waterMg-w};
    if(done)material={lotId,material:'sail_mat',...product,areaCm2,baseStrengthGf:strength,torn:false,damage:{sunMs:0,shadeMs:0,rainMs:0}};
   }else{
    if(done){
     product={dryMg:mastDry,waterMg:mastWater};
     remaining={...s,lotId:c.runId+':bamboo-remainder',dryMg:s.dryMg-mastDry,waterMg:s.waterMg-mastWater,lengthMm:s.lengthMm!-R.mastMm};
     material={lotId,material:'bamboo_mast',...product,lengthMm:R.mastMm,baseStrengthGf:strength,broken:false};
    }else remaining=copy(s);
   }
  }
  return {status:done?'completed' as const:'partial' as const,totalWorkMs:total,requiredMs:duration,product,remaining,scrap,releasedWaterMg,areaCm2,material,rig};
 }
 return Object.freeze({start:()=>save([]),restore,project,
  commit(v:SailManufactureState,r:CoirInterval){
   const state=restore(v),old=state.intervals.find(x=>x.confirmationId===r.confirmationId);
   if(old){check(canonical(old)===canonical(r),'conflicting-work-replay');return state;}
   receipts([...state.intervals,r]);return save([...state.intervals,r]);
  },
  observe(v:SailManufactureState):string[]{
   const p=project(v);return [p.status==='completed'?({harvest:'葉を取り終えた。',dry:'葉は乾いて、しなやかになった。',split:'葉を細く裂いた。とげと葉脈の屑が残っている。',weave:'編んだむしろが広がっている。',mast:'竹のマストを切り出した。',rig:'筏にマストとむしろ帆を据え、縄で結んだ。'}[op]):'手元の材料は、まだ作業の途中だ。'];
  }});
}
