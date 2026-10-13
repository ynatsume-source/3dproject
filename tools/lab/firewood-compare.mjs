// Refuse relative performance claims when replay inputs / world behavior differ.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const [beforePath,afterPath,selectedCase] = process.argv.slice(2);
const [before,after] = [beforePath,afterPath].map(p=>JSON.parse(fs.readFileSync(p,'utf8')));
if(selectedCase) for(const report of [before,after]) report.measurements=report.measurements.filter(m=>m.id===selectedCase);
assert.equal(before.fixtureSha256,after.fixtureSha256,'Different fixture files');
assert.equal(before.harnessSha256,after.harnessSha256,'Different capture scripts');
assert.equal(before.browser,after.browser,'Different browser versions');
assert.equal(before.failures.length+after.failures.length,0,'Capture errors');
assert(before.measurements.length > 0,'No measurements to compare');
assert.equal(before.measurements.length,after.measurements.length,'Different case counts');
const rows=[];
for(const a of before.measurements) {
  const b=after.measurements.find(b=>b.id===a.id); assert(b,`Missing ${a.id}`);
  assert(a.timesMs.length > 0 && a.timesMs.every(Number.isFinite) && b.timesMs.every(Number.isFinite) && a.medianMs > 0 && b.medianMs > 0,'Invalid timing samples');
  for(const k of ['warmFrames','w','h','tier','time','pose','clockMs','camera','rotation','drawingBuffer','tiers','renderer','startupRandom','random','startStateSha256','endStateSha256','objects','meshes','state'])
    assert.deepEqual(a[k],b[k],`${a.id}: ${k} differs; comparison is invalid`);
  assert.equal(a.timesMs.length,b.timesMs.length,'Different sample counts');
  rows.push({case:a.id,relativeMedian:b.medianMs/a.medianMs,beforeMs:a.medianMs,afterMs:b.medianMs,
    beforeCalls:a.counts.at(-1).calls,afterCalls:b.counts.at(-1).calls,
    beforeTriangles:a.counts.at(-1).triangles,afterTriangles:b.counts.at(-1).triangles});
}
console.log(JSON.stringify({note:'Synchronous whole frame + gl.finish + 1px readback on SwiftShader; not real GPU FPS',rows},null,2));
