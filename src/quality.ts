// Graphics tiers, five steps. The start is a guess from the device (its GPU, a touch screen, its memory)
// or what this device settled on last time; then the app measures how it runs and moves a step up while
// there is room, or down when it cannot keep up (main.ts). Light-filled hours — dawn, dusk, the shafts
// under water — gain most from the steps above the lightest, so a device is given the best it runs smoothly.
export type Tier = 'low' | 'lite' | 'medium' | 'high' | 'ultra';
export const TIER_ORDER: Tier[] = ['low', 'lite', 'medium', 'high', 'ultra'];

export interface TierSettings {
  label: string;
  dpr: number;          // cap on device pixel ratio
  post: boolean;        // HDR composite, tone mapping, lens
  vol: number;          // volumetric light steps (0 = billboard shafts instead)
  volScale: number;     // volumetric buffer resolution relative to the screen
  bloom: number;        // bloom mip levels (0 = off)
  shoal: number;        // fraction of each big school that is simulated and drawn (never under half: owner, 2026-10 — a sea
                        // thinned of fish to save effort is the wrong saving; the light and the resolution go first)
  grass: number;        // fraction of seagrass blades
  grassTile: number;    // seagrass is drawn within a tile of this many metres round the drone (the blades per square metre
                        // kept: a smaller tile only ends the meadow nearer, where the water has mostly hidden it)
  grassFlat: boolean;   // leaves of three segments, not folded along the midrib (8 vertices a leaf rather than 15)
  snow: number;         // fraction of marine snow particles
  coralVis: number;     // coral cells drawn out to this fraction of the visibility distance
  lodR: number;         // detailed coral within this many metres
  ao: number;           // screen-space ambient occlusion samples (0 = off)
  msaa: number;         // multisampling of the scene's own drawing (post chain): thin things — seagrass, coral branches, leaves,
                        // the tree line far off — no longer crawl and twinkle along their edges as the view moves (0: none)
  minScale: number;     // the view may be drawn down to this fraction of the screen's resolution while the frames run slow
                        // (main.ts, renderScale: the picture softens a little before anything is left out of it)
}

export const TIERS: Record<Tier, TierSettings> = {
  low: { label: '最軽量', dpr: 1.0, post: true, vol: 0, volScale: 0.25, bloom: 0, shoal: 0.5, grass: 0.4, grassTile: 32, grassFlat: true, snow: 0.5, coralVis: 0.65, lodR: 6, ao: 0, minScale: 0.6, msaa: 0 },
  // light, but with the light in it: a small volumetric pass and bloom at screen resolution (phones that can)
  lite: { label: 'バランス', dpr: 1.0, post: true, vol: 8, volScale: 0.25, bloom: 3, shoal: 0.65, grass: 0.55, grassTile: 40, grassFlat: false, snow: 0.65, coralVis: 0.75, lodR: 9, ao: 0, minScale: 0.7, msaa: 4 },
  medium: { label: '標準', dpr: 1.25, post: true, vol: 12, volScale: 0.35, bloom: 4, shoal: 0.75, grass: 0.75, grassTile: 50, grassFlat: false, snow: 0.8, coralVis: 0.85, lodR: 13, ao: 8, minScale: 0.8, msaa: 4 },
  high: { label: '高画質', dpr: 1.75, post: true, vol: 22, volScale: 0.5, bloom: 5, shoal: 1, grass: 1, grassTile: 50, grassFlat: false, snow: 1, coralVis: 1, lodR: 22, ao: 14, minScale: 0.85, msaa: 4 },
  ultra: { label: '最高', dpr: 2.0, post: true, vol: 30, volScale: 0.6, bloom: 6, shoal: 1, grass: 1, grassTile: 50, grassFlat: false, snow: 1, coralVis: 1, lodR: 30, ao: 18, minScale: 0.85, msaa: 4 },
};

/** A first guess from the device, before anything has been measured. */
export function detectTier(gl: WebGL2RenderingContext | WebGLRenderingContext): Tier {
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).toLowerCase();
  } catch (e) { /* hidden by the browser */ }
  if (/swiftshader|llvmpipe|software/.test(name)) return 'low';
  const mem = (navigator as any).deviceMemory as number | undefined;   // (GB, Chrome only; rounded)
  if (matchMedia('(pointer: coarse)').matches) {
    // a phone or tablet: the recent GPUs start with the light in (and may step up from there); others lightest
    if (mem !== undefined && mem <= 3) return 'low';
    if (/apple gpu|adreno.*\b(6[4-9]\d|7\d\d|8\d\d)\b|mali-g(7[1-9]|[6-9]\d\d)|immortalis|xclipse/.test(name)) return 'lite';
    return 'low';
  }
  if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d (pro|max|ultra)/.test(name)) return 'high';
  // the graphics built into a PC's processor: the newer ones (Iris Xe, Arc, AMD's Radeon Graphics) start light
  // with the light in; the older Intel ones (UHD, HD, Iris Plus: most business PCs of a few years ago) lightest
  if (/iris\(r\) xe|iris xe|intel.*arc|radeon\(tm\) graphics|radeon graphics|radeon.*vega/.test(name)) return 'lite';
  if (/intel/.test(name)) return 'low';
  return 'medium';
}
