import struct,json,hashlib,sys
from pathlib import Path
p=Path(sys.argv[1]);b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);data=b[28+n:]
def acc(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];sizes={'SCALAR':1,'VEC3':3,'VEC4':4};sz=sizes[a['type']];fmt={5126:'f',5123:'H',5125:'I'}[a['componentType']];stride=v.get('byteStride',struct.calcsize(fmt)*sz);off=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from('<'+fmt*sz,data,off+j*stride) for j in range(a['count'])]
pr=g['meshes'][0]['primitives'][0];pos=acc(pr['attributes']['POSITION']);norm=acc(pr['attributes']['NORMAL']);col=acc(pr['attributes']['COLOR_0']);ix=[v[0] for v in acc(pr['indices'])]
tri=[ix[i:i+3] for i in range(0,len(ix),3) if all(col[k][1]>col[k][0] for k in ix[i:i+3])]
adj={}
for t in tri:
 for i in t:adj.setdefault(i,set()).update(t)
seen=set();comp=[]
for root in adj:
 if root in seen:continue
 stack=[root];s=set()
 while stack:
  i=stack.pop()
  if i in s:continue
  s.add(i);stack.extend(adj[i]-s)
 seen|=s;comp.append(s)
print('vertex',len(pos),'leaf triangles',len(tri),'components',len(comp),[len(s) for s in comp])
parts=[]
for slot in range(4):
 ids=set().union(*comp[slot::4]);verts=sorted(ids);mapping={v:i for i,v in enumerate(verts)}
 part={'position':[round(x,7) for v in verts for x in pos[v]],'normal':[round(x,7) for v in verts for x in norm[v]],'color':[round(x,7) for v in verts for x in col[v][:3]],'index':[mapping[i] for t in tri if t[0] in ids for i in t]};parts.append(part)
out={'sourceCommit':'e754ce36ce0a1e0f7a93e7a5f267fd35ec23fc3d','sourceSha256':hashlib.sha256(b).hexdigest(),'note':'Leaf-only connected components from original PR14 GLB, divided among four existing crown meshes. No trunk or branch geometry imported.','parts':parts}
Path(sys.argv[2]).write_text(json.dumps(out,separators=(',',':'))+'\n');print('triangles per slot',[len(x['index'])//3 for x in parts])
