// The corner map: where the drone is on the real map. Close up, the aerial photograph around the site
// with the modelled area outlined and the drone as an arrow along its heading; tap for the region.
import type { Sea } from '../data/locations';

interface Bounds { west: number; east: number; north: number; south: number; half?: number }   // north/south in mercator units
let meta: Record<string, { near?: Bounds; region: Bounds }> | null = null;
const imgs = new Map<string, HTMLImageElement>();
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const WORLD = 260;

export class MiniMap {
  private cv: HTMLCanvasElement; private ctx: CanvasRenderingContext2D; private note: HTMLElement;
  mode: 'near' | 'region' = 'near';
  constructor(el: HTMLElement) {
    this.cv = el.querySelector('canvas')!; this.ctx = this.cv.getContext('2d')!; this.note = el.querySelector('.cr') as HTMLElement;
    // (a soft cross-fade between the close-up and the region, not a jump)
    el.addEventListener('click', () => { el.classList.add('swap'); setTimeout(() => { this.mode = this.mode === 'near' ? 'region' : 'near'; el.classList.remove('swap'); }, 380); });
    fetch(`${import.meta.env.BASE_URL}map/map.json`).then((r) => r.json()).then((m) => { meta = m; }).catch(() => {});
  }
  private img(src: string) {
    let im = imgs.get(src);
    if (!im) { im = new Image(); im.src = `${import.meta.env.BASE_URL}map/${src}`; imgs.set(src, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  // x, z: drone position (m, -z north); heading: radians clockwise from north; mark: something to point at
  draw(loc: Sea, x: number, z: number, heading: number, mark: { x: number; z: number } | null, dots: { x: number; z: number; color: string }[] = []) {
    const m = meta?.[loc.id];
    // keep the canvas at the screen's own pixel density, so the photo stays sharp
    const css = this.cv.clientWidth || 168, want = Math.round(css * Math.min(3, devicePixelRatio || 1));
    if (this.cv.width !== want) { this.cv.width = this.cv.height = want; }
    const S = this.cv.width, c = this.ctx, k = 111320, cosl = Math.cos(loc.lat * Math.PI / 180);
    const lat = loc.lat - z / k, lon = loc.lon + x / (k * cosl);
    const mode = m?.near ? this.mode : 'region';
    c.clearRect(0, 0, S, S); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const u = S / css;   // (drawing in CSS pixels)
    let toPx: (la: number, lo: number) => [number, number];
    if (!m) {
      // No aerial imagery for a new habitat yet. Never leave the previous sea's photograph visible.
      c.fillStyle = '#102c2c'; c.fillRect(0, 0, S, S);
      const half = WORLD * 1.2;
      toPx = (la, lo) => [S * (0.5 + (lo - loc.lon) * k * cosl / (2 * half)), S * (0.5 + (loc.lat - la) * k / (2 * half))];
      c.strokeStyle = 'rgba(143,232,216,.16)'; c.lineWidth = u;
      for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(S * i / 6, 0); c.lineTo(S * i / 6, S); c.moveTo(0, S * i / 6); c.lineTo(S, S * i / 6); c.stroke(); }
      c.fillStyle = 'rgba(230,245,245,.85)'; c.font = `${10 * u}px sans-serif`;
      c.fillText('N ↑', 8 * u, 17 * u); c.fillText('位置図 · 航空写真未収録', 8 * u, S - 32 * u);
      c.font = `${9 * u}px sans-serif`; c.fillText('200 m', 8 * u, S - 16 * u); c.fillRect(8 * u, S - 12 * u, 200 / (2 * half) * S, 2 * u);
      this.note.textContent = `${Math.abs(loc.lat).toFixed(3)}°${loc.lat >= 0 ? 'N' : 'S'} ${Math.abs(loc.lon).toFixed(3)}°${loc.lon >= 0 ? 'E' : 'W'}`;
    } else if (mode === 'near') {
      const b = m.near!, im = this.img(`${loc.id}.jpg`); if (!im) return;
      const W = im.naturalWidth, fx = (lo: number) => (lo - b.west) / (b.east - b.west) * W, fy = (la: number) => (b.north - merc(la)) / (b.north - b.south) * W;
      const H = b.half || 420, mpp = (b.east - b.west) * k * cosl / W, half = H / mpp;      // this many metres either side of the drone
      const cx = fx(lon), cy = fy(lat);
      c.drawImage(im, cx - half, cy - half, half * 2, half * 2, 0, 0, S, S);
      toPx = (la, lo) => [(fx(lo) - cx + half) / (half * 2) * S, (fy(la) - cy + half) / (half * 2) * S];
      // the part of the sea that is modelled
      const [ax, ay] = toPx(loc.lat + WORLD / k, loc.lon - WORLD / (k * cosl)), [bx, by] = toPx(loc.lat - WORLD / k, loc.lon + WORLD / (k * cosl));
      c.strokeStyle = 'rgba(143, 232, 216, 0.55)'; c.setLineDash([4 * u, 3 * u]); c.lineWidth = u; c.strokeRect(ax, ay, bx - ax, by - ay); c.setLineDash([]);
      // scale bar: 200 m
      const len = H > 600 ? 500 : 200, bar = len / (2 * H) * S;
      c.fillStyle = 'rgba(230, 245, 245, 0.85)'; c.fillRect(8 * u, S - 12 * u, bar, 2 * u); c.font = `${9 * u}px sans-serif`; c.fillText(`${len} m`, 8 * u, S - 16 * u);
      this.note.textContent = loc.lat > 20 && loc.lat < 46 && loc.lon > 122 && loc.lon < 154 ? '国土地理院' : 'Sentinel-2 cloudless 2023 · EOX';
    } else {
      const b = m.region, im = this.img(`${loc.id}_r.jpg`); if (!im) return;
      // a 20-degree window around the site, cut from the mercator mosaic
      const W = im.naturalWidth, fx = (lo: number) => (lo - b.west) / (b.east - b.west) * W, fy = (la: number) => (b.north - merc(la)) / (b.north - b.south) * W;
      const half = 10 / (b.east - b.west) * W, cx = fx(loc.lon), cy = fy(loc.lat);
      c.drawImage(im, cx - half, cy - half, half * 2, half * 2, 0, 0, S, S);
      toPx = (la, lo) => [(fx(lo) - cx + half) / (half * 2) * S, (fy(la) - cy + half) / (half * 2) * S];
      c.fillStyle = 'rgba(230, 245, 245, 0.85)'; c.font = `${9 * u}px sans-serif`; c.fillText('500 km', 8 * u, S - 16 * u);
      c.fillRect(8 * u, S - 12 * u, 500 / (20 * 111.32 * cosl) * S, 2 * u);
      this.note.textContent = 'Sentinel-2 cloudless 2023 · EOX';
    }
    for (const d of dots) {   // the island's residents
      const [mx, my] = toPx(loc.lat - d.z / k, loc.lon + d.x / (k * cosl));
      c.fillStyle = d.color; c.strokeStyle = 'rgba(0, 20, 30, 0.85)'; c.lineWidth = 1.2 * u;
      c.beginPath(); c.arc(mx, my, 3 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    if (mark) {
      const [mx, my] = toPx(loc.lat - mark.z / k, loc.lon + mark.x / (k * cosl));
      c.fillStyle = 'rgba(255, 170, 90, 0.95)'; c.beginPath(); c.arc(mx, my, 3.5 * u, 0, Math.PI * 2); c.fill();
    }
    // the drone
    const [px, py] = toPx(lat, lon);
    c.save(); c.translate(px, py); c.rotate(heading); c.scale(u * 0.8, u * 0.8);
    c.fillStyle = '#8fe8d8'; c.strokeStyle = 'rgba(0, 20, 30, 0.8)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2.5); c.lineTo(-5, 5); c.closePath(); c.stroke(); c.fill();
    c.restore();
  }
}
