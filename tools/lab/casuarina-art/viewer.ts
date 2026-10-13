// Standalone art stage. Does not import main.ts, build a world, use saves, AI or world RNG.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.prepend(renderer.domElement);
renderer.setClearColor(0xdce6db);renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xdce6db,12,25);
const camera=new THREE.PerspectiveCamera(44,innerWidth/innerHeight,.05,40);
scene.add(new THREE.HemisphereLight(0xf8f3da,0x7e9583,1.35));const sun=new THREE.DirectionalLight(0xffeed1,1.65);sun.position.set(-3,7,4);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-3,right:3,top:4,bottom:-3,near:.1,far:16});sun.shadow.normalBias=.025;sun.shadow.bias=-.0003;scene.add(sun);
const mat=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{uTime:{value:0},uWind:{value:new THREE.Vector3(.8,.3,2)},uMotion:{value:1}},vertexShader:`attribute vec3 aTint;attribute float aSway;varying vec3 vN;varying vec3 vCol;varying vec3 vWp;uniform float uTime;uniform vec3 uWind;uniform float uMotion;
void main(){vec4 w=modelMatrix*instanceMatrix*vec4(position,1.0);float ph=instanceMatrix[3].x*.37+instanceMatrix[3].z*.23;float wk=clamp(uWind.z/10.0,0.0,1.8);
// Same displacement formula as shore.ts; uMotion only freezes this isolated study for comparisons.
w.xz+=(vec2(sin(uTime*1.3+ph),cos(uTime*1.1+ph*1.7))*aSway*(.06+.1*wk)+uWind.xy*aSway*wk*wk*.08*(.7+.3*sin(uTime*1.7+ph)))*uMotion;
vWp=w.xyz;vN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);vCol=aTint;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`varying vec3 vN;varying vec3 vCol;varying vec3 vWp;
void main(){vec3 n=normalize(vN);if(!gl_FrontFacing)n=normalize(-n*.4+vec3(0,.9,0));float light=smoothstep(-.45,.82,dot(n,normalize(vec3(-.5,1,.65))));vec3 tint=mix(vec3(.62,.80,.76),vec3(1.14,1.08,.83),light);float height=mix(.83,1.04,smoothstep(.4,2.7,vWp.y));gl_FragColor=vec4(vCol*tint*height,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
const foot=new THREE.Group();scene.add(foot);const soil=new THREE.Mesh(new THREE.CylinderGeometry(1.9,1.95,.12,64),new THREE.MeshStandardMaterial({color:0x889369,roughness:1}));soil.position.y=-.07;soil.receiveShadow=true;foot.add(soil);
const under=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.10}));under.rotation.x=-Math.PI/2;under.position.y=-.135;under.receiveShadow=true;scene.add(under);
const grassGeo=new THREE.BufferGeometry(),p:number[]=[],n:number[]=[],c:number[]=[],s:number[]=[],ix:number[]=[];
for(let clump=0;clump<9;clump++){const a=clump*2.399,r=.9+(clump%3)*.23,x=Math.cos(a)*r,z=Math.sin(a)*r;for(let k=0;k<4;k++){const ang=a+k*1.4,h=.15+(k%3)*.06,w=.018,dx=Math.cos(ang),dz=Math.sin(ang),j=p.length/3;p.push(x-dz*w,0,z+dx*w,x+dz*w,0,z-dx*w,x+dx*.08,h,z+dz*.08);for(let v=0;v<3;v++){n.push(0,1,0);c.push(.16+.02*k,.27+.015*k,.08);s.push(v===2?.13:0)}ix.push(j,j+1,j+2)}}
grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));grassGeo.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));grassGeo.setAttribute('aTint',new THREE.Float32BufferAttribute(c,3));grassGeo.setAttribute('aSway',new THREE.Float32BufferAttribute(s,1));grassGeo.setIndex(ix);const grass=new THREE.InstancedMesh(grassGeo,mat,1);grass.setMatrixAt(0,new THREE.Matrix4());foot.add(grass);
for(let i=0;i<3;i++){const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(.12+i*.025,1),new THREE.MeshStandardMaterial({color:0xaaa58d,roughness:1}));rock.position.set(-.9+i*.20,.035,.6+i*.04);rock.scale.set(1,.65,.85);rock.castShadow=true;rock.receiveShadow=true;foot.add(rock)}
const loader=new GLTFLoader();const gltf=await loader.loadAsync('/lab/casuarina-art/casuarina-original.glb');let asset:THREE.BufferGeometry|undefined;gltf.scene.traverse(o=>{if((o as THREE.Mesh).isMesh)asset=(o as THREE.Mesh).geometry});if(!asset)throw Error('GLB mesh missing');asset.setAttribute('aTint',asset.getAttribute('color'));asset.setAttribute('aSway',asset.getAttribute('_sway'));if(!asset.getAttribute('aSway'))throw Error('Exported wind weights missing');
const prior=await fetch('/lab/casuarina-art/pr13-geometry.json').then(r=>r.json());const old=new THREE.BufferGeometryLoader().parse(prior);
const tree=new THREE.InstancedMesh(asset,mat,1);tree.setMatrixAt(0,new THREE.Matrix4().makeRotationY(1.7).scale(new THREE.Vector3(2.4,2.7,2.4)));tree.castShadow=true;tree.frustumCulled=false;scene.add(tree);
let variant='new',far=false,wind=true,manual=false;
function pose(distance=5.7,offset=0){camera.position.set(3.1+offset,1.75,distance);camera.lookAt(offset*.2,1.37,0);camera.updateMatrixWorld();}
function select(v:string){variant=v;tree.geometry=v==='new'?asset!:old;document.getElementById('old')!.classList.toggle('on',v==='old');document.getElementById('new')!.classList.toggle('on',v==='new')}
function render(t=0,offset=0,distance=far?10:5.7){mat.uniforms.uTime.value=t;pose(distance,offset);renderer.render(scene,camera);document.getElementById('status')!.textContent=`${tree.geometry.index!.count/3} triangles · 1 shared tree mesh`}
Object.assign(window,{treeStudy:{select,render,freeze:()=>{manual=true},setWind:(on:boolean)=>{mat.uniforms.uMotion.value=on?1:0},metrics:()=>({triangles:tree.geometry.index!.count/3,calls:renderer.info.render.calls,renderTriangles:renderer.info.render.triangles,variant,assetAttributes:Object.keys(asset!.attributes),camera:camera.position.toArray(),rotation:camera.rotation.toArray(),worldLoaded:false}),renderer,camera}});
(document.getElementById('old') as HTMLButtonElement).onclick=()=>select('old');(document.getElementById('new') as HTMLButtonElement).onclick=()=>select('new');(document.getElementById('distance') as HTMLButtonElement).onclick=e=>{far=!far;(e.target as HTMLElement).textContent=far?'近くから':'遠くから'};(document.getElementById('wind') as HTMLButtonElement).onclick=e=>{wind=!wind;mat.uniforms.uMotion.value=wind?1:0;(e.target as HTMLElement).textContent=wind?'風を止める':'風を動かす'};
function loop(t:number){if(!manual)render(t/1000);requestAnimationFrame(loop)}requestAnimationFrame(loop);render();
