// Lighting in the open air: sun (reddened low down), moon and sky; the photo already carries the look of the place, this
// only turns it with the time of day. (Here rather than in ocean/shore.ts, so the reef out of the water can use it too:
// render/reef-lit.ts. Guarded, so a shader can take it in twice.)
export const AIRLIT = /* glsl */ `
#ifndef AIRLIT_DEF
#define AIRLIT_DEF
vec3 airLit(vec3 alb, vec3 n, vec3 wp, float trans){
  float nl = dot(n, uAirSun);
  vec3 sun = sunAirCol() * (max(nl, 0.0) + trans * max(-nl, 0.0) * 0.6) * (1.0 - 0.7 * uCloud);
  vec3 moon = vec3(0.5, 0.55, 0.65) * max(dot(n, uAirMoon), 0.0) * uMoonI * 0.4;
  vec3 sky = skyAir(vec3(0.0, 1.0, 0.0), -1.0);
  sky = mix(vec3(dot(sky, vec3(0.3, 0.5, 0.2))), sky, 0.35) * (0.55 + 0.3 * n.y) + vec3(0.02, 0.025, 0.03);   // skylight, only faintly blue
  // Artistic night visibility only; uMoonI already includes lunar phase and altitude.
  vec3 nightFill = vec3(0.12, 0.15, 0.24) * uNight * (0.75 + 0.25 * n.y)
    * (1.0 - 0.5 * uCloud) * (1.0 - 0.7 * uMoonI);
  return alb * (sun * 0.8 + moon + sky * 0.55) + (alb * 0.4 + 0.3) * nightFill + lamp(alb, wp, n);
}
#endif
`;
