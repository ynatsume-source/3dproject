// The corner map: where the drone is on the real map. Close up, the aerial photograph around the site
// with the modelled area outlined and the drone as an arrow along its heading; tap for the region.
import type { Sea } from '../data/locations';

interface Bounds { west: number; east: number; north: number; south: number }
let meta: Record<string, { near?: Bounds; region: Bounds }> | null = null;
const imgs = new Map<string, HTMLImageElement>();
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const WORLD = 260;

export class MiniMap {
  private cv: HTMLCanvasElement; private ctx: CanvasRenderingContext2D; private note: HTMLElement;
  mode: 'near' | 'region' = 'near';
  constructor(el: HTMLElement) {
    this.cv = el.querySelector('canvas')!; this.ctx = this.cv.getContext('2d')!; this.note = el.querySelector('.cr') as HTMLElement;
    el.addEventListener('click', () => { this.mode = this.mode === 'near' ? 'region' : 'near'; });
    fetch(`${import.meta.env.BASE_URL}map/map.json`).then((r) => r.json()).then((m) => { meta = m; }).catch(() => {});
  }
  private img(src: string) {
    let im = imgs.get(src);
    if (!im) { im = new Image(); im.src = `${import.meta.env.BASE_URL}map/${src}`; imgs.set(src, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  // x, z: drone position (m, -z north); heading: radians clockwise from north; mark: something to point at
  draw(loc: Sea, x: number, z: number, heading: number, mark: { x: number; z: number } | null) {
    const m = meta?.[loc.id]; if (!m) return;
    const S = this.cv.width, c = this.ctx, k = 111320, cosl = Math.cos(loc.lat * Math.PI / 180);
    const lat = loc.lat - z / k, lon = loc.lon + x / (k * cosl);
    const mode = m.near ? this.mode : 'region';
    c.clearRect(0, 0, S, S);
    let toPx: (la: number, lo: number) => [number, number];
    if (mode === 'near') {
      const b = m.near!, im = this.img(`${loc.id}.jpg`); if (!im) return;
      const W = im.naturalWidth, fx = (lo: number) => (lo - b.west) / (b.east - b.west) * W, fy = (la: number) => (b.north - merc(la)) / (b.north - b.south) * W;
      const mpp = (b.east - b.west) * k * cosl / W, half = 420 / mpp;      // ±420 m around the drone
      const cx = fx(lon), cy = fy(lat);
      c.drawImage(im, cx - half, cy - half, half * 2, half * 2, 0, 0, S, S);
      toPx = (la, lo) => [(fx(lo) - cx + half) / (half * 2) * S, (fy(la) - cy + half) / (half * 2) * S];
      // the part of the sea that is modelled
      const [ax, ay] = toPx(loc.lat + WORLD / k, loc.lon - WORLD / (k * cosl)), [bx, by] = toPx(loc.lat - WORLD / k, loc.lon + WORLD / (k * cosl));
      c.strokeStyle = 'rgba(143, 232, 216, 0.55)'; c.setLineDash([4, 3]); c.lineWidth = 1; c.strokeRect(ax, ay, bx - ax, by - ay); c.setLineDash([]);
      // scale bar: 200 m
      const bar = 200 / (840) * S;
      c.fillStyle = 'rgba(230, 245, 245, 0.85)'; c.fillRect(8, S - 12, bar, 2); c.font = '9px sans-serif'; c.fillText('200 m', 8, S - 16);
      this.note.textContent = loc.id === 'miyako' ? '国土地理院' : 'Sentinel-2 cloudless · EOX';
    } else {
      const b = m.region, im = this.img(`${loc.id}_r.jpg`); if (!im) return;
      c.drawImage(im, 0, 0, S, S);
      toPx = (la, lo) => [(lo - b.west) / (b.east - b.west) * S, (b.north - la) / (b.north - b.south) * S];
      c.fillStyle = 'rgba(230, 245, 245, 0.85)'; c.font = '9px sans-serif'; c.fillText('500 km', 8, S - 16);
      c.fillRect(8, S - 12, 500 / (20 * 111.32) * S, 2);
      this.note.textContent = 'NASA Blue Marble';
    }
    if (mark) {
      const [mx, my] = toPx(loc.lat - mark.z / k, loc.lon + mark.x / (k * cosl));
      c.fillStyle = 'rgba(255, 170, 90, 0.95)'; c.beginPath(); c.arc(mx, my, 3.5, 0, Math.PI * 2); c.fill();
    }
    // the drone
    const [px, py] = toPx(lat, lon);
    c.save(); c.translate(px, py); c.rotate(heading);
    c.fillStyle = '#8fe8d8'; c.strokeStyle = 'rgba(0, 20, 30, 0.8)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2.5); c.lineTo(-5, 5); c.closePath(); c.stroke(); c.fill();
    c.restore();
  }
}
