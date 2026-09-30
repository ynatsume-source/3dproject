#!/usr/bin/env python3
"""Maps for the corner map: a close aerial view around each site (about 2 km across) and a regional
view (about 20 degrees across).

Close view: in Japan the GSI seamless aerial photographs (出典：国土地理院), elsewhere Sentinel-2
cloudless by EOX (Contains modified Copernicus Sentinel data, CC BY 4.0). Regional view: cut from
src/bluemarble.jpg (NASA Blue Marble, public domain). Writes public/map/<id>.jpg, <id>_r.jpg, map.json.
"""
import io, json, math, subprocess
from PIL import Image

SITES = {'miyako': (25.0, 125.25, 'gsi'), 'gbr': (-15.98, 145.82, 'eox'), 'maldives': (3.48, 72.84, 'eox'), 'pacific': (32.0, -145.0, None)}
Z, N = 16, 4   # zoom, tiles per side (1024 px)

def tile(src, z, x, y):
    u = (f'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg' if src == 'gsi'
         else f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg')
    data = subprocess.run(['curl', '-s', '-m', '30', u], capture_output=True).stdout
    return Image.open(io.BytesIO(data)).convert('RGB')

def merc(lat): return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

meta = {}
earth = Image.open('src/bluemarble.jpg').convert('RGB')
for sid, (lat, lon, src) in SITES.items():
    m = {}
    if src:
        n = 2 ** Z
        fx = (lon + 180) / 360 * n; fy = (1 - merc(lat) / math.pi) / 2 * n
        x0, y0 = int(fx) - N // 2, int(fy) - N // 2
        img = Image.new('RGB', (256 * N, 256 * N))
        for j in range(N):
            for i in range(N):
                img.paste(tile(src, Z, x0 + i, y0 + j), (i * 256, j * 256))
        img.save(f'public/map/{sid}.jpg', quality=82)
        # bounds: longitude west/east, mercator north/south
        m['near'] = {'west': x0 / n * 360 - 180, 'east': (x0 + N) / n * 360 - 180,
                     'north': math.pi * (1 - 2 * y0 / n), 'south': math.pi * (1 - 2 * (y0 + N) / n)}
    # regional: equirectangular crop of the Blue Marble, 20 degrees square
    W, H = earth.size
    d = 10
    box = (int((lon - d + 180) / 360 * W), int((90 - lat - d) / 180 * H), int((lon + d + 180) / 360 * W), int((90 - lat + d) / 180 * H))
    earth.crop(box).resize((512, 512), Image.LANCZOS).save(f'public/map/{sid}_r.jpg', quality=85)
    m['region'] = {'west': lon - d, 'east': lon + d, 'north': lat + d, 'south': lat - d}
    meta[sid] = m
    print(sid, 'done')
json.dump(meta, open('public/map/map.json', 'w'), indent=1)
