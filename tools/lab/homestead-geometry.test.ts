import assert from 'node:assert/strict';
import * as THREE from 'three';
import { youngBundles, softBoard, slattedBoard, softStone, workedWood } from '../../src/robots/homestead-look';
const leaves=new THREE.SphereGeometry(.42,8,6),board=new THREE.BoxGeometry(1.1,.05,.3),stone=new THREE.DodecahedronGeometry(.11),wood=new THREE.CylinderGeometry(.06,.07,1,7);
const slats=new THREE.BoxGeometry(1.5,.06,1.1);
const otherLeaves=[1,2,3].map(()=>new THREE.SphereGeometry(.3,8,6));
const stonePositions=Array.from(stone.getAttribute('position').array);
const random=Math.random;Math.random=()=>{throw Error('Display edit consumed world RNG')};
try{
 youngBundles(leaves,0,2);otherLeaves.forEach((g,i)=>youngBundles(g,i+1,2));slattedBoard(slats,1.5,.06,1.1,7);softBoard(board,1.1,.05,.3);softStone(stone);workedWood(wood);
 for(const g of [leaves,...otherLeaves,board,slats,stone,wood])for(const a of Object.values(g.attributes))assert(Array.from(a.array).every(Number.isFinite));
 assert.deepEqual(Array.from(stone.getAttribute('position').array),stonePositions);
 for(const g of [leaves,...otherLeaves,board,slats]) {
  const p=g.getAttribute('position'),ix=g.index!;let volume=0;
  for(let i=0;i<ix.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,ix.getX(i)),b=new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(p,ix.getX(i+2));volume+=a.dot(b.cross(c))/6}
  assert(volume>0,'Outward winding');
  const edges=new Map<string,number>();for(let i=0;i<ix.count;i+=3)for(let k=0;k<3;k++){const a=ix.getX(i+k),b=ix.getX(i+(k+1)%3),key=[Math.min(a,b),Math.max(a,b)].join(',');edges.set(key,(edges.get(key)||0)+1)}
  assert([...edges.values()].every(n=>n===2),'Closed manifold');
 }
 board.computeBoundingBox();assert(board.boundingBox!.max.x<=.550001&&board.boundingBox!.max.y<=.025001&&board.boundingBox!.max.z<=.150001);
 assert.equal([leaves,...otherLeaves].reduce((n,g)=>n+g.index!.count/3,0),2838);
 for(const g of [leaves,...otherLeaves]){const c=g.getAttribute('color'),n=g.getAttribute('normal');for(let i=0;i<n.count;i++)assert(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5,'Imported normals must stay normalized after scale');for(let i=0;i<c.count;i++){assert(Math.min(c.getX(i),c.getY(i),c.getZ(i))<.999,'Imported foliage must retain matte specular mask');assert(c.getY(i)*122/255>.38&&c.getY(i)*122/255<.47,'glTF linear colour must be adapted to island display space');}}assert.equal(board.index!.count/3,60);
 slats.computeBoundingBox();assert(slats.boundingBox!.max.x<=.750001&&slats.boundingBox!.max.y<=.030001&&slats.boundingBox!.max.z<=.550001);
 console.log('PASS: no RNG consumption, finite attributes, unchanged stone positions, outward closed bundles/boards, board dimensions.');
}finally{Math.random=random}
