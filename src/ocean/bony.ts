// Big bony fish (half a metre and up), lofted like the sharks from real proportions rather than squeezed out
// of a sphere: a body of rings through side-profile keys (top, belly, half-width), thick lips with the gape
// between them, a cheek and gill cover that breathe, a domed eye, and fins cut from their outlines with their
// rays — the soft ones fanned from the root, the spiny dorsal scalloped between its spines. Same frame as
// fishGeometry: snout at +z, 1.28 long from the lips to the tip of the tail.
//
// Each vertex carries aB for the shader (fishMaterial, BONY):
//   body (aFin 0)     s along the fish (0 lips … 1 tail tip), around (0…1, from the right flank upward),
//                     how far behind the gill cover's edge (in s; the cover's height is uGill), lower-jaw weight
//   fins (1, 2, 3)    ray coordinate (one ray per unit), out along the rays (0 root … 1 edge), and for the
//                     pectorals the root (z, |x|) they row about
//   eye (7)           the disc (x, y in −1…1)
import * as THREE from 'three';
import { smooth, hyp } from '../core/math';

const L = 1.28, Z = (s: number) => 0.5 - L * s;

export interface BonyStyle {
  body: number[][];              // [s, top, belly, half-width] (fractions of the length; top and belly from the axis)
  wide?: number;                 // where the flank is widest, as a share of the height up from the belly (0.45)
  mouth: { s: number; y: number; lip: number; slope?: number; teeth?: number };   // the corner of the mouth, the gape's height at the
                                 // front and how it runs back (per unit s), the lips' fullness, how much the teeth show
  eye: { s: number; y: number; r: number };
  gill: number;                  // s of the gill cover's back edge at mid flank
  dorsal: number[][];            // outlines: [s, height above the back]
  dorsal2?: number[][];          //   (a second dorsal, apart from the first)
  spineEnd?: number;             //   (where the spiny part of the dorsal ends; else where it first rises past 0.044)
  finlets?: number;              //   (tunas: small finlets along the back and belly between the second dorsal and anal and the tail)
  anal: number[][];              //           [s, depth below the belly]
  tail: number[][];              //           [s, y]
  pect: { s: number; y: number; open: number; fin: number[][] };   // root, angle out from the flank, outline [back, y]
  pelvic: { s: number; fin: number[][] };
  spines: number;                // spines along the front of the dorsal
  rays: { dorsal: number; tail: number; pect: number };   // ray spacing (dorsal: in s; tail, pect: radians)
  scales: [number, number];      // scale rows: along (per unit s) and around the body
  row: number;                   // how far the pectorals swing as they row (radians; 0 for a fish that swims with its tail)
  iris: number[];
  look: number;                  // which skin the shader paints (BONY: 1 Napoleon, 2 giant grouper, 3 coral trout, 4 bumphead
                                 // parrotfish, 5 trevally, 6 barracuda, 7 dogtooth tuna, 8 titan triggerfish)
  scaleK?: number;               // how plainly the scales show (1; tunas and groupers have small ones, the skin's pattern over them)
  rip?: number;                  // how far the soft dorsal and anal ripple (triggerfish swim on them)
}

export const BONY: Record<string, BonyStyle> = {
  // Humphead (Napoleon) wrasse, Cheilinus undulatus: deep and heavy-shouldered, the forehead rising almost
  // straight up from thick, fleshy lips into the hump; a small eye high on the head; a long low spiny dorsal
  // running into a tall rounded soft rear; a rounded fan of a tail; broad rounded pectorals it rows with.
  napoleon: {
    body: [[0, 0.004, -0.016, 0.008], [0.012, 0.024, -0.034, 0.026], [0.03, 0.044, -0.05, 0.04], [0.06, 0.106, -0.07, 0.055], [0.095, 0.16, -0.088, 0.068],
      [0.13, 0.188, -0.102, 0.077], [0.17, 0.195, -0.114, 0.082], [0.23, 0.188, -0.124, 0.086], [0.3, 0.184, -0.127, 0.085], [0.4, 0.172, -0.121, 0.078],
      [0.5, 0.149, -0.106, 0.066], [0.6, 0.113, -0.081, 0.049], [0.68, 0.079, -0.057, 0.032], [0.735, 0.06, -0.044, 0.022], [0.775, 0.054, -0.04, 0.016], [0.79, 0.04, -0.03, 0.01]],
    wide: 0.42,
    mouth: { s: 0.05, y: -0.016, lip: 1 },
    eye: { s: 0.098, y: 0.062, r: 0.014 },
    gill: 0.205,
    dorsal: [[0.19, 0], [0.215, 0.03], [0.3, 0.036], [0.4, 0.04], [0.46, 0.046], [0.53, 0.062], [0.6, 0.078], [0.66, 0.08], [0.705, 0.066], [0.735, 0.036], [0.75, 0.008], [0.745, 0]],
    anal: [[0.47, 0], [0.5, 0.03], [0.56, 0.05], [0.62, 0.066], [0.67, 0.068], [0.71, 0.054], [0.735, 0.028], [0.745, 0.004], [0.74, 0]],
    tail: [[0.755, 0.05], [0.8, 0.08], [0.86, 0.104], [0.92, 0.106], [0.965, 0.088], [0.99, 0.05], [1, 0.006], [0.99, -0.042], [0.962, -0.082], [0.915, -0.1], [0.855, -0.096], [0.8, -0.072], [0.755, -0.038]],
    pect: { s: 0.218, y: -0.014, open: 0.5, fin: [[0, 0.016], [0.035, 0.036], [0.08, 0.044], [0.12, 0.032], [0.14, 0.006], [0.135, -0.022], [0.11, -0.042], [0.07, -0.05], [0.03, -0.042], [0, -0.026]] },
    pelvic: { s: 0.27, fin: [[0, 0.012], [0.05, 0.006], [0.075, -0.004], [0.06, -0.012], [0, -0.008]] },
    spines: 9,
    rays: { dorsal: 0.024, tail: 0.13, pect: 0.15 },
    scales: [40, 36], row: 0.42, iris: [0.72, 0.58, 0.22], look: 1,
  },
  // Giant grouper, Epinephelus lanceolatus: massive and thick-set, a broad head a third of the fish with a
  // huge mouth whose jaw juts a little; small eyes; a long low spiny dorsal, rounded soft fins, a rounded
  // tail; big round pectorals it fans while it hangs in the water.
  tamakai: {
    body: [[0, 0, -0.026, 0.012], [0.015, 0.03, -0.046, 0.04], [0.04, 0.06, -0.07, 0.07], [0.08, 0.094, -0.092, 0.095], [0.13, 0.122, -0.11, 0.108],
      [0.2, 0.142, -0.124, 0.112], [0.3, 0.15, -0.13, 0.108], [0.4, 0.146, -0.122, 0.098], [0.5, 0.128, -0.105, 0.08], [0.6, 0.1, -0.08, 0.058],
      [0.68, 0.073, -0.058, 0.04], [0.735, 0.06, -0.048, 0.028], [0.775, 0.055, -0.045, 0.02], [0.79, 0.04, -0.032, 0.012]],
    wide: 0.4,
    mouth: { s: 0.1, y: -0.014, lip: 0.45, slope: 0.08, teeth: 0.25 },
    eye: { s: 0.085, y: 0.072, r: 0.011 },
    gill: 0.25,
    dorsal: [[0.24, 0], [0.26, 0.038], [0.33, 0.048], [0.42, 0.05], [0.5, 0.052], [0.56, 0.068], [0.63, 0.082], [0.69, 0.078], [0.73, 0.05], [0.75, 0.01], [0.745, 0]],
    spineEnd: 0.5,
    anal: [[0.55, 0], [0.58, 0.04], [0.63, 0.068], [0.68, 0.07], [0.72, 0.05], [0.74, 0.01], [0.735, 0]],
    tail: [[0.755, 0.05], [0.81, 0.084], [0.88, 0.1], [0.94, 0.09], [0.98, 0.056], [0.996, 0.006], [0.98, -0.045], [0.94, -0.08], [0.88, -0.09], [0.81, -0.074], [0.755, -0.04]],
    pect: { s: 0.265, y: -0.02, open: 0.45, fin: [[0, 0.02], [0.04, 0.045], [0.09, 0.056], [0.135, 0.042], [0.156, 0.006], [0.146, -0.03], [0.11, -0.05], [0.06, -0.056], [0.02, -0.046], [0, -0.03]] },
    pelvic: { s: 0.3, fin: [[0, 0.014], [0.06, 0.008], [0.085, -0.004], [0.065, -0.014], [0, -0.01]] },
    spines: 11,
    rays: { dorsal: 0.022, tail: 0.12, pect: 0.13 },
    scales: [64, 50], row: 0.28, iris: [0.55, 0.46, 0.26], look: 2, scaleK: 0.45,
  },
  // Leopard coral trout, Plectropomus leopardus: a slimmer grouper with a pointed head and a jutting jaw with
  // canines at the front; a squarish tail; red, with small blue spots ringed dark.
  sujiara: {
    body: [[0, -0.002, -0.022, 0.008], [0.015, 0.018, -0.036, 0.026], [0.045, 0.042, -0.054, 0.046], [0.09, 0.07, -0.072, 0.062], [0.14, 0.092, -0.086, 0.07],
      [0.2, 0.108, -0.096, 0.072], [0.3, 0.116, -0.1, 0.068], [0.4, 0.112, -0.094, 0.06], [0.5, 0.098, -0.082, 0.05], [0.6, 0.076, -0.064, 0.038],
      [0.68, 0.056, -0.047, 0.027], [0.735, 0.046, -0.04, 0.02], [0.775, 0.044, -0.038, 0.015], [0.79, 0.032, -0.027, 0.01]],
    wide: 0.42,
    mouth: { s: 0.1, y: -0.012, lip: 0.25, slope: 0.07, teeth: 0.3 },
    eye: { s: 0.088, y: 0.05, r: 0.012 },
    gill: 0.24,
    dorsal: [[0.25, 0], [0.27, 0.034], [0.34, 0.04], [0.43, 0.036], [0.48, 0.034], [0.53, 0.056], [0.6, 0.064], [0.67, 0.06], [0.72, 0.04], [0.745, 0.008], [0.74, 0]],
    spineEnd: 0.48,
    anal: [[0.56, 0], [0.585, 0.04], [0.63, 0.058], [0.68, 0.056], [0.72, 0.036], [0.74, 0.008], [0.735, 0]],
    tail: [[0.755, 0.04], [0.82, 0.07], [0.9, 0.092], [0.95, 0.098], [0.945, 0.05], [0.94, 0.0], [0.945, -0.05], [0.95, -0.092], [0.9, -0.086], [0.82, -0.064], [0.755, -0.034]],
    pect: { s: 0.255, y: -0.012, open: 0.42, fin: [[0, 0.016], [0.04, 0.034], [0.09, 0.04], [0.125, 0.026], [0.135, 0.0], [0.12, -0.026], [0.08, -0.04], [0.035, -0.036], [0, -0.024]] },
    pelvic: { s: 0.29, fin: [[0, 0.012], [0.055, 0.006], [0.075, -0.004], [0.058, -0.012], [0, -0.008]] },
    spines: 8,
    rays: { dorsal: 0.022, tail: 0.11, pect: 0.13 },
    scales: [70, 52], row: 0.25, iris: [0.7, 0.42, 0.22], look: 3, scaleK: 0.35,
  },
  // Bumphead parrotfish, Bolbometopon muricatum: big and deep, the forehead a sheer bulging wall above a beak of
  // fused teeth left bare by the lips; big scales; a low dorsal; a tail cut square with its corners drawn out.
  kanmuri: {
    body: [[0, -0.004, -0.032, 0.012], [0.012, 0.06, -0.05, 0.036], [0.03, 0.13, -0.07, 0.056], [0.05, 0.172, -0.086, 0.072], [0.08, 0.2, -0.1, 0.086],
      [0.12, 0.21, -0.11, 0.093], [0.18, 0.206, -0.12, 0.095], [0.28, 0.198, -0.13, 0.094], [0.4, 0.186, -0.126, 0.085], [0.5, 0.162, -0.11, 0.07],
      [0.6, 0.122, -0.085, 0.05], [0.68, 0.086, -0.062, 0.034], [0.74, 0.068, -0.05, 0.024], [0.78, 0.062, -0.046, 0.018], [0.79, 0.046, -0.034, 0.012]],
    wide: 0.4,
    mouth: { s: 0.032, y: -0.028, lip: 0.35, slope: 0.05 },
    eye: { s: 0.1, y: 0.03, r: 0.012 },
    gill: 0.215,
    dorsal: [[0.2, 0], [0.22, 0.034], [0.35, 0.04], [0.5, 0.042], [0.6, 0.048], [0.68, 0.05], [0.72, 0.04], [0.745, 0.01], [0.74, 0]],
    spineEnd: 0.47,
    anal: [[0.5, 0], [0.53, 0.036], [0.62, 0.046], [0.7, 0.046], [0.735, 0.02], [0.74, 0]],
    tail: [[0.755, 0.056], [0.82, 0.09], [0.9, 0.122], [0.94, 0.13], [0.918, 0.08], [0.905, 0.0], [0.918, -0.08], [0.94, -0.122], [0.9, -0.112], [0.82, -0.08], [0.755, -0.046]],
    pect: { s: 0.225, y: -0.012, open: 0.45, fin: [[0, 0.016], [0.05, 0.032], [0.1, 0.032], [0.132, 0.012], [0.124, -0.02], [0.084, -0.036], [0.03, -0.032], [0, -0.022]] },
    pelvic: { s: 0.29, fin: [[0, 0.012], [0.05, 0.006], [0.07, -0.004], [0.055, -0.012], [0, -0.008]] },
    spines: 9,
    rays: { dorsal: 0.024, tail: 0.11, pect: 0.15 },
    scales: [26, 24], row: 0.45, iris: [0.72, 0.6, 0.32], look: 4,
  },
  // Giant trevally, Caranx ignobilis (and the bluefin trevally): deep and flat-sided, a steep blunt head, a
  // short spiny first dorsal and a sickle-fronted second, long sickle pectorals, a narrow tail stock armoured
  // with scutes and a deeply forked tail. Swims with its tail.
  jack: {
    body: [[0, 0.01, -0.02, 0.008], [0.015, 0.04, -0.035, 0.022], [0.04, 0.086, -0.06, 0.035], [0.08, 0.14, -0.09, 0.048], [0.13, 0.176, -0.116, 0.056],
      [0.2, 0.19, -0.136, 0.06], [0.28, 0.186, -0.14, 0.058], [0.38, 0.164, -0.125, 0.05], [0.48, 0.124, -0.095, 0.04], [0.58, 0.07, -0.055, 0.028],
      [0.66, 0.034, -0.03, 0.02], [0.71, 0.024, -0.022, 0.018], [0.74, 0.022, -0.02, 0.016], [0.75, 0.015, -0.014, 0.01]],
    wide: 0.44,
    mouth: { s: 0.065, y: -0.014, lip: 0.15, slope: -0.04 },
    eye: { s: 0.082, y: 0.036, r: 0.016 },
    gill: 0.19,
    dorsal: [[0.2, 0], [0.225, 0.042], [0.26, 0.05], [0.3, 0.036], [0.335, 0.01], [0.335, 0]],
    spineEnd: 0.34,
    dorsal2: [[0.355, 0], [0.37, 0.092], [0.4, 0.078], [0.46, 0.042], [0.6, 0.024], [0.68, 0.014], [0.7, 0]],
    anal: [[0.45, 0], [0.465, 0.072], [0.495, 0.056], [0.56, 0.03], [0.66, 0.014], [0.69, 0]],
    tail: [[0.725, 0.02], [0.78, 0.07], [0.85, 0.135], [0.9, 0.175], [0.915, 0.18], [0.885, 0.12], [0.85, 0.06], [0.832, 0], [0.85, -0.06], [0.885, -0.12], [0.915, -0.18], [0.9, -0.175], [0.85, -0.135], [0.78, -0.07], [0.725, -0.02]],
    pect: { s: 0.2, y: -0.03, open: 0.18, fin: [[0, 0.012], [0.06, 0.02], [0.14, 0.016], [0.22, 0.004], [0.25, -0.004], [0.18, -0.01], [0.08, -0.014], [0.02, -0.016], [0, -0.012]] },
    pelvic: { s: 0.24, fin: [[0, 0.01], [0.04, 0.005], [0.06, -0.003], [0.045, -0.01], [0, -0.007]] },
    spines: 7,
    rays: { dorsal: 0.016, tail: 0.075, pect: 0.1 },
    scales: [90, 60], row: 0, iris: [0.62, 0.62, 0.55], look: 5, scaleK: 0.12,
  },
  // Great barracuda, Sphyraena barracuda: long and nearly round in section, a pointed head with the lower jaw
  // jutting past the upper and fangs along both; two small dorsals far apart; a forked tail.
  barracuda: {
    body: [[0, -0.002, -0.012, 0.006], [0.02, 0.012, -0.022, 0.016], [0.06, 0.03, -0.035, 0.03], [0.12, 0.048, -0.05, 0.042], [0.2, 0.06, -0.06, 0.05],
      [0.3, 0.066, -0.066, 0.053], [0.42, 0.064, -0.064, 0.05], [0.55, 0.056, -0.056, 0.042], [0.65, 0.042, -0.042, 0.032], [0.73, 0.03, -0.03, 0.022],
      [0.78, 0.024, -0.024, 0.016], [0.8, 0.016, -0.016, 0.01]],
    wide: 0.45,
    mouth: { s: 0.1, y: -0.006, lip: 0, slope: 0.02, teeth: 1 },
    eye: { s: 0.115, y: 0.02, r: 0.012 },
    gill: 0.2,
    dorsal: [[0.34, 0], [0.355, 0.05], [0.37, 0.055], [0.39, 0.035], [0.42, 0.01], [0.43, 0]],
    spineEnd: 0.44,
    dorsal2: [[0.6, 0], [0.615, 0.045], [0.64, 0.03], [0.67, 0.012], [0.68, 0]],
    anal: [[0.62, 0], [0.635, 0.04], [0.66, 0.025], [0.69, 0.01], [0.695, 0]],
    tail: [[0.775, 0.02], [0.85, 0.07], [0.94, 0.115], [0.955, 0.118], [0.93, 0.07], [0.9, 0.022], [0.89, 0], [0.9, -0.022], [0.93, -0.07], [0.955, -0.118], [0.94, -0.115], [0.85, -0.07], [0.775, -0.02]],
    pect: { s: 0.2, y: -0.018, open: 0.3, fin: [[0, 0.01], [0.05, 0.015], [0.085, 0.005], [0.075, -0.008], [0.03, -0.012], [0, -0.01]] },
    pelvic: { s: 0.4, fin: [[0, 0.008], [0.04, 0.004], [0.055, -0.003], [0.04, -0.008], [0, -0.006]] },
    spines: 5,
    rays: { dorsal: 0.012, tail: 0.07, pect: 0.12 },
    scales: [120, 60], row: 0, iris: [0.75, 0.72, 0.62], look: 6, scaleK: 0.1,
  },
  // Dogtooth tuna, Gymnosarda unicolor: a spindle, round in section, the tail stock thin and keeled; a long
  // spiny first dorsal, a sickle second dorsal and anal, a row of finlets above and below to the tail, and a
  // stiff crescent of a tail.
  tuna: {
    body: [[0, 0, -0.008, 0.006], [0.02, 0.02, -0.024, 0.02], [0.06, 0.045, -0.045, 0.04], [0.12, 0.07, -0.065, 0.06], [0.2, 0.088, -0.08, 0.072],
      [0.3, 0.094, -0.086, 0.076], [0.42, 0.088, -0.08, 0.07], [0.55, 0.064, -0.058, 0.05], [0.65, 0.038, -0.034, 0.03], [0.72, 0.02, -0.018, 0.02],
      [0.76, 0.014, -0.013, 0.016], [0.77, 0.01, -0.01, 0.01]],
    wide: 0.47,
    mouth: { s: 0.07, y: -0.004, lip: 0, slope: -0.03, teeth: 0.5 },
    eye: { s: 0.078, y: 0.026, r: 0.012 },
    gill: 0.19,
    dorsal: [[0.22, 0], [0.24, 0.06], [0.27, 0.055], [0.33, 0.03], [0.4, 0.012], [0.42, 0]],
    spineEnd: 0.43,
    dorsal2: [[0.47, 0], [0.49, 0.062], [0.515, 0.045], [0.545, 0.012], [0.55, 0]],
    anal: [[0.5, 0], [0.52, 0.052], [0.545, 0.036], [0.565, 0.01], [0.57, 0]],
    finlets: 6,
    tail: [[0.745, 0.012], [0.8, 0.06], [0.88, 0.15], [0.905, 0.17], [0.86, 0.1], [0.83, 0.03], [0.822, 0], [0.83, -0.03], [0.86, -0.1], [0.905, -0.17], [0.88, -0.15], [0.8, -0.06], [0.745, -0.012]],
    pect: { s: 0.2, y: 0.004, open: 0.35, fin: [[0, 0.012], [0.06, 0.012], [0.12, 0], [0.1, -0.01], [0.04, -0.014], [0, -0.012]] },
    pelvic: { s: 0.22, fin: [[0, 0.008], [0.035, 0.004], [0.05, -0.003], [0.035, -0.008], [0, -0.006]] },
    spines: 13,
    rays: { dorsal: 0.014, tail: 0.06, pect: 0.12 },
    scales: [120, 70], row: 0, iris: [0.55, 0.58, 0.55], look: 7, scaleK: 0.06,
  },
  // Titan triggerfish, Balistoides viridescens: deep and rhomboid, the snout long and sloping to a small mouth
  // of strong teeth, the eye set high and far back; the trigger spine; tall soft dorsal and anal that it swims
  // on, waving, the tail kept nearly still; a tail cut square with drawn-out corners.
  trigger: {
    body: [[0, 0.008, -0.01, 0.008], [0.015, 0.025, -0.025, 0.02], [0.05, 0.06, -0.06, 0.035], [0.1, 0.11, -0.1, 0.05], [0.16, 0.16, -0.14, 0.06],
      [0.22, 0.2, -0.17, 0.066], [0.3, 0.21, -0.19, 0.066], [0.4, 0.19, -0.18, 0.06], [0.5, 0.15, -0.14, 0.05], [0.58, 0.1, -0.095, 0.036],
      [0.64, 0.06, -0.055, 0.026], [0.69, 0.045, -0.04, 0.02], [0.72, 0.04, -0.035, 0.016], [0.735, 0.03, -0.026, 0.01]],
    wide: 0.48,
    mouth: { s: 0.022, y: 0.0, lip: 0.4, slope: 0, teeth: 0.8 },
    eye: { s: 0.21, y: 0.095, r: 0.014 },
    gill: 0.25,
    dorsal: [[0.27, 0], [0.285, 0.09], [0.3, 0.08], [0.33, 0.03], [0.36, 0]],
    spineEnd: 0.37,
    dorsal2: [[0.43, 0], [0.45, 0.08], [0.5, 0.07], [0.58, 0.045], [0.66, 0.02], [0.68, 0]],
    anal: [[0.43, 0], [0.45, 0.075], [0.5, 0.065], [0.58, 0.04], [0.66, 0.018], [0.68, 0]],
    tail: [[0.715, 0.035], [0.78, 0.07], [0.85, 0.1], [0.875, 0.108], [0.86, 0.05], [0.865, 0], [0.86, -0.05], [0.875, -0.108], [0.85, -0.1], [0.78, -0.07], [0.715, -0.03]],
    pect: { s: 0.26, y: 0.0, open: 0.4, fin: [[0, 0.012], [0.04, 0.022], [0.07, 0.014], [0.075, -0.004], [0.05, -0.016], [0, -0.012]] },
    pelvic: { s: 0.4, fin: [[0, 0.006], [0.03, 0.003], [0.04, -0.002], [0.03, -0.006], [0, -0.004]] },
    spines: 3,
    rays: { dorsal: 0.012, tail: 0.1, pect: 0.15 },
    scales: [32, 30], row: 0.3, iris: [0.62, 0.6, 0.3], look: 8, rip: 0.035,
  },
};

// how high the gill cover reaches, above and below the axis (fractions of the length)
function gillSpan(S: BonyStyle) {
  let i = 0; while (i < S.body.length - 2 && S.body[i + 1][0] < S.gill) i++;
  const k = S.body[i], t = (S.gill - k[0]) / (S.body[i + 1][0] - k[0]), top = k[1] + (S.body[i + 1][1] - k[1]) * t, bot = k[2] + (S.body[i + 1][2] - k[2]) * t;
  return [top * 0.6, bot * 0.62];
}
export function bonyGeometry(name: string) {
  const S = BONY[name], K = S.body, sb = K[K.length - 1][0], wide = S.wide ?? 0.45;
  // Catmull-Rom through the body keys
  const at = (s: number) => {
    let i = 0; while (i < K.length - 2 && K[i + 1][0] < s) i++;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
    const t = Math.min(1, Math.max(0, (s - p1[0]) / Math.max(p2[0] - p1[0], 1e-6))), t2 = t * t, t3 = t2 * t;
    const cr = (j: number) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3);
    return [cr(1), cr(2), Math.max(0.002, cr(3))];
  };
  const M = S.mouth;
  // a point on the skin: s along, a around (0 = right flank, π/2 = the back); also its gill-cover and jaw weights
  const skin = (s: number, a: number) => {
    const [top, bot, w] = at(s), ym = bot + (top - bot) * wide;
    const ca = Math.cos(a), sa = Math.sin(a);
    let x = ca * w * (1 - 0.3 * Math.max(sa, 0) ** 2), y = ym + (sa >= 0 ? top - ym : ym - bot) * sa;   // (narrower toward the back: a teardrop section)
    // the lips: two fleshy rolls with the gape between, running back to the corner of the mouth
    const lipK = M.lip * (1 - smooth(M.s * 0.7, M.s * 1.15, s)), gy = M.y + (M.slope ?? 0.12 * M.y) * s;
    if (lipK > 0) {
      const d = y - gy, roll = Math.exp(-(((Math.abs(d) - 0.011) / 0.007) ** 2)), gape = Math.exp(-((d / 0.0035) ** 2));
      const push = (0.007 * roll - 0.006 * gape) * lipK, l = hyp(x, y - ym) || 1;
      x += (x / l) * push; y += ((y - ym) / l) * push;
    }
    // the cheek and gill cover: full, standing a little proud of the flank at its back edge
    const ge = S.gill - 0.9 * (y - ym) ** 2 / 0.12;   // (the edge bows back at mid flank, curving forward above and below)
    const inV = smooth(bot * 0.85 - 1e-4, bot * 0.4, y) * (1 - smooth(top * 0.45, top * 0.75 + 1e-4, y));   // (the 1e-4: a snout tip on the axis)
    const cover = smooth(S.gill - 0.13, S.gill - 0.05, s) * (1 - smooth(ge - 0.004, ge + 0.004, s)) * inV;
    x *= 1 + 0.05 * cover;
    const edge = Math.max(-0.3, Math.min(0.3, s - ge));   // (for the shader: how far behind the gill cover's edge)
    const jaw = (1 - smooth(M.s * 0.8, M.s * 1.4, s)) * smooth(gy + 0.002, gy - 0.008, y);
    return { x: x * L, y: y * L, z: Z(s), edge, jaw };
  };
  const RINGS = 72, RAD = 36;
  const P: number[] = [], B: number[] = [], F: number[] = [], idx: number[] = [];
  const ringS: number[] = [];
  for (let r = 0; r <= RINGS; r++) ringS.push(sb * Math.pow(r / RINGS, 1.35));
  for (const s of ringS) for (let k = 0; k <= RAD; k++) {
    const a = (k / RAD) * Math.PI * 2, v = skin(s, a);
    P.push(v.x, v.y, v.z); B.push(s, k / RAD, v.edge, v.jaw); F.push(0);
  }
  const RW = RAD + 1;
  for (let r = 0; r < RINGS; r++) for (let k = 0; k < RAD; k++) {
    const a = r * RW + k, b = a + 1, c = a + RW, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // close the lips at the front and the end of the tail stock
  const cap = (s: number, dz: number, front: boolean) => {
    const c0 = P.length / 3, [top, bot] = at(s);
    P.push(0, (bot + (top - bot) * wide) * L, Z(s) + dz); B.push(s, 0, 0.3, front ? 0.5 : 0); F.push(0);
    const base = (front ? 0 : RINGS) * RW;
    for (let k = 0; k < RAD; k++) front ? idx.push(c0, base + k, base + k + 1) : idx.push(c0, base + k + 1, base + k);
  };
  cap(0, 0.004, true); cap(sb, -0.002, false);
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  body.setIndex(idx); body.computeVertexNormals();
  const N = Array.from(body.attributes.normal.array as Float32Array);
  // (the seam where the ring closes: average the two copies so no line shows down the belly)
  for (let r = 0; r <= RINGS; r++) {
    const a = (r * RW) * 3, b = (r * RW + RAD) * 3;
    for (let j = 0; j < 3; j++) { const m = (N[a + j] + N[b + j]) * 0.5; N[a + j] = N[b + j] = m; }
  }
  // fins: triangulated from their outline in their own 2D frame, then placed; uv gives the shader its rays
  const fin = (outline: number[][], map: (a: number, b: number) => number[], id: number, n: number[], uv: (a: number, b: number) => number[]) => {   // (small ones)
    const pts = outline.map(([a, b]) => new THREE.Vector2(a, b));
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    const o = P.length / 3;
    for (const p of pts) { const v = map(p.x, p.y), t = uv(p.x, p.y); P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); B.push(t[0], t[1], t[2] ?? 0, t[3] ?? 0); F.push(id); }
    for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) idx.push(o + t[0], o + t[1], o + t[2]);
  };
  // a fin outline with more points along it, so it bends smoothly and its edge is round
  const dense = (o: number[][], n = 4) => { const out: number[][] = []; for (let i = 0; i < o.length - 1; i++) for (let k = 0; k < n; k++) { const t = k / n; out.push([o[i][0] + (o[i + 1][0] - o[i][0]) * t, o[i][1] + (o[i + 1][1] - o[i][1]) * t]); } out.push(o[o.length - 1]); return out; };
  const T = 6;
  const put = (v: number[], n: number[], t: number[], id: number) => { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); B.push(t[0], t[1], t[2] ?? 0, t[3] ?? 0); F.push(id); };
  // a fan of rays from one point (the tail from the end of its stock, a pectoral from its root): spokes out
  // to each point of the outline, in rings, so the rays run straight and the fin can bend between them
  const fan = (c: number[], outline: number[][], map: (a: number, b: number) => number[], id: number, n: number[], ray: (a: number, b: number) => number, extra: number[] = []) => {
    const o = P.length / 3, m = outline.length;
    put(map(c[0], c[1]), n, [ray(outline[0][0], outline[0][1]), 0, ...extra], id);
    for (const [a, b] of outline) for (let k = 1; k <= T; k++) { const t = k / T; put(map(c[0] + (a - c[0]) * t, c[1] + (b - c[1]) * t), n, [ray(a, b), t, ...extra], id); }
    for (let i = 0; i < m - 1; i++) {
      const A = o + 1 + i * T, Bq = o + 1 + (i + 1) * T;
      idx.push(o, A, Bq);
      for (let k = 0; k < T - 1; k++) idx.push(A + k, A + k + 1, Bq + k, Bq + k, A + k + 1, Bq + k + 1);
    }
  };
  // a fin along the back or belly: columns up from the body to each point of its edge, the rays raked back
  const strip = (edge: number[][], map: (s: number, h: number) => number[], id: number, hi: number) => {
    const o = P.length / 3;
    for (const [s, h] of edge) for (let k = 0; k <= T; k++) { const hh = (h * k) / T; put(map(s, hh), X, [(s + rake * hh) / S.rays.dorsal, (k / T) * (h / hi) ** 0.3], id); }
    for (let i = 0; i < edge.length - 1; i++) for (let k = 0; k < T; k++) {
      const a = o + i * (T + 1) + k, b = a + T + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  };
  const X = [1, 0, 0], rake = 0.35;   // (rays lean back)
  const top = (s: number) => at(Math.min(s, sb))[0], bot = (s: number) => at(Math.min(s, sb))[1];
  const hiD = Math.max(...S.dorsal.map((p) => p[1])), hiA = Math.max(...S.anal.map((p) => p[1]));
  // dorsal: the spiny front scalloped between its spines (the membrane dips behind each tip), the soft rear smooth
  const d0 = S.dorsal[0][0], spEnd = S.spineEnd ?? S.dorsal.find((p) => p[1] > 0.044)?.[0] ?? 0.46;
  const dOut: number[][] = [];
  for (const [s, h] of dense(S.dorsal, 5)) {
    let hh = h;
    if (s > d0 + 0.01 && s < spEnd && h > 0) { const k = ((s - d0) / (spEnd - d0)) * S.spines; hh = h * (0.62 + 0.38 * Math.pow(1 - (k - Math.floor(k)), 2.2)); }
    dOut.push([s, hh]);
  }
  strip(dOut, (s, h) => [0, (top(s) - 0.004 + h) * L, Z(s)], 2, hiD);
  strip(dense(S.anal, 4), (s, h) => [0, (bot(s) + 0.004 - h) * L, Z(s)], 2, hiA);
  if (S.dorsal2) strip(dense(S.dorsal2, 4), (s, h) => [0, (top(s) - 0.004 + h) * L, Z(s)], 2, Math.max(...S.dorsal2.map((p) => p[1])));
  // finlets: small flags along the back and belly from behind the second dorsal and anal to the tail
  if (S.finlets) {
    const a0 = Math.max(S.dorsal2?.[S.dorsal2.length - 1][0] ?? 0, S.anal[S.anal.length - 1][0]) + 0.012, a1 = sb - 0.035;
    for (let i = 0; i < S.finlets; i++) {
      const s0 = a0 + ((a1 - a0) * i) / S.finlets, w = (a1 - a0) / S.finlets, h = 0.014;
      strip([[s0, 0], [s0 + w * 0.15, h], [s0 + w * 0.85, h * 0.6], [s0 + w * 0.9, 0]], (q, hh) => [0, (top(q) - 0.002 + hh) * L, Z(q)], 2, h);
      strip([[s0, 0], [s0 + w * 0.15, h], [s0 + w * 0.85, h * 0.6], [s0 + w * 0.9, 0]], (q, hh) => [0, (bot(q) + 0.002 - hh) * L, Z(q)], 2, h);
    }
  }
  // tail: rays fanned from the end of the tail stock
  const t0 = sb - 0.03, ty = (top(sb) + bot(sb)) * 0.5;
  fan([t0, ty], dense(S.tail, 4), (s, y) => [0, y * L, Z(s)], 1, X, (s, y) => Math.atan2(y - ty, s - t0) / S.rays.tail);
  // pectorals: from a short root on the flank behind the gill cover, held open at an angle and rowed about it
  const pc = S.pect, [, , pw] = at(pc.s);
  for (const sx of [-1, 1]) {
    const xr = pw * 0.92 * L, zr = Z(pc.s), so = Math.sin(pc.open), co = Math.cos(pc.open);
    fan([-0.01, -0.005], dense(pc.fin, 3), (b, y) => [sx * (xr + Math.max(b, 0) * L * so), (pc.y + y) * L - Math.max(b, 0) * L * 0.12, zr - b * L * co], 3, [sx * co, 0, so],
      (b, y) => Math.atan2(y + 0.005, b + 0.01) / S.rays.pect, [zr, xr]);
    // pelvics, small, under the pectorals
    const pv = S.pelvic, [, pb, pvw] = at(pv.s);
    fin(dense(pv.fin, 2), (b, y) => [sx * (pvw * 0.35 * L + b * L * 0.35), (pb + 0.004 + y * 0.5) * L - b * L * 0.55, Z(pv.s) - b * L * 0.75], 2, [sx * 0.8, -0.6, 0],
      (b, y) => [Math.atan2(y, b + 0.01) / 0.2, b / 0.075]);
  }
  // the eyes: low domes set into the skin, facing out along the surface
  const E = S.eye, er = E.r;
  for (const sx of [-1, 1]) {
    // where on the ring the eye sits: the angle on the flank whose height is the eye's
    let a = 0; for (let k = 0; k < 64; k++) { const aa = -Math.PI / 2 + (k / 63) * Math.PI; if (skin(E.s, aa).y >= E.y * L) { a = aa; break; } }
    const c = skin(E.s, a), cA = skin(E.s, a + 0.02), cS = skin(E.s + 0.004, a);
    const ta = new THREE.Vector3(cA.x - c.x, cA.y - c.y, cA.z - c.z), ts = new THREE.Vector3(cS.x - c.x, cS.y - c.y, cS.z - c.z);
    const nrm = new THREE.Vector3().crossVectors(ts, ta).normalize(); if (nrm.x < 0) nrm.negate();
    const u = ts.clone().normalize(), v = new THREE.Vector3().crossVectors(nrm, u).normalize();
    if (sx < 0) { nrm.x = -nrm.x; u.x = -u.x; v.x = -v.x; }
    const ctr = new THREE.Vector3(sx * c.x, c.y, c.z).addScaledVector(nrm, -er * L * 0.25);
    const RG = 7, SG = 20, o = P.length / 3, rad = er * L;
    for (let i = 0; i <= RG; i++) {
      const th = (i / RG) * (Math.PI / 2), rr = Math.sin(th), hh = Math.cos(th);
      for (let k = 0; k < SG; k++) {
        const ph = (k / SG) * Math.PI * 2, px = Math.cos(ph) * rr, py = Math.sin(ph) * rr;
        const q = ctr.clone().addScaledVector(u, px * rad).addScaledVector(v, py * rad).addScaledVector(nrm, hh * rad * 0.62);
        const nn = nrm.clone().multiplyScalar(hh / 0.62).addScaledVector(u, px).addScaledVector(v, py).normalize();
        P.push(q.x, q.y, q.z); N.push(nn.x, nn.y, nn.z); B.push(px * sx, py, 0, 0); F.push(7);
        if (i === 0) break;   // (the crown: one vertex)
      }
    }
    for (let k = 0; k < SG; k++) idx.push(o, o + 1 + k, o + 1 + ((k + 1) % SG));
    for (let i = 1; i < RG; i++) for (let k = 0; k < SG; k++) {
      const a0 = o + 1 + (i - 1) * SG + k, a1 = o + 1 + (i - 1) * SG + ((k + 1) % SG), b0 = a0 + SG, b1 = a1 + SG;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aFin', new THREE.Float32BufferAttribute(F, 1));
  g.setAttribute('aB', new THREE.Float32BufferAttribute(B, 4));
  g.setIndex(idx);
  return g;
}

// what fishMaterial needs to paint and move a lofted body (see BONY in its shaders)
export function bonyUniforms(name: string) {
  const S = BONY[name];
  return {
    uScl: { value: new THREE.Vector2(S.scales[0], S.scales[1]) },
    uMouth: { value: new THREE.Vector4(S.mouth.s, S.mouth.y, S.mouth.slope ?? 0.12 * S.mouth.y, S.mouth.teeth ?? 0) },
    uEyeP: { value: new THREE.Vector3(Z(S.eye.s), S.eye.y * L, S.eye.r * L) },
    uIris: { value: new THREE.Color(S.iris[0], S.iris[1], S.iris[2]) },
    uRow: { value: S.row }, uRip: { value: S.rip ?? 0.006 }, uScK: { value: S.scaleK ?? 1 },
    uGill: { value: new THREE.Vector2(...(() => { const [t, b] = gillSpan(S); return [b * L, t * L]; })()) },
  };
}
