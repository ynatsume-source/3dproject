"""Check authored bundle winding and finite vertex attributes in Blender source files."""
import bpy, json, math
from pathlib import Path
rows=[]
for variant,path,cap in [('v1','tools/lab/casuarina-art/source/v1/casuarina-original.blend',0),('v2','tools/lab/casuarina-art/source/casuarina-original.blend',2)]:
 bpy.ops.wm.open_mainfile(filepath=str(Path(path).resolve()))
 m=bpy.data.objects['Casuarina_original'].data
 assert len(m.vertices)==1797 and len(m.materials)==1
 assert all(math.isfinite(x) for v in m.vertices for x in v.co)
 assert all(math.isfinite(x.value) and 0<=x.value<1 for x in m.attributes['_SWAY'].data)
 starts=[];p=64
 for i in range(10):
  p+=18
  for k in range(3):starts.append(p);p+=36+cap
 for i in range(3):starts.append(p);p+=36+cap
 assert p==len(m.polygons)
 dots=[]
 for first in starts:
  indices=sorted({v for f in m.polygons[first:first+36] for v in f.vertices});assert len(indices)==45
  for ring in range(4):
   vv=indices[ring*9:(ring+2)*9];center=sum((m.vertices[v].co for v in vv),m.vertices[0].co*0)/18
   for poly in m.polygons[first+ring*9:first+(ring+1)*9]:
    radial=poly.center-center;radial.z=0;dots.append(poly.normal.dot(radial))
 outward=sum(d>0 for d in dots)
 assert outward==(len(dots) if variant=='v2' else 0)
 rows.append({'variant':variant,'bundleSideFaces':len(dots),'outward':outward,'inward':len(dots)-outward,'finiteAttributes':True})
print('ASSET_VALIDATION '+json.dumps(rows))
