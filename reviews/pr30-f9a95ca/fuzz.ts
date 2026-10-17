// Independent property check of settleLampWick / wickCanLight (place under <checkout>/scratch-review/).
import {settleLampWick,wickCanLight} from '../src/science/step/lamp-wick';
let s=5n;const r=(n:number)=>{s=(s*6364136223846793005n+1442695040888963407n)%(1n<<64n);return Number((s>>11n)%BigInt(Math.max(1,n)));};
let bad=0,n=0,edge=0;
for(let i=0;i<200000;i++){
 const f=1+r(r(2)?100000:50),p=r(f),d=f+p,w=r(2)?r(Math.floor(d/10)+2):r(d);
 const light=wickCanLight({fiberDryMg:f,pithDryMg:p,waterMg:w}); if(light!==(10*w<=d))bad++; if(10*w===d)edge++;
 const b=r(d+1),t=r(d-b+1);const x=settleLampWick({fiberDryMg:f,pithDryMg:p,waterMg:w},b,t);n++;
 const parts=[x.burned,x.trimmed,x.left];
 if(parts.some(q=>q.fiberDryMg<0||q.pithDryMg<0||q.waterMg<0))bad++;
 if(parts.reduce((a,q)=>a+q.fiberDryMg,0)!==f||parts.reduce((a,q)=>a+q.pithDryMg,0)!==p||parts.reduce((a,q)=>a+q.waterMg,0)!==w)bad++;
 if(x.burned.fiberDryMg+x.burned.pithDryMg!==b||x.trimmed.fiberDryMg+x.trimmed.pithDryMg!==t)bad++;
 const ld=x.left.fiberDryMg+x.left.pithDryMg; if(ld>0&&BigInt(x.left.waterMg)*BigInt(d)>BigInt(w)*BigInt(ld))bad++;
 if(ld===0&&x.left.waterMg>0)bad++;
}
console.log(JSON.stringify({cases:n,edge10pct:edge,bad}));
