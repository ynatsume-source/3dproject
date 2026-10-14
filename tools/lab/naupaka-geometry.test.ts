import assert from 'node:assert/strict';
import * as THREE from 'three';
import {seedRandom,getStream,setStream} from '../../src/core/math';
import {restoreNaupaka} from '../../src/ocean/naupaka-rosette';
import {historicalShrubGeo} from './fixtures/naupaka-09a99903';
seedRandom(45);
const reference=historicalShrubGeo(false), target=new THREE.BufferGeometry();
const random=Math.random,stream=getStream();
try {
 Math.random=()=>{throw Error('Restoration consumed shared Math.random')};
 setStream(()=>{throw Error('Restoration consumed shared world R')});
 assert.equal(restoreNaupaka(target),target,'Geometry object must be reused');
 for(const name of ['position','normal','aTint','aSway']) {
  const a=Array.from(target.getAttribute(name).array),b=Array.from(reference.getAttribute(name).array);
  assert(a.every(Number.isFinite),name+' must be finite');assert.deepEqual(a,b,name+' differs from historical rosette geometry');
 }
 assert.deepEqual(Array.from(target.index!.array),Array.from(reference.index!.array));
 assert.equal(target.index!.count/3,1828);
 console.log('PASS: historical low-naupaka attributes and indices reproduced exactly with seed 45; existing geometry reused; neither world R nor Math.random consumed.');
} finally {Math.random=random;setStream(stream);}
