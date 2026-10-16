import type {LotView, ScienceStepResult} from './science-contract';
import {cordInteger, cordId, type CoirMass, type CoirBundle, type CoirPiece} from '../science/prototypes/coir-cord-types';
type Produced = ScienceStepResult['produced'][number];
const BUNDLE = ['fiber_dry_mg','attached_pith_dry_mg','water_mg','history_complete'];
const PIECE = [...BUNDLE,'length_mm','base_strength_gf','sun_ms','shade_ms','abrasions','inherited_faded','inherited_abraded','cord_codec'];
/** World-only serialization. These values are never a resident-facing view. */
export class CordLotError extends Error {
 constructor(readonly code:string) { super('The cord material record is not usable.'); this.name='CordLotError'; }
}
function check(value:unknown,code:string):asserts value {if(!value)throw new CordLotError(code);}
function record(value:unknown):value is Record<string,unknown> {return !!value&&typeof value==='object'&&!Array.isArray(value);}
function shape(value:unknown,keys:readonly string[]):value is Record<string,unknown> {
 if(!record(value))return false;const actual=Object.keys(value);
 return actual.length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
}
function mass(value:CoirMass):number {
 check(record(value)&&cordInteger(value.fiberDryMg)&&cordInteger(value.pithDryMg)&&cordInteger(value.waterMg),'invalid-mass');
 const total=BigInt(value.fiberDryMg)+BigInt(value.pithDryMg)+BigInt(value.waterMg);
 check(total>0n&&total<=BigInt(Number.MAX_SAFE_INTEGER),'invalid-mass-total');return Number(total);
}
function history(value:unknown):asserts value is 0|1 {check(value===0||value===1,'invalid-history');}
function lot(l:LotView,materialIds:readonly string[]):Record<string,number> {
 check(record(l)&&cordId(l.lotId)&&cordId(l.location)&&materialIds.includes(l.materialId),'invalid-material');
 check(record(l.amount)&&l.amount.unit==='mg'&&cordInteger(l.amount.value,1),'invalid-amount');
 check(record(l.quality),'missing-quality');return l.quality;
}
function checkedMass(l:LotView,q:Record<string,number>):CoirMass {
 const m={fiberDryMg:q.fiber_dry_mg,pithDryMg:q.attached_pith_dry_mg,waterMg:q.water_mg};
 check(mass(m)===l.amount.value,'mass-does-not-close');return m;
}
function destination(location:string,flag:number):void {check(cordId(location),'invalid-location');history(flag);}
export function readCordHistory(l:LotView):0|1 {
 check(record(l)&&record(l.quality)&&Object.hasOwn(l.quality,'history_complete'),'missing-history');
 const h=l.quality.history_complete;history(h);return h;
}
export function readCordBundle(l:LotView):CoirBundle {
 const q=lot(l,['coir_fiber_bundle']);
 const legacy=shape(q,[...BUNDLE,'fiber_water_mg','attached_pith_water_mg']);
 const canonical=shape(q,[...BUNDLE,'codec_version'])&&q.codec_version===1;
 check(legacy||canonical,'unsupported-bundle-codec');readCordHistory(l);
 const m=checkedMass(l,q);check(m.fiberDryMg>0,'fiber-required');
 if(legacy){
  check(cordInteger(q.fiber_water_mg)&&cordInteger(q.attached_pith_water_mg),'invalid-component-water');
  check(BigInt(q.fiber_water_mg)+BigInt(q.attached_pith_water_mg)===BigInt(m.waterMg),'component-water-does-not-close');
 }
 return {lotId:l.lotId,...m};
}
function piece(p:CoirPiece):void {
 check(record(p)&&cordId(p.lotId)&&['coir_strand','coir_rope'].includes(p.material),'invalid-piece');mass(p);
 check(p.fiberDryMg>0&&cordInteger(p.lengthMm,1)&&cordInteger(p.baseStrengthGf),'invalid-piece-values');
 check(shape(p.damage,['sunMs','shadeMs','abrasions'])&&Object.values(p.damage).every(x=>cordInteger(x)),'invalid-damage');
 if(p.inheritedWear!==undefined)check(shape(p.inheritedWear,['faded','abraded'])
  &&typeof p.inheritedWear.faded==='boolean'&&typeof p.inheritedWear.abraded==='boolean','invalid-inherited-wear');
}
export function readCordPiece(l:LotView):CoirPiece {
 const q=lot(l,['coir_strand','coir_rope']);check(shape(q,PIECE)&&q.cord_codec===1,'unsupported-piece-codec');readCordHistory(l);
 check((q.inherited_faded===0||q.inherited_faded===1)&&(q.inherited_abraded===0||q.inherited_abraded===1),'invalid-inherited-wear');
 const p:CoirPiece={lotId:l.lotId,material:l.materialId as CoirPiece['material'],...checkedMass(l,q),lengthMm:q.length_mm,baseStrengthGf:q.base_strength_gf,
  damage:{sunMs:q.sun_ms,shadeMs:q.shade_ms,abrasions:q.abrasions},inheritedWear:{faded:q.inherited_faded===1,abraded:q.inherited_abraded===1}};
 piece(p);return p;
}
export function writeCordBundle(m:CoirMass,location:string,flag:number):Produced {
 destination(location,flag);const total=mass(m);check(m.fiberDryMg>0,'fiber-required');
 return {materialId:'coir_fiber_bundle',amount:{value:total,unit:'mg'},into:location,
  quality:{fiber_dry_mg:m.fiberDryMg,attached_pith_dry_mg:m.pithDryMg,water_mg:m.waterMg,history_complete:flag,codec_version:1}};
}
export function writeCordPiece(p:CoirPiece,location:string,flag:number):Produced {
 destination(location,flag);piece(p);
 return {materialId:p.material,amount:{value:mass(p),unit:'mg'},into:location,
  quality:{fiber_dry_mg:p.fiberDryMg,attached_pith_dry_mg:p.pithDryMg,water_mg:p.waterMg,length_mm:p.lengthMm,base_strength_gf:p.baseStrengthGf,
   sun_ms:p.damage.sunMs,shade_ms:p.damage.shadeMs,abrasions:p.damage.abrasions,inherited_faded:p.inheritedWear?.faded?1:0,inherited_abraded:p.inheritedWear?.abraded?1:0,history_complete:flag,cord_codec:1}};
}
export function writeCordPith(m:CoirMass,location:string,flag:number):Produced {
 destination(location,flag);const total=mass(m);check(m.fiberDryMg===0&&m.pithDryMg>0,'pith-only-required');
 return {materialId:'coir_pith',amount:{value:total,unit:'mg'},into:location,quality:{pith_dry_mg:m.pithDryMg,water_mg:m.waterMg,history_complete:flag,codec_version:1}};
}
