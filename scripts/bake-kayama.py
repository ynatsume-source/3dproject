#!/usr/bin/env python3
"""Bakes the land and shallows of Kayama-jima (嘉弥真島, Taketomi, Okinawa) from real data.

Sources (出典：国土地理院):
  - seamless aerial photographs (seamlessphoto, zoom 18, about 0.5 m a pixel)
  - the 10 m digital elevation model (dem_png, zoom 14) for the island's relief
Depths in the shallows are estimated from the colour of the photograph (brighter water is shallower,
as in satellite-derived bathymetry), calibrated to a lagoon floor of 2.5 to 3.5 m and channels of about 10 m;
coral heads are the dark patches on it. The coastline comes from the photograph at 1 m.

Writes, for a square of +-300 m around the site at 1 m (and kayama_far*: +-760 m at 2 m, the whole island),
x east, z south:
  public/land/kayama.jpg    the photograph, north up
  public/land/kayama_h.png  R,G: height in cm + 32768 (big-endian); B: reef cover 0..255
  public/land/kayama_c.png  R: tree canopy, G: dry sand, B: bare rock (each 0..255)
Usage: python3 scripts/bake-kayama.py
"""
import io, math, os, subprocess
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
from scipy import ndimage as nd

LAT, LON = 24.36107, 123.99674      # world origin: out in the lagoon off the south-west corner of the island
# two bakes: close in at 1 m (the lagoon and beach the drone swims), and the whole island at 2 m
BAKES = [(300, 1, '', 1024), (760, 2, '_far', 2048)]   # half-size (m), metres a cell, file suffix, photo px
HALF = 780                           # (tile fetching covers the larger)
OUT = 'public/land'
DBG = os.environ.get('DBG')

def get(url):
    for _ in range(4):
        d = subprocess.run(['curl', '-s', '-m', '30', url], capture_output=True).stdout
        try: return Image.open(io.BytesIO(d))
        except Exception: pass
    return None

def merc(lat): return np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
K, COSL = 111320.0, math.cos(math.radians(LAT))

def tile_xy(lat, lon, z):
    n = 2 ** z
    return (lon + 180) / 360 * n, (1 - merc(lat) / math.pi) / 2 * n

def mosaic(url, z, mode):
    """Tiles covering the square, and a function from (x, z) metres to fractional mosaic pixels."""
    (xa, ya), (xb, yb) = tile_xy(LAT + (HALF + 20) / K, LON - (HALF + 20) / (K * COSL), z), tile_xy(LAT - (HALF + 20) / K, LON + (HALF + 20) / (K * COSL), z)
    x0, y0, x1, y1 = int(xa), int(ya), int(xb), int(yb)
    img = Image.new(mode, ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
    jobs = [(i, j) for j in range(y0, y1 + 1) for i in range(x0, x1 + 1)]
    with ThreadPoolExecutor(8) as ex:
        for (i, j), t in zip(jobs, ex.map(lambda q: get(url.format(z=z, x=q[0], y=q[1])), jobs)):
            if t is not None: img.paste(t.convert(mode), ((i - x0) * 256, (j - y0) * 256))
    def to_px(xm, zm):
        fx, fy = tile_xy(LAT - zm / K, LON + xm / (K * COSL), z)
        return (fx - x0) * 256, (fy - y0) * 256
    return img, to_px

def sample(arr, px, py, order=1):
    return nd.map_coordinates(arr, [py - 0.5, px - 0.5], order=order, mode='nearest')

os.makedirs(OUT, exist_ok=True)
photo, ppx = mosaic('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', 18, 'RGB')
P = np.asarray(photo).astype(np.float32) / 255
del photo
Pb = np.stack([nd.gaussian_filter(P[..., c], 1.0) for c in range(3)], -1)
dem, dpx = mosaic('https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png', 14, 'RGB')
D = np.asarray(dem).astype(np.int64)
v = D[..., 0] * 65536 + D[..., 1] * 256 + D[..., 2]
hdem = (np.where(v == 0x800000, 0, np.where(v >= 2 ** 23, v - 2 ** 24, v)) * 0.01).astype(np.float32)

for HALF, st, SUF, S in BAKES:
  N = int(HALF * 2 / st)
  m = lambda metres: metres / st                 # a length in metres, in cells
  xs = (np.arange(N) + 0.5) * st - HALF
  X, Z = np.meshgrid(xs, xs)           # rows run north to south (z grows southward)
  # the output photo over the square
  sx = (np.arange(S) + 0.5) / S * 2 * HALF - HALF
  SX, SZ = np.meshgrid(sx, sx)
  qx, qy = ppx(SX, SZ)
  out = np.stack([sample(P[..., c], qx, qy) for c in range(3)], -1)
  Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/kayama{SUF}.jpg', quality=86, optimize=True, progressive=True)
  # the grid: an area average (blurred by about a metre, then sampled)
  qx, qy = ppx(X, Z)
  C = np.stack([sample(Pb[..., c], qx, qy) for c in range(3)], -1)
  r, g, b = C[..., 0], C[..., 1], C[..., 2]
  lum = 0.3 * r + 0.55 * g + 0.15 * b

  # ---------- land and water ----------
  rr_ = np.maximum(r, 0.02)
  water = (b / rr_ > 1.18) & (g / rr_ > 1.35)       # turquoise to blue-green; forest and sand have b/r under 1
  sandy = (lum > 0.55) & (r > b - 0.03)
  land = (~water) | sandy
  PAD = int(m(40))   # the square cuts through the island: pad by repeating the edge, so it is not read as shore
  def padded(f, a): return f(np.pad(a, PAD, mode='edge'))[PAD:-PAD, PAD:-PAD]
  land = padded(lambda a: nd.binary_closing(nd.binary_opening(a, iterations=max(1, int(m(2)))), iterations=max(1, int(m(3)))), land)
  lab, n = nd.label(land)
  if n:
      sizes = nd.sum(land, lab, range(1, n + 1))
      land = lab == (1 + int(np.argmax(sizes)))          # the island itself; stray bright patches are sand bars under water
  land = nd.binary_fill_holes(land)



  # ---------- the island's relief ----------
  qx, qy = dpx(X, Z)
  H10 = np.maximum(sample(hdem, qx, qy, order=3), 0)
  land = nd.binary_fill_holes(land | (H10 > 1.2))    # inland the elevation model is sure; dark forest can pass for deep water

  veg = land & ~sandy & (g >= r - 0.02) & (lum < 0.55)
  din = padded(nd.distance_transform_edt, land) * st         # metres inland from the shore
  dout = padded(nd.distance_transform_edt, ~land) * st       # metres out from the shore
  beach = 0.25 + np.minimum(din, 12) * 0.13 + np.maximum(din - 12, 0) * 0.05
  hland = np.where(din < 30, np.minimum(beach, np.maximum(H10, beach * 0.8)), np.maximum(H10, 1.6))
  hland = nd.gaussian_filter(hland, m(2.0))

  # ---------- the shallows ----------
  wl = np.where(land, np.nan, lum)
  wlf = np.where(land, np.nanmedian(wl), wl)
  L6 = nd.gaussian_filter(wlf, m(6.0))
  lo, hi = np.percentile(L6[~land], 3), np.percentile(L6[~land], 97)
  t = np.clip((hi - L6) / (hi - lo), 0, 1)
  depth = 2.2 + 9.0 * t ** 1.3
  depth = np.minimum(depth, 0.1 + dout * 0.035 + np.maximum(dout - 25, 0) * 0.04)    # the beach shelves gently into the lagoon
  depth = nd.gaussian_filter(depth, m(1.5))
  # coral heads: patches darker than their surroundings
  L2, L20 = nd.gaussian_filter(wlf, m(1.2)), nd.gaussian_filter(wlf, m(14.0))
  reef = np.clip((L20 - L2 - 0.012) / 0.06, 0, 1) * np.clip((dout - 4) / 10, 0, 1)
  reef = nd.gaussian_filter(reef, m(0.8))
  hwater = -depth + reef * np.minimum(depth - 0.35, 0.9) * 0.9   # heads stand up to about a metre off the bottom
  h = np.where(land, hland, hwater)
  h = nd.gaussian_filter(h, m(0.7))

  # ---------- cover on land ----------
  canopy = np.clip(nd.gaussian_filter(veg.astype(np.float32), m(1.5)) * 1.3, 0, 1) * land * np.clip((din - 2) / 5, 0, 1)
  dry = np.clip(nd.gaussian_filter((sandy & ~veg).astype(np.float32), m(1.0)) * 1.2, 0, 1) * land
  rocky = np.clip(nd.gaussian_filter(((~sandy) & (~veg) & land & (np.abs(r - b) < 0.06)).astype(np.float32), m(1.0)), 0, 1) * land

  hc = np.clip(np.round(h * 100) + 32768, 0, 65535).astype(np.int64)
  Image.fromarray(np.stack([(hc >> 8).astype(np.uint8), (hc & 255).astype(np.uint8), (reef * (~land) * 255).astype(np.uint8)], -1)).save(f'{OUT}/kayama{SUF}_h.png', optimize=True)
  Image.fromarray(np.stack([(canopy * 255).astype(np.uint8), (dry * 255).astype(np.uint8), (rocky * 255).astype(np.uint8)], -1)).save(f'{OUT}/kayama{SUF}_c.png', optimize=True)
  print(SUF or 'near', 'land %.0f%%, height %.1f..%.1f m, dem max %.1f' % (land.mean() * 100, h.min(), h.max(), H10.max()))
  if DBG:
      def norm(a): a = a - np.nanmin(a); return (a / max(np.nanmax(a), 1e-6) * 255).astype(np.uint8)
      Image.fromarray(norm(h)).save(f'{DBG}/k{SUF}_h.png')
      Image.fromarray(np.stack([norm(canopy), norm(dry), norm(reef)], -1)).save(f'{DBG}/k{SUF}_c.png')
      Image.fromarray((C * 255).astype(np.uint8)).save(f'{DBG}/k{SUF}_p.png')
