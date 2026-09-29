// Graphics tiers. Phones start on 'low', laptops on 'medium', desktop GPUs on 'high'; the app steps
// down a tier if the frame rate cannot keep up.
export type Tier = 'low' | 'medium' | 'high';

export interface TierSettings {
  label: string;
  dpr: number;          // cap on device pixel ratio
  post: boolean;        // HDR composite, tone mapping, lens
  vol: number;          // volumetric light steps (0 = billboard shafts instead)
  volScale: number;     // volumetric buffer resolution relative to the screen
  bloom: number;        // bloom mip levels (0 = off)
  shoal: number;        // fraction of each big school that is simulated and drawn
  grass: number;        // fraction of seagrass blades
  snow: number;         // fraction of marine snow particles
  coralVis: number;     // coral cells drawn out to this fraction of the visibility distance
  lodR: number;         // detailed coral within this many metres
  ao: number;           // screen-space ambient occlusion samples (0 = off)
}

export const TIERS: Record<Tier, TierSettings> = {
  low: { label: '軽量', dpr: 1.0, post: true, vol: 0, volScale: 0.25, bloom: 0, shoal: 0.35, grass: 0.4, snow: 0.5, coralVis: 0.65, lodR: 6, ao: 0 },
  medium: { label: '標準', dpr: 1.25, post: true, vol: 12, volScale: 0.35, bloom: 4, shoal: 0.65, grass: 0.75, snow: 0.8, coralVis: 0.85, lodR: 13, ao: 8 },
  high: { label: '高画質', dpr: 1.75, post: true, vol: 22, volScale: 0.5, bloom: 5, shoal: 1, grass: 1, snow: 1, coralVis: 1, lodR: 22, ao: 14 },
};

export function detectTier(gl: WebGL2RenderingContext | WebGLRenderingContext): Tier {
  if (matchMedia('(pointer: coarse)').matches) return 'low';
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).toLowerCase();
  } catch (e) { /* hidden by the browser */ }
  if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d (pro|max|ultra)/.test(name)) return 'high';
  if (/swiftshader|llvmpipe|software/.test(name)) return 'low';
  return 'medium';
}
