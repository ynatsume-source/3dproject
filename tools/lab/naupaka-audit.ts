import * as THREE from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {mulberry32,seedRandom,setStream,R} from '../../src/core/math';
const random=mulberry32(11),world=mulberry32(17);let draws=0,worldDraws=0;
Math.random=()=>{draws++;return random()};seedRandom(17);setStream(()=>{worldDraws++;return world()});
const {__plantGeos}=await import('../../src/ocean/shore');
const geos=__plantGeos(),sha=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const plants=Object.fromEntries(Object.entries(geos).map(([name,g])=>{
 g.computeBoundingBox();const a=Object.fromEntries(Object.entries(g.attributes).map(([k,v])=>[k,Array.from(v.array)]));
 return [name,{triangles:g.index!.count/3,vertices:g.attributes.position.count,sha256:sha([a,Array.from(g.index!.array)]),bounds:{min:g.boundingBox!.min.toArray(),max:g.boundingBox!.max.toArray()}}];
}));
const report={plants,mathRandomDraws:draws,worldRandomDraws:worldDraws,nextMath:Array.from({length:8},()=>Math.random()),nextWorld:Array.from({length:8},()=>R())};
fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
