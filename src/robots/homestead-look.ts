// Display-only study: edit existing geometry containers. No Object3D/Material/Geometry
// construction here: Three UUID construction consumes the world's Math.random stream.
import * as THREE from 'three';
import crown from './casuarina-young-crown.json';

function replace(g: THREE.BufferGeometry, p: number[], ix: number[]) {
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.length / 3 * 2), 2));
  g.deleteAttribute('normal'); g.setIndex(ix); g.clearGroups(); g.computeVertexNormals();
  g.boundingBox = null; g.boundingSphere = null;
  return g;
}

/** PR14's original closed twig bundles, divided over the four existing crown meshes. */
export function youngBundles(g: THREE.BufferGeometry, slot: number, tree: number) {
  const part = crown.parts[slot], p: number[] = [], normal: number[] = [], colors: number[] = [];
  const angle = tree * .61, ca = Math.cos(angle), sa = Math.sin(angle);
  // Cancel the existing mesh's placement within the crown; roots/crown/pivot stay unchanged.
  const ox = Math.sin(slot * 2.1 + tree) * .12, oy = 2.3 + slot * .35 - .5;
  const oz = Math.cos(slot * 2.1 + tree) * .12;
  // The island shaders use display-space colours (render/common.ts), unlike glTF.
  const display = (v: number) => v <= .0031308 ? 12.92*v : 1.055*Math.pow(v,1/2.4)-.055;
  const base = [79/255,122/255,58/255];
  for(let i=0;i<part.position.length;i+=3) {
    const x=part.position[i]*2.7,y=part.position[i+1]*3.2,z=part.position[i+2]*2.7;
    p.push(ca*x+sa*z-ox,y-oy,-sa*x+ca*z-oz);
    const nx=part.normal[i]/2.7,ny=part.normal[i+1]/3.2,nz=part.normal[i+2]/2.7;
    const l=Math.hypot(nx,ny,nz);normal.push((ca*nx+sa*nz)/l,ny/l,(-sa*nx+ca*nz)/l);
    // Reference vertex colour, adapted to the island's shared leaf material, without gloss.
    colors.push(display(part.color[i])*.82/base[0],display(part.color[i+1])*.82/base[1],display(part.color[i+2])*.82/base[2]);
  }
  replace(g,p,part.index);
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}

/** Use vertex tint only on authored meshes; default white leaves shared users unchanged. */
export function homesteadMaterial<T extends THREE.Material>(m: T): T {
  const shader = m as unknown as THREE.ShaderMaterial;
  shader.vertexColors = true;
  shader.vertexShader = 'varying vec3 vHomesteadTint;\n' + shader.vertexShader.replace('void main(){', `void main(){
    vHomesteadTint = vec3(1.0);
    #ifdef USE_COLOR
    vHomesteadTint = color;
    #endif
  `);
  shader.fragmentShader = 'varying vec3 vHomesteadTint;\n' + shader.fragmentShader.replace('vec3 alb = uCol;', `vec3 alb = uCol * vHomesteadTint;
    float homesteadSpec = mix(0.08, 1.0, step(0.999, min(vHomesteadTint.r, min(vHomesteadTint.g, vHomesteadTint.b))));`)
    .replaceAll('uSpec *', 'uSpec * homesteadSpec *');
  return m;
}

/** Separated thick slats in one existing mesh, retaining its external dimensions. */
export function slattedBoard(g: THREE.BufferGeometry, w: number, h: number, d: number, count: number) {
  const p: number[] = [], ix: number[] = [], colors: number[] = [];
  const width = d / count, gap = .006;
  for (let s = 0; s < count; s++) {
    const base = p.length / 3, z0 = -d / 2 + s * width, z1 = z0 + width;
    const ring = [[-w/2+.025,z0+gap],[w/2-.025,z0+gap],[w/2,z0+.02],[w/2,z1-.02],[w/2-.025,z1-gap],[-w/2+.025,z1-gap],[-w/2,z1-.02],[-w/2,z0+.02]];
    for (const [y,shrink] of [[-h/2,.985],[-h*.24,1],[h*.24,1],[h/2,.985]]) for (const [x,z] of ring) {
      p.push(x*shrink,y,z);
      const light = .72 + (s % 3) * .07 + (y > 0 ? .14 : 0);
      colors.push(light * 1.06,light,light*.88);
    }
    for(let j=0;j<3;j++)for(let k=0;k<8;k++){const a=base+j*8+k,b=base+j*8+(k+1)%8;ix.push(a,a+8,b,b,a+8,b+8)}
    for(let k=1;k<7;k++){ix.push(base,base+k,base+k+1);ix.push(base+24,base+24+k+1,base+24+k)}
  }
  replace(g,p,ix);g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
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
  const p=g.getAttribute('position'), norm=g.getAttribute('normal'), colors: number[]=[];
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i),a=Math.atan2(z,x),k=.94+.06*Math.cos(a*3);
    p.setXYZ(i,x*k,p.getY(i),z*k);
    const end=Math.abs(norm.getY(i))>.8, light=end?1.18:.66+.15*Math.cos(a*3);
    colors.push(light*1.12,light,light*.78);
  }
  p.needsUpdate=true;g.computeVertexNormals();
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}
