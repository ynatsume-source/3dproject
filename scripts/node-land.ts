// Lets a headless script load an island's land (src/ocean/land.ts) from public/land: its PNGs are read and
// decoded here (8-bit RGB/RGBA, as bake-kayama.py writes them), standing in for the browser's fetch, image
// decoding and canvas. The land's own interpolation is untouched. Import before calling loadLand.
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';

function decodePng(buf: Buffer) {
  let p = 8, w = 0, h = 0, ct = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw Error('png: 8-bit, not interlaced only'); }
    else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw Error('png: RGB or RGBA only');
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = new Uint8ClampedArray(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pr = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (() => { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })() : 0;
      row[i] = (row[i] + pr) & 255;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; out[o] = row[x * bpp]; out[o + 1] = row[x * bpp + 1]; out[o + 2] = row[x * bpp + 2]; out[o + 3] = bpp === 4 ? row[x * bpp + 3] : 255; }
    prev = row;
  }
  return { width: w, height: h, data: out };
}
const file = (url: string) => new URL('../public' + url, import.meta.url);
const g: any = globalThis;
// (a stand-in document only while a land image is being read: three's loaders look for a real one)
let reading = 0;
const canvasDoc = { createElement: () => { let img: any; return { width: 0, height: 0, getContext: () => ({ drawImage: (i: any) => { img = i; }, getImageData: () => { if (--reading === 0 && g.document === canvasDoc) delete g.document; return { data: img.data }; } }) }; } };
g.fetch = async (url: string) => ({ blob: async () => { reading++; g.document = canvasDoc; return decodePng(fs.readFileSync(file(url))); } });
g.createImageBitmap = async (img: any) => img;
THREE.TextureLoader.prototype.loadAsync = async () => new THREE.Texture();
