// Collect independently completed cases without losing failed-attempt provenance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [out,...inputs]=process.argv.slice(2);assert(out&&inputs.length);
const expected=['desktop-home-wide-day','desktop-home-wide-night','desktop-home-near-day','desktop-home-near-night','desktop-beach-day','desktop-beach-night','desktop-falling-day','desktop-falling-night','phone-home-near-day','phone-home-near-night'];
const reports=inputs.map(p=>({path:p,r:JSON.parse(fs.readFileSync(p,'utf8'))})),first=reports[0].r;
const measurements=[],attempts=[];fs.mkdirSync(out,{recursive:true});
for(const {path:p,r} of reports){
 for(const k of ['fixtureSha256','browser','sourceSha256'])assert.equal(r[k],first[k],k+' differs');
 attempts.push({file:path.basename(path.dirname(p))+'/report.json',sourceCommit:r.sourceCommit,harnessSha256:r.harnessSha256,failures:r.failures,acceptedCases:r.measurements.map(m=>m.id)});
 for(const row of r.measurements){
  assert.equal(row.errors.length,0,row.id+' has errors');assert(expected.includes(row.id));assert(!measurements.some(m=>m.id===row.id),'Duplicate '+row.id);
  measurements.push({...row,harnessSha256:r.harnessSha256});
  fs.copyFileSync(path.join(path.dirname(p),row.id+'.png'),path.join(out,row.id+'.png'));
 }
}
assert.equal(measurements.length,expected.length,'Missing cases');measurements.sort((a,b)=>expected.indexOf(a.id)-expected.indexOf(b.id));
const harnessSha256=createHash('sha256').update(JSON.stringify(measurements.map(m=>[m.id,m.harnessSha256]))).digest('hex');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({...first,harnessSha256,measurements,failures:[],attempts,note:'All required cases are complete. Raw attempt failures are retained in attempts; no unmeasured case is accepted.'},null,2)+'\n');
console.log('Collected',measurements.length,'complete cases');
