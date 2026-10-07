import { pathToFileURL } from 'node:url';
export const root=globalThis.process.argv[2] ?? '/tmp/firewood-review-29521cb';
const load=p=>import(pathToFileURL(`${root}/${p}`));
export const { scienceStep }=await load('src/science/step/index.ts');
export const { FIREWOOD_DRY_PROCESS: process, woodEmc }=await load('src/science/step/firewood.ts');
export const { fuelComp }=await load('src/science/step/wood-fire.ts');
export const { validateResult }=await load('src/science/step/validate.ts');
export const H=3600000,D=24*H;
export const wood=(quality={},mg=4000000)=>({lotId:'lot:wood',materialId:'firewood',amount:{value:mg,unit:'mg'},location:'stack',quality:{water_ppm:450000,...quality}});
export const env=(over={})=>({source:'record',sampleId:'e',effectiveAt:0,airTempC:28,humidity:.75,windMs:2,rainMmH:0,...over});
export const eq=(over={})=>({equipmentId:'eq:stack',kind:'firewood_stack',condition:1,params:{covered:1,sunExposure:0,...over}});
export const req=(from,to,state=null,over={})=>({contract:'0.2.0',requestId:`r:${from}`,runId:'run:wood',world:{worldId:'w',worldEpoch:'e',worldVersion:1},...process,catalogVersion:'civ-sci-test-2',seed:1,interval:{from,to},state,lots:[wood()],energy:[],equipment:[eq()],environment:env(),actions:[],...over});
export const sum=xs=>(xs??[]).reduce((s,x)=>s+x.amount.value,0);
export const asLot=p=>({lotId:'lot:returned',materialId:p.materialId,amount:p.amount,quality:p.quality,location:p.into});
export function run(duration,chunk=H,over={},actions=[]) {let state=null,last,heat=0;const obs=[],violations=[];for(let t=0;t<duration;t+=chunk){const to=Math.min(t+chunk,duration),q=req(t,to,state,{...over,...(to===duration?{stop:'operator'}:{}),actions:actions.filter(a=>a.at>=t&&a.at<to)});last=scienceStep(q);violations.push(...validateResult(q,last));state=JSON.parse(JSON.stringify(last.state));heat+=last.energy.reduce((s,e)=>s+e.usedJ,0);obs.push(...last.observations);if(!['running','needs-input'].includes(last.status))break;}return {last,heat,obs,violations};}
export const metric=r=>({status:r.last.status,mass:r.last.produced[0]?.amount.value,ppm:r.last.produced[0]?.quality.water_ppm,evap:sum(r.last.released),rain:sum(r.last.drawn),heat:r.heat,violations:r.violations,comp:r.last.produced[0]?fuelComp(asLot(r.last.produced[0])):null,diag:r.last.diagnostics});
