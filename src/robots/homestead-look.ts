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

/** Hanging twig volumes with a rounded shoulder and separate, soft branchlet ends. */
export function youngBundles(g: THREE.BufferGeometry, radius: number, phase: number) {
  const p: number[] = [], ix: number[] = [], colors: number[] = [];
  const tuft = (ox: number, oz: number, top: number, width: number, length: number,
    angle: number, n: number, profile: number[], fringe: boolean) => {
    const base = p.length / 3;
    for (let j = 0; j < profile.length; j++) {
      const t = j / (profile.length - 1);
      const bend = width * .55 * Math.sin(t * Math.PI * .8);
      for (let k = 0; k < n; k++) {
        const az = k / n * Math.PI * 2;
        const rib = fringe ? 1 : 1 + .13 * Math.cos(az * 8 + angle);
        const r = width * profile[j] * rib;
        p.push(ox + Math.cos(angle) * bend + Math.cos(az) * r,
          top - t * length + width * .10 * Math.sin(az * 3 + angle) * t,
          oz + Math.sin(angle) * bend + Math.sin(az) * r * .83);
        const light = .82 - .12 * t + .045 * Math.cos(az * 8 + angle);
        colors.push(light * 1.08, light, light * .88);
      }
    }
    for (let j = 0; j < profile.length - 1; j++) for (let k = 0; k < n; k++) {
      const a = base + j * n + k, b = base + j * n + (k + 1) % n;
      ix.push(a, b, a + n, b, b + n, a + n);
    }
    for (let k = 1; k < n - 1; k++) {
      ix.push(base, base + k + 1, base + k);
      const end = base + (profile.length - 1) * n; ix.push(end, end + k, end + k + 1);
    }
  };
  // PR14's overlapping shoulder/descending-volume structure, divided into small twig groups.
  // No leaf blades, hair texture or transparent cutout. All pieces remain in the old mesh.
  for (let b = 0; b < 3; b++) {
    const angle = phase * 1.3 + b * 2.399;
    const ox = Math.cos(angle) * radius * .43, oz = Math.sin(angle) * radius * .43;
    const top = radius * (.48 + .16 * Math.sin(angle)), length = radius * (1.15 + .14 * Math.cos(angle));
    const width = radius * (.33 + .035 * Math.sin(angle));
    tuft(ox,oz,top,width,length,angle,24,[.38,.84,1,.90,.65,.32,.10],false);
    for(let k=0;k<5;k++) {
      const a=angle+k*2.399, spread=width*.52;
      tuft(ox+Math.cos(a)*spread,oz+Math.sin(a)*spread,top-length*.55,
        radius*(.035+.005*(k%3)),length*(.48+.12*Math.sin(k+angle)),a,8,[.65,1,.85,.50,.14],true);
    }
  }
  replace(g,p,ix);g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
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
