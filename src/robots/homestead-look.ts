// Display-only study: edit existing geometry containers. No Object3D/Material/Geometry
// construction here: Three UUID construction consumes the world's Math.random stream.
import * as THREE from 'three';

function replace(g: THREE.BufferGeometry, p: number[], ix: number[]) {
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.length / 3 * 2), 2));
  g.deleteAttribute('normal'); g.setIndex(ix); g.clearGroups(); g.computeVertexNormals();
  g.boundingBox = null; g.boundingSphere = null;
  return g;
}

/** Two hanging leaf bundles per existing crown mesh; broad forms, closed outward faces. */
export function youngBundles(g: THREE.BufferGeometry, radius: number, phase: number) {
  const p: number[] = [], ix: number[] = [], n = 8;
  for (let b = 0; b < 2; b++) {
    const base = p.length / 3, angle = phase * 1.3 + b * 2.8;
    const ox = Math.cos(angle) * radius * .30, oz = Math.sin(angle) * radius * .30;
    for (let j = 0; j < 5; j++) {
      const t = j / 4, profile = [.30, .86, 1, .70, .10][j];
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, r = radius * .72 * profile * (1 + .035 * Math.sin(k * 2.1 + phase));
        p.push(ox + Math.cos(a) * r + .06 * radius * Math.sin(t * Math.PI), radius * (.95 - 2 * t) + radius * .035 * Math.sin(a * 3 + phase), oz + Math.sin(a) * r * .8);
      }
    }
    // Rings descend: opposite winding to an upward trunk.
    for (let j = 0; j < 4; j++) for (let k = 0; k < n; k++) {
      const a = base + j * n + k, c = base + j * n + (k + 1) % n;
      ix.push(a, c, a + n, c, c + n, a + n);
    }
    for (let k = 1; k < n - 1; k++) {
      ix.push(base, base + k + 1, base + k);
      const end = base + 4 * n; ix.push(end, end + k, end + k + 1);
    }
  }
  return replace(g, p, ix);
}

/** Broad bevels on a board: same outer dimensions and attachment origin. */
export function softBoard(g: THREE.BufferGeometry, w: number, h: number, d: number) {
  const p: number[] = [], ix: number[] = [], cut = Math.min(w, d) * .10;
  const ring = [[-w/2+cut,-d/2],[w/2-cut,-d/2],[w/2,-d/2+cut],[w/2,d/2-cut],[w/2-cut,d/2],[-w/2+cut,d/2],[-w/2,d/2-cut],[-w/2,-d/2+cut]];
  for (const [y,shrink] of [[-h/2,.95],[-h*.2,1],[h*.2,1],[h/2,.95]]) for (const [x,z] of ring) p.push(x*shrink,y,z*shrink);
  for (let j=0;j<3;j++) for(let k=0;k<8;k++){const a=j*8+k,b=j*8+(k+1)%8;ix.push(a,a+8,b,b,a+8,b+8)}
  for(let k=1;k<7;k++){ix.push(0,k,k+1);ix.push(24,24+k+1,24+k)}
  return replace(g,p,ix);
}

/** Keep the original stone's extent, but give its facets a shared, softly rounded normal. */
export function softStone(g: THREE.BufferGeometry) {
  const pos=g.getAttribute('position'), norm=g.getAttribute('normal');
  for(let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i), l=Math.hypot(x,y,z);
    // No displacement: collision and silhouette bounds remain exactly as authored.
    const nx=norm.getX(i)*.3+x/l*.7,ny=norm.getY(i)*.3+y/l*.7,nz=norm.getZ(i)*.3+z/l*.7, len=Math.hypot(nx,ny,nz);
    norm.setXYZ(i,nx/len,ny/len,nz/len);
  }
  norm.needsUpdate=true;return g;
}

/** Slightly irregular cross-section, never exceeding the existing cylinder radius. */
export function workedWood(g: THREE.BufferGeometry) {
  const p=g.getAttribute('position');
  for(let i=0;i<p.count;i++) {const x=p.getX(i),z=p.getZ(i),k=.97+.03*Math.cos(Math.atan2(z,x)*3);p.setXYZ(i,x*k,p.getY(i),z*k)}
  p.needsUpdate=true;g.computeVertexNormals();return g;
}
