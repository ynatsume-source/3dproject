// Sequential paired runs: avoid competing SwiftShader renderers during timing samples.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=process.argv[2];if(!root)throw Error('Output root required');
const cases=['phone-home-wide-day','desktop-home-wide-evening','phone-home-wide-evening','desktop-home-wide-night','phone-home-wide-night','desktop-home-near-day'];
for(const id of cases)for(const [variant,port] of [['before','5322'],['after','5323']]) {
 const out=`${root}/${variant}-${id}`;fs.mkdirSync(out,{recursive:true});const log=fs.openSync(out+'/run.log','w');
 console.log('START',variant,id);
 try{execFileSync(process.execPath,['tools/lab/homestead-capture.mjs'],{env:{...process.env,URL:`http://127.0.0.1:${port}`,FIXTURE:`${root}/before-state/fixture.json`,OUT:out,CASE:id,FLICKER:id==='desktop-home-near-day'?'1':'0'},stdio:['ignore',log,log]})}finally{fs.closeSync(log)}
 console.log('DONE',variant,id);
}
