// The reef out of the water (ADR 0009: the tide). Under the sea a reef surface is lit as before (render/common.ts shade:
// through the water, with caustics); where it stands above the still water there (the sea's height uSeaH where the tide
// reaches — tideReach, render/sea-reach.ts —, mean sea level in a pool cut off from the sea) it is lit by the open air
// instead (render/airlit.ts), as the island is — no caustics, no water's light — and it is wet: darker and deeper in
// colour, with the sky and the sun glinting off it. What the waves still wash (a hand's breadth over the water) is wet
// through; above that it dries the longer the water has been gone: wet at the waterline, dry at the line the water stood
// at a while ago there (uWetH where the tide reaches, ocean/wet.ts — from the time alone, so a reload or a jump in time
// shows the same reef; a pool's water does not fall, so nothing in it is left wet by the tide). Reef within half a metre
// of the water keeps a little damp. The look only: nothing here moves a coral, a rock or the sea.
import { AIRLIT } from './airlit';
import { SEA_REACH } from './sea-reach';

export const REEF_LIT = AIRLIT + SEA_REACH + /* glsl */ `
#ifndef REEF_LIT_DEF
#define REEF_LIT_DEF
// how wet a surface out of the water is, 0 dry .. 1 wet through; h: how high above the still water it stands (m), fell:
// how far above the water now it stood a while ago (m)
float reefWet(float h, float fellH){
  float wash = 1.0 - smoothstep(0.04, 0.12, h);                           // (the waves still wash it)
  float fell = 1.0 - smoothstep(0.0, max(fellH, 1e-3), h);                // (the water left it only a little while ago)
  float damp = 0.25 * (1.0 - smoothstep(0.3, 0.6, h));                     // (close over the water: never quite dry)
  return max(max(wash, fell * 0.85), damp);
}
vec3 reefLit(vec3 alb, vec3 wp, vec3 n, float causAmt){
  float k = tideReach(wp.xz), top = uSeaH * k;                              // (the still water's top here: read outside the branch)
  float up = smoothstep(top - 0.005, top + 0.025, wp.y);                    // (out of the water: over a thin edge)
  vec3 col = shade(alb, wp, n, causAmt * (1.0 - up));
  // (the glint only where the surface's bends are wider than a pixel: on fine coral and far off it would only twinkle
  // as the view moves — taken outside the branch)
  float sharp = 1.0 - smoothstep(0.08, 0.35, length(fwidth(n)));
  if (up > 0.0) {   // (no texture is read in here: ANGLE/D3D11)
    float wet = reefWet(wp.y - top, (uWetH - uSeaH) * k);
    // (the reef's colours are made for the light under the water, which shade lifts by 1.6 and adds its caustics to; in
    // the open air a little more, so a reef flat out of the water is about as bright as it was under it, and as the beach)
    vec3 a = alb * 2.0 * mix(1.0, 0.7, wet);
    a = max(mix(vec3(dot(a, vec3(0.3, 0.5, 0.2))), a, 1.0 + 0.3 * wet), 0.0);   // (wet: darker, and deeper in colour)
    vec3 v = normalize(uCamPos - wp), r = reflect(-v, n);
    float fr = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 glint = skyAir(r, -1.0) * fr * 0.3 + sunAirCol() * pow(max(dot(r, uAirSun), 0.0), 16.0) * (1.0 - 0.7 * uCloud) * 0.45;
    col = mix(col, fogIt(airLit(a, n, wp, 0.0) + glint * wet * sharp, wp), up);
  }
  return col;
}
#endif
`;
