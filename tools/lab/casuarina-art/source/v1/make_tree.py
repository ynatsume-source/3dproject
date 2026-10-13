"""Original, texture-free casuarina study. Blender 4.3; no external assets.
Run: blender -b --factory-startup --python tools/lab/casuarina-art/make_tree.py -- OUT
"""
import bpy, math, random, sys, json
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
rng=random.Random(4120); verts=[]; faces=[]; colors=[]; sway=[]
def vert(p,c,w):
    verts.append(tuple(v/3.45 for v in p));colors.append(tuple(c)+(1,));sway.append(w);return len(verts)-1
def tube(a,b,r0,r1,c,w0,w1,segments=7,rings=4):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized();side=axis.cross(Vector((0,1,0))).normalized();other=axis.cross(side).normalized();base=len(verts)
    for j in range(rings+1):
        t=j/rings;p=a.lerp(b,t);rad=r0*(1-t)+r1*t
        for k in range(segments):
            an=math.tau*k/segments;vert(p+side*math.cos(an)*rad+other*math.sin(an)*rad,c,w0*(1-t)+w1*t)
    for j in range(rings):
        for k in range(segments):
            x=base+j*segments+k;y=base+j*segments+(k+1)%segments;faces.append((x,y,y+segments,x+segments))
def tuft(top,width,length,angle,shade,weight):
    # A hanging volume of twig bundles: broad shoulders, uneven flank, tapered ends.
    top=Vector(top);side=Vector((math.cos(angle),math.sin(angle),0));depth=Vector((-side.y,side.x,0));base=len(verts)
    profile=[(.0,.38),(.22,.94),(.53,1.0),(.81,.72),(1,.18)]
    jitter=[rng.uniform(.84,1.16) for _ in range(9)]
    for j,(t,r) in enumerate(profile):
        center=top+side*(.12*math.sin(t*math.pi))+Vector((0,0,-length*t))
        for k in range(9):
            an=math.tau*k/9;rad=r*jitter[k];p=center+side*math.cos(an)*width*rad+depth*math.sin(an)*width*.83*rad
            p.z+=width*.13*math.sin(an*3+angle)*r
            if j==4:p.z+=length*.12*math.sin(an*3+angle)
            # Variation is broad and authored, with no hair-sized texture or alpha-cutout.
            c=[shade[0]*(1-.18*t),shade[1]*(1-.14*t),shade[2]*(1-.06*t)]
            vert(p,c,weight+.16*t)
    for j in range(len(profile)-1):
        for k in range(9):
            x=base+j*9+k;y=base+j*9+(k+1)%9;faces.append((x,y,y+9,x+9))
wood=(.24,.16,.095)
tube((0,0,0),(.12,.035,3.17),.115,.023,wood,0,.20,8,8)
for i in range(10):
    h=1.40+i*.169;an=i*2.399+.18*rng.random();length=(1-i/13)*.77+.16
    root=Vector((.12*h/3.17,.035*h/3.17,h));tip=root+Vector((math.cos(an)*length,math.sin(an)*length,.28+.18*length))
    w=.13+.14*h/3.45;tube(root,tip,.035*(1-i*.035),.010,wood,w*.45,w,6,3)
    for k in range(3):
        center=root.lerp(tip,.48+k*.26)+Vector((0,0,.22))
        shade=(.105+rng.random()*.02,.225+rng.random()*.03,.09+rng.random()*.02)
        tuft(center,.34+.075*rng.random(),.69+.19*rng.random(),an+k*.7,shade,w)
for i in range(3):
    an=i*2.1;tuft((.12+.16*math.cos(an),.035+.16*math.sin(an),3.43-i*.07),.22,.67,an,(.14,.275,.10),.31)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mesh=bpy.data.meshes.new('Casuarina_original');mesh.from_pydata(verts,[],faces);mesh.update()
obj=bpy.data.objects.new('Casuarina_original',mesh);bpy.context.collection.objects.link(obj)
for p in mesh.polygons:p.use_smooth=True
col=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
for i,c in enumerate(colors):col.data[i].color=c
mesh.color_attributes.active_color=col
attr=mesh.attributes.new(name='_SWAY',type='FLOAT',domain='POINT')
for i,w in enumerate(sway):attr.data[i].value=w
mat=bpy.data.materials.new('Original_vertex_colour');mat.use_nodes=True
nodes=mat.node_tree.nodes;vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='Color'
mat.node_tree.links.new(vc.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color']);nodes.get('Principled BSDF').inputs['Roughness'].default_value=.95
mesh.materials.append(mat);bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'casuarina-original.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'casuarina-original.glb'),export_format='GLB',use_selection=True,export_attributes=True,export_yup=True,export_vertex_color='ACTIVE',export_all_vertex_colors=True)
mesh.calc_loop_triangles()
(out/'asset-info.json').write_text(json.dumps({'generator':'Original Blender Python mesh, seed 4120','blender':bpy.app.version_string,'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),'materials':1,'textures':0,'attributes':['position','normal','color','_sway'],'root':'ground at origin, unit height, exported Y-up'},indent=2)+'\n')
