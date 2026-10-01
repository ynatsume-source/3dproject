#!/usr/bin/env python3
"""Maps for the corner map: a close aerial view around each site and a regional view (about 20 degrees
across), both web-mercator tile mosaics.

Close view: in Japan the GSI seamless aerial photographs (出典：国土地理院) at zoom 17 (about 1 m a pixel),
elsewhere Sentinel-2 cloudless 2023 by EOX (Contains modified Copernicus Sentinel data 2023, CC BY 4.0)
at zoom 15, twice its native 10 m so it stays crisp when drawn. Regional view: Sentinel-2 cloudless at
zoom 6, cut to 20 degrees of longitude around the site. Writes public/map/<id>.jpg, <id>_r.jpg and map.json (longitude west/east, mercator north/south,
and `half`: how many metres either side of the drone the close view shows).
Usage: python3 scripts/fetch-map.py [site ...]
"""
import io, json, math, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

# id: lat, lon, close-view source, zoom, tiles per side, half-width shown (m)
SITES = {
    'miyako': (25.0, 125.25, 'gsi', 17, 8, 420),
    'kayama': (24.3635, 123.9994, 'gsi', 17, 8, 420),
    'gbr': (-15.98, 145.82, 'eox', 15, 6, 900),
    'maldives': (3.48, 72.84, 'eox', 15, 6, 900),
    'pacific': (32.0, -145.0, None, 0, 0, 0),
    'redsea': (25.31, 34.86, 'eox', 15, 6, 900),
    'carnatic': (27.5817, 33.931, 'eox', 15, 6, 900),
    'galapagos': (1.382, -91.806, 'eox', 15, 6, 900),
}
EOX = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg'
GSI = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'

def tile(url):
    for _ in range(3):
        data = subprocess.run(['curl', '-s', '-m', '30', url], capture_output=True).stdout
        try: return Image.open(io.BytesIO(data)).convert('RGB')
        except Exception: pass
    return Image.new('RGB', (256, 256), (20, 60, 90))

def merc(lat): return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

def mosaic(src, z, fx, fy, N):
    n = 2 ** z
    x0, y0 = int(fx * n) - N // 2, int(fy * n) - N // 2
    jobs = [(i, j, src.format(z=z, x=(x0 + i) % n, y=y0 + j)) for j in range(N) for i in range(N)]
    img = Image.new('RGB', (256 * N, 256 * N))
    with ThreadPoolExecutor(8) as ex:
        for (i, j, _), t in zip(jobs, ex.map(lambda q: tile(q[2]), jobs)): img.paste(t, (i * 256, j * 256))
    return img, {'west': x0 / n * 360 - 180, 'east': (x0 + N) / n * 360 - 180,
                 'north': math.pi * (1 - 2 * y0 / n), 'south': math.pi * (1 - 2 * (y0 + N) / n)}

meta = json.load(open('public/map/map.json')) if os.path.exists('public/map/map.json') else {}
for sid in (sys.argv[1:] or SITES):
    lat, lon, src, z, N, half = SITES[sid]
    fx, fy = (lon + 180) / 360, (1 - merc(lat) / math.pi) / 2
    m = {}
    if src:
        img, b = mosaic(GSI if src == 'gsi' else EOX, z, fx, fy, N)
        img.save(f'public/map/{sid}.jpg', quality=80, optimize=True, progressive=True)
        m['near'] = {**b, 'half': half}
    # region: a square 20 degrees of longitude wide centred on the site, cut from a wider mosaic
    img, b = mosaic(EOX, 6, fx, fy, 6)
    W = img.size[0]; px = lambda lo: (lo - b['west']) / (b['east'] - b['west']) * W
    py = lambda la: (b['north'] - merc(la)) / (b['north'] - b['south']) * W
    cx, cy, h = px(lon), py(lat), 10 / (b['east'] - b['west']) * W
    img.crop((round(cx - h), round(cy - h), round(cx + h), round(cy + h))).resize((1024, 1024), Image.LANCZOS).save(f'public/map/{sid}_r.jpg', quality=82, optimize=True, progressive=True)
    x0, y0 = round(cx - h), round(cy - h)
    m['region'] = {'west': b['west'] + x0 / W * (b['east'] - b['west']), 'east': b['west'] + (x0 + round(cx + h) - x0) / W * (b['east'] - b['west']),
                   'north': b['north'] - y0 / W * (b['north'] - b['south']), 'south': b['north'] - round(cy + h) / W * (b['north'] - b['south'])}
    meta[sid] = m
    print(sid, 'done')
json.dump(meta, open('public/map/map.json', 'w'), indent=1)
