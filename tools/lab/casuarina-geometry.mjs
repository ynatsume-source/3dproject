import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
const { __plantGeos }=await import('../../src/ocean/shore.ts');
const rows={};
for(const [name,g] of Object.entries(__plantGeos())){
 const h=createHash('sha256');for(const k of Object.keys(g.attributes).sort()){const a=g.attributes[k].array;assert([...a].every(Number.isFinite),name+': nonfinite '+k);h.update(k);h.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));}
 h.update(new Uint8Array(g.index.array.buffer));g.computeBoundingBox();
 rows[name]={triangles:g.index.count/3,vertices:g.attributes.position.count,sha256:h.digest('hex'),bounds:{min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()}};
}
fs.writeFileSync(process.argv[2],JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows));
