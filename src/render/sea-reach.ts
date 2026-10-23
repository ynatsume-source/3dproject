// How much of the sea reaches a point, read from the water map (ocean/water.ts, set by ocean/air.ts useWater): seaK, the
// swell's share, and tideReach, the tide's. Shared by the sea's surface (ocean/air.ts SWELL) and the reef out of the water
// (render/reef-lit.ts); guarded, so a shader can take it in twice.
export const SEA_REACH = /* glsl */ `
#ifndef SEA_REACH_DEF
#define SEA_REACH_DEF
uniform sampler2D uSeaK; uniform vec4 uSeaKBox;
float seaK(vec2 p){   // how much of the sea's swell reaches here: none into a pool, a little into a lagoon (src/ocean/water.ts)
  // (no early return and no read inside a branch: the texture is always read, and outside the map — or with
  // no map — the full swell is chosen by mix; ANGLE/D3D11 has gone white on a texture read behind a branch)
  vec2 uv = (p - uSeaKBox.xy) / max(uSeaKBox.z, 1e-3);
  float k = texture2D(uSeaK, clamp(uv, 0.0, 1.0)).r;
  float inside = step(0.5, uSeaKBox.w) * step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  return mix(1.0, k, inside);
}
// how much of the sea's rise and fall (the tide: uSeaH) reaches here — the sea, a lagoon and the low shore joined to them
// all of it, a pool or a pond none (its water stays at mean sea level: ADR 0009), eased over a cell at their edges. The
// same map's green (src/ocean/water.ts), read the same way.
float tideReach(vec2 p){
  vec2 uv = (p - uSeaKBox.xy) / max(uSeaKBox.z, 1e-3);
  float k = texture2D(uSeaK, clamp(uv, 0.0, 1.0)).g;
  float inside = step(0.5, uSeaKBox.w) * step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  return mix(1.0, k, inside);
}
#endif
`;
