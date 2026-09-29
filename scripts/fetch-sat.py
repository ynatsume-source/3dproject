# Bakes Sentinel-2 cloudless mosaics around each sea for the dive-in flight (run once; results in public/sat).
# Imagery: "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus
# Sentinel data 2016)", CC BY 4.0. Tiles are fetched once, politely, and stitched.
import math, subprocess, json, os, io, time, sys
from PIL import Image
SITES = {'miyako': (25.01, 125.255), 'gbr': (-15.98, 145.82), 'maldives': (3.48, 72.84)}
LEVELS = [(9, 4), (12, 6), (14, 8)]           # zoom, tiles across (mosaic is n x n tiles centred on the site)
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sat')
os.makedirs(OUT, exist_ok=True)
def tilexy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y
def tile2ll(x, y, z):
    n = 2 ** z
    lon = x / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon
meta = {}
for name, (lat, lon) in SITES.items():
    meta[name] = []
    for z, n in LEVELS:
        cx, cy = tilexy(lat, lon, z)
        x0, y0 = int(cx - n / 2 + 0.5), int(cy - n / 2 + 0.5)
        img = Image.new('RGB', (256 * n, 256 * n))
        for j in range(n):
            for i in range(n):
                u = f'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y0 + j}/{x0 + i}.jpg'
                data = subprocess.run(['curl', '-s', '-m', '30', u], capture_output=True).stdout
                try: t = Image.open(io.BytesIO(data)).convert('RGB')
                except Exception: t = Image.new('RGB', (256, 256), (8, 30, 60)); print('missing', u, file=sys.stderr)
                img.paste(t, (i * 256, j * 256)); time.sleep(0.05)
        fn = f'{name}_{z}.jpg'
        img.save(os.path.join(OUT, fn), quality=82)
        north, west = tile2ll(x0, y0, z); south, east = tile2ll(x0 + n, y0 + n, z)
        meta[name].append({'file': fn, 'z': z, 'north': north, 'south': south, 'west': west, 'east': east})
        print(name, z, fn, round(north, 3), round(south, 3), round(west, 3), round(east, 3))
json.dump(meta, open(os.path.join(OUT, 'sat.json'), 'w'), indent=1)
