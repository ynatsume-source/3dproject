// Full review of science 29521cb; no production-source changes.
// node --import tsx /path/review.mjs /absolute/29521cb-checkout > result.json
import { readFileSync } from 'node:fs';
import {run,metric,env,eq,wood,H,D,req,scienceStep,validateResult,woodEmc,fuelComp,asLot,sum} from './review-lib.mjs';
const out={target:globalThis.process.argv[2],checks:0,controlFailures:[],findings:{}};
const check=(name,ok,detail)=>{out.checks++;if(!ok)out.controlFailures.push({name,detail});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const action=at=>({at,action:'look',residentId:'lantern'});
const chemistry=r=>({produced:r.last.produced,released:r.last.released,drawn:r.last.drawn,heat:r.heat});

// A1: the contract accepts this temperature as known, but EMC becomes negative.
// This example starts with zero water; no long integration or small kindling is needed.
const cold=run(H,H,{lots:[wood({water_ppm:0})],environment:env({airTempC:-60,humidity:.95})});
out.findings.cold={inputWaterMg:0,...metric(cold),outputQuality:cold.last.produced[0]?.quality};
out.emcDomain=[];
for(const T of [-60,-59,-58,-55,-40,0,28,70,85])out.emcDomain.push({T,values:[.5,.75,.95,1].map(h=>({h,emc:woodEmc(T,h)}))});

// A2: remove only wind from an otherwise complete record; compare with actual zero and known wind.
out.findings.missingWind=[];
for(const wind of [undefined,0,2,20]) {
 const r=run(40*D,D,{environment:env({windMs:wind})},[action(39*D)]);
 out.findings.missingWind.push({wind:wind??'missing',...metric(r),history:r.last.produced[0]?.quality.history_complete,observations:r.obs});
}

// Original table 4-2, with rounded displayed temperatures, versus the implemented equation.
const handbook=JSON.parse(readFileSync(new URL('./data/science/evidence/wood-handbook-2021.json',import.meta.url),'utf8'));
let maxError=0,maxCase;
for(const row of handbook.emcTable)for(let i=0;i<row.percentDry.length;i++){
 const calculated=100*woodEmc(row.tempC,handbook.relativeHumidity[i]),error=Math.abs(calculated-row.percentDry[i]);
 if(error>maxError){maxError=error;maxCase={tempC:row.tempC,rh:handbook.relativeHumidity[i],calculated,table:row.percentDry[i]};}
 check('handbook table within displayed precision',error<.11,{tempC:row.tempC,i,error});
}
const hh=(T,h)=>{const W=349+T*(1.29+.0135*T),K=.805+T*(.000736-.00000273*T),K1=6.27-T*(.00938+.000303*T),K2=1.91+T*(.0407-.000293*T),x=K*h;return 18/W*(x/(1-x)+(K1*x+2*K1*K2*x*x)/(1+K1*x+K1*K2*x*x));};
out.handbook={tableCases:handbook.emcTable.length*handbook.relativeHumidity.length,maxErrorPercentagePoints:maxError,maxCase,at28C75:{dryBasis:woodEmc(28,.75),wetBasis:woodEmc(28,.75)/(1+woodEmc(28,.75))},atSaturation:{implementation:woodEmc(28,1),unclampedSource:hh(28,1)}};

// No rain: an independent closed-form solution for the first-order approach (constant 28 C, 2 m/s).
const shade=run(120*D,D);
const targetWater=2200000*hh(28,.75),evap=Math.floor((1800000-targetWater)*(1-Math.exp(-4))+1e-6);
check('120-day closed form',sum(shade.last.released)===evap&&shade.heat===Math.floor(evap*2.43),metric(shade));
out.seasoning=metric(shade);

// Rain, 30 s boundaries and off-grid requests. Report errors; do not invent an accepted tolerance.
out.partitions=[];
for(const piece of [60,5]) {
 let reference;
 for(const chunk of [H,30000,17000,1000]) {
  const r=run(D,chunk,{lots:[wood({water_ppm:150000,piece_mm:piece})],equipment:[eq({covered:0,sunExposure:1})],environment:env({airTempC:30,humidity:.6,windMs:3,rainMmH:8})});
  if(chunk===H)reference=r;
  if(chunk===30000)check('30 s grid equality in rain',same(chemistry(r),chemistry(reference))&&same(r.last.state,reference.last.state));
  check('rain supply and integer heat bounds',sum(r.last.drawn)<=11520000&&r.heat===Math.floor(sum(r.last.released)*2.43)&&!r.violations.length);
  out.partitions.push({piece,chunk,...metric(r)});
 }
}

// Returned lots, not fresh fixtures: alternate wetting and drying, including concentrated ash and tiny lots.
out.reuse={runs:0,errors:[]};
for(const mg of [13,1000,4000001,10000000])for(const ash of [0,10000,900000]){
 let lot=wood({water_ppm:150000,ash_dry_ppm:ash,piece_mm:5},mg),initial=fuelComp(lot);
 for(let i=0;i<12;i++){
  const rainy=i%2===0,r=run(H,H,{lots:[lot],equipment:[eq({covered:rainy?0:1})],environment:env({humidity:rainy?.95:.4,rainMmH:rainy?8:0})});
  const p=r.last.produced[0],next=p?asLot(p):null,c=next?fuelComp(next):null;
  const balanced=sum(r.last.consumed)+sum(r.last.drawn)===sum(r.last.produced)+sum(r.last.released);
  const expectedWater=(fuelComp(lot).water??0)+sum(r.last.drawn)-sum(r.last.released);
  out.reuse.runs++;
  if(!c||typeof c==='string'||c.wood_dry!==initial.wood_dry||c.ash!==initial.ash||(c.water??0)!==expectedWater||!balanced||r.violations.length)out.reuse.errors.push({mg,ash,i,...metric(r)});
  if(!next)break;lot=next;
 }
}
check('dry/rain reuse preserves dry wood, ash and integer water',!out.reuse.errors.length,out.reuse.errors.slice(0,2));

// Reads do not alter the physical state; pause/shutdown do not settle; loss occurs at interval.to.
const reads=Array.from({length:24},(_,i)=>action(i*H+17000));
const noLook=run(D,H),look=run(D,H,{},reads);
check('look does not change state or settlement',same(chemistry(noLook),chemistry(look))&&same(noLook.last.state,look.last.state));
const first=scienceStep(req(0,H));
const lostQ=req(H,2*H,first.state,{equipment:[],stop:'equipment-lost'}),lost=scienceStep(lostQ);
const op=scienceStep(req(H,2*H,first.state,{stop:'operator'}));
check('loss retains elapsed interval and same settlement',lost.simulated.to===2*H&&same([lost.produced,lost.released,lost.energy],[op.produced,op.released,op.energy])&&!validateResult(lostQ,lost).length);
const origin=1234;
const relative=scienceStep(req(origin,origin+2*H,null,{stop:'operator'}));
const part=scienceStep(req(origin+H,origin+2*H,scienceStep(req(origin,origin+H)).state,{stop:'operator'}));
check('run-relative grid and JSON serializability',same(relative.produced,part.produced)&&same(relative.released,part.released)&&same(relative.state,JSON.parse(JSON.stringify(part.state))));
for(const stop of ['shutdown','world-pause']){
 const r=scienceStep(req(0,H,null,{stop}));
 const resumed=scienceStep(req(H,2*H,JSON.parse(JSON.stringify(r.state)),{stop:'operator'}));
 const uninterrupted=scienceStep(req(0,2*H,null,{stop:'operator'}));
 check('pause without settlement, resume without loss',r.status==='running'&&!r.consumed.length&&!r.produced.length&&same(resumed.produced,uninterrupted.produced)&&same(resumed.released,uninterrupted.released));
}
const gap=scienceStep(req(H,2*H,first.state,{environment:env({source:'unknown'}),actions:[action(H+17000)]}));
const recovered=scienceStep(req(2*H,3*H,gap.state,{stop:'operator',actions:[action(2*H+17000)]}));
check('unknown gap suppresses later observations and history',!gap.observations.length&&!recovered.observations.length&&recovered.produced[0].quality.history_complete===0);
const noRain=env();delete noRain.rainMmH;
const open=run(H,H,{equipment:[eq({covered:0})],environment:noRain}),roof=run(H,H,{environment:noRain});
check('rain omission is unknown only for open stacks',open.last.produced[0].quality.history_complete===0&&!sum(open.last.released)&&roof.last.produced[0].quality.history_complete===1);
const reorder=scienceStep(req(H,2*H,first.state,{equipment:[{...eq(),params:{sunExposure:0,covered:1}}]}));
check('equipment param key ordering is immaterial',reorder.status==='running');
const failures=[{contract:'0.1.0'},{processVersion:'99.0'},{catalogVersion:'bad'},{state:{schema:'civ-sci.firewood-dry/0',data:{}}},{equipment:[]},{stop:'equipment-lost',equipment:[]}];
for(const override of failures){const q=req(0,H,null,override),r=scienceStep(q);check('refusal has no flows and passes validator',r.status==='failed'&&!r.consumed.length&&!r.produced.length&&!r.energy.length&&!validateResult(q,r).length,override);}
out.roundingNote='Float ppm preserves integer mg via fuelComp Math.round; no extra ppm quantization.';
console.log(JSON.stringify(out,null,2));
if(out.controlFailures.length)globalThis.process.exitCode=1;
