import {computeHuskSoak,splitSoakedHusks,HUSK_SOAK_ASSUMPTION as A} from '../src/science/prototypes/husk-soak';
import {createManualHuskAssumptionProfile,MANUAL_HUSK_ASSUMPTION as M} from '../src/science/prototypes/manual-husk-assumptions';
let s=11n;const r=(n:number)=>{s=(s*6364136223846793005n+1442695040888963407n)%(1n<<64n);return Number((s>>11n)%BigInt(Math.max(1,n)));};
let bad=0,cases=0,okAt:number[]=[];
for(let c=0;c<3000;c++){
 const count=1+r(8),mass=count*(300000+r(400000)),ppm=200000+r(200000);
 const lot:any={lotId:'h'+c,materialId:'coconut_husk',amount:{value:mass,unit:'mg'},location:'pool',quality:{count,water_ppm:ppm,ash_dry_ppm:30000,history_complete:1}};
 let prev=-1;
 for(const t of [0,29999,30000,r(432000000),432000000,432000000+r(1e9)]){
  const p=computeHuskSoak(lot,A.id,t);cases++;
  if(p.waterMg<prev)bad++;prev=p.waterMg; if(p.dryMg+p.initialWaterMg!==mass||p.waterMg!==p.initialWaterMg+p.drawnWaterMg)bad++;
  if(t>=432000000&&p.waterMg!==Math.max(2*p.dryMg,p.initialWaterMg))bad++;
  if(p.certifiedIslandMs===0)continue;
  const pcs=splitSoakedHusks(lot,A.id,t,{runId:'r',fromWorldMs:0,toWorldMs:1});
  if(pcs.length!==count||pcs.reduce((a,x)=>a+x.amountMg,0)!==mass+p.drawnWaterMg)bad++;
  const d=pcs.map(x=>x.quality.dry_mg),w=pcs.map(x=>x.quality.water_mg);if(Math.max(...d)-Math.min(...d)>1||Math.max(...w)-Math.min(...w)>1)bad++;
 }
 // earliest 30s quantum when every piece is beatable
 if(c<200){const pcsOk=(t:number)=>splitSoakedHusks(lot,A.id,t,{runId:'r',fromWorldMs:0,toWorldMs:1}).every(x=>{try{createManualHuskAssumptionProfile({dryMg:x.quality.dry_mg,waterMg:x.quality.water_mg},M.id);return true}catch{return false}});
  let lo=30000,hi=432000000; if(!pcsOk(hi)){bad++;continue;} while(hi-lo>30000){const mid=Math.floor((lo+hi)/2/30000)*30000;if(pcsOk(mid))hi=mid;else lo=mid;} okAt.push(hi/86400000);}
}
okAt.sort((a,b)=>a-b);console.log(JSON.stringify({cases,bad,beatableAfterIslandDays:{min:okAt[0].toFixed(2),median:okAt[okAt.length>>1].toFixed(2),max:okAt.at(-1)!.toFixed(2)}}));
