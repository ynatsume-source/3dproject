// The residents with plain three.js materials (no island shaders): the design gallery (robots.html) and the
// talking demo (talk.html) build them the same way.
import * as THREE from 'three';
import { robotKit } from './models';
import { creatureKit } from './creatures';

export function galleryKits() {
  // ---------- materials ----------
  const M = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xf2efe8, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    accent: new THREE.MeshPhysicalMaterial({ color: 0xf08a3c, roughness: 0.4, clearcoat: 0.4 }),
    teal: new THREE.MeshPhysicalMaterial({ color: 0x3f9a93, roughness: 0.45, clearcoat: 0.3 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x2b3035, roughness: 0.5, metalness: 0.6 }),
    dark: new THREE.MeshPhysicalMaterial({ color: 0x0c1418, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glow: new THREE.MeshBasicMaterial({ color: 0x8ff6ff }),
    warm: new THREE.MeshBasicMaterial({ color: 0xffd98a }),
    panel: (() => {
      // solar cells: a grid of dark blue cells with thin silver bus lines
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
      g.fillStyle = '#c9d2d8'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = `hsl(218, 55%, ${14 + Math.random() * 6}%)`; g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28); g.fillStyle = 'rgba(200,210,220,0.35)'; g.fillRect(x * 32 + 2, y * 32 + 15, 28, 1); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.25, clearcoat: 1, metalness: 0.2 });
    })(),
  };
  const { makeDot, makeLantern } = robotKit({ ...M, stone: new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 }) }, true);
  // Kamemaru's shell from above: quiet scutes in its own colour (a touch lighter at the middle, darker seams)
  function softShellTex(hex: number) {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d')!, img = g.createImageData(N, N);
    const base = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const seeds: number[][] = []; for (let i = 0; i < 5; i++) seeds.push([0, 0.3 - i * 0.155]); for (let i = 0; i < 8; i++) seeds.push([(i % 2 ? 1 : -1) * 0.19, 0.235 - Math.floor(i / 2) * 0.165]);
    const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const x = (px / N - 0.5) * 0.8, z = (py / N - 0.5) * 1.0; let d1 = 9, d2 = 9;
      seeds.forEach((s) => { const d = Math.hypot(x - s[0], (z - s[1]) * 1.15); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; });
      const rn = Math.hypot(x / 0.37, z / 0.48), seam = Math.max(1 - sm(0.006, 0.016, d2 - d1), 1 - sm(0.006, 0.018, Math.abs(rn - 0.86)));
      let k = rn > 0.86 ? 0.88 : 1 + 0.14 * (1 - sm(0.02, 0.11, d1)); k = k + (0.62 - k) * seam * 0.75;
      const o = (py * N + px) * 4; for (let i = 0; i < 3; i++) img.data[o + i] = Math.min(255, base[i] * k); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // the character turtle's shell, from above: a few big clear scutes, each lighter at its middle, cream seams
  function toonShellTex() {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d')!, img = g.createImageData(N, N);
    const seeds: number[][] = []; for (let i = 0; i < 5; i++) seeds.push([0, 0.3 - i * 0.155]); for (let i = 0; i < 8; i++) seeds.push([(i % 2 ? 1 : -1) * 0.19, 0.235 - Math.floor(i / 2) * 0.165]);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const x = (px / N - 0.5) * 0.8, z = (py / N - 0.5) * 1.0; let d1 = 9, d2 = 9;
      seeds.forEach((s) => { const d = Math.hypot(x - s[0], (z - s[1]) * 1.15); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; });
      const rn = Math.hypot(x / 0.37, z / 0.48), seam = d2 - d1 < 0.014 || Math.abs(rn - 0.86) < 0.016;
      const col = seam ? [241, 226, 184] : rn > 0.86 ? [70, 112, 66] : d1 < 0.05 ? [126, 168, 98] : [92, 138, 80];
      const k = (py * N + px) * 4; img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // the turtle's carapace painted from above: the same scutes the island's shader draws
  function carapaceTex() {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d')!, img = g.createImageData(N, N);
    const seeds: number[][] = []; for (let i = 0; i < 5; i++) seeds.push([0, 0.3 - i * 0.155]); for (let i = 0; i < 8; i++) seeds.push([(i % 2 ? 1 : -1) * 0.19, 0.235 - Math.floor(i / 2) * 0.165]);
    const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k), sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const x = (px / N - 0.5) * 0.8, z = (py / N - 0.5) * 1.0;
      let d1 = 9, d2 = 9, c1 = seeds[0], id = 0;
      seeds.forEach((s, i) => { const d = Math.hypot(x - s[0], (z - s[1]) * 1.15); if (d < d1) { d2 = d1; d1 = d; c1 = s; id = i; } else if (d < d2) d2 = d; });
      const rn = Math.hypot(x / 0.37, z / 0.48); let seam = 1 - sm(0.004, 0.012, d2 - d1), ang = Math.atan2(z - c1[1], x - c1[0]);
      if (rn > 0.84) { const a = Math.atan2(x, z) / 6.2832 * 24; seam = Math.max(sm(0.42, 0.48, Math.abs(a - Math.floor(a) - 0.5)), 1 - sm(0.004, 0.014, Math.abs(rn - 0.84))); id = Math.floor(a) + 20; ang = (a - Math.floor(a) - 0.5) * 6 + rn * 30; }
      let streak = (0.5 + 0.5 * Math.sin(ang * 9 + id * 13.7)) * (0.55 + 0.45 * Math.sin(ang * 4 - id * 5.1)) * sm(0, 0.06, d1); if (rn > 0.84) streak *= 0.6;
      let col = mix([0.17, 0.11, 0.055], [0.47, 0.37, 0.19], streak); col = mix(col, [0.52, 0.47, 0.34], seam * 0.7);
      const k = (py * N + px) * 4; col.forEach((v, i) => (img.data[k + i] = Math.min(255, Math.pow(v, 1 / 1.25) * 255))); img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const std = (color: number, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
  const { makeSeaOtter, makeGreenTurtle, makeChibiOtter, makeChibiTurtle, makeRakko, makeKame } = creatureKit({
    fur: std(0x3a281b, 0.9), furPale: std(0xb9a487, 0.95), furDark: std(0x1f1610, 0.9), nose: std(0x0d0c0c, 0.4), eye: std(0x050506, 0.1),
    carapace: new THREE.MeshStandardMaterial({ map: carapaceTex(), roughness: 0.45 }), plastron: std(0xd8c890, 0.7), skin: std(0x4c3b24, 0.6), beak: std(0x6a5838, 0.5),
    stone: std(0x7d776e, 0.9), urchin: std(0x3b1736, 0.5), crab: std(0xb04a2a, 0.5), clam: std(0xcbbca4, 0.5),
    white: std(0xf4f1ea, 0.3), kelp: std(0x5d6b2a, 0.6), blush: std(0xd99a86, 0.9), wire: new THREE.MeshStandardMaterial({ color: 0xb8954a, roughness: 0.3, metalness: 0.8 }), barnacle: std(0xc9c4b8, 0.9), moss: std(0x4f6b2c, 0.9),
    chibi: {
      brown: std(0x8a5534, 0.75), belly: std(0xc99a70, 0.8), cream: std(0xf0dcb8, 0.8), paw: std(0x4a2c1c, 0.8), nose: std(0x2a1a14, 0.35), mouth: std(0x8c3b3b, 0.6),
      dark: std(0x1e130d, 0.15), iris: std(0x7a4a26, 0.25), white: new THREE.MeshBasicMaterial({ color: 0xffffff }), pink: std(0xf0a4a0, 0.9), stone: std(0x8e8b86, 0.8),
      shell: new THREE.MeshStandardMaterial({ map: toonShellTex(), roughness: 0.55 }), seam: std(0xf1e2b8, 0.7), plastron: std(0xe2cf9a, 0.8), skin: std(0x9cc27e, 0.75), brow: std(0xfbf8f0, 0.95), moss: std(0x5d9a3e, 0.9), barnacle: std(0xe2ddd0, 0.8),
      line: new THREE.MeshBasicMaterial({ color: 0x2a1c14, side: THREE.BackSide }),
      red: std(0xd8423a, 0.9), brownOdd: std(0x4b2e1f, 0.95), skinOdd: std(0x679c82, 0.95), shellPlain: new THREE.MeshStandardMaterial({ map: softShellTex(0x6e4529), roughness: 0.85 }),
    },
  }, true);
  return { makeDot, makeLantern, makeSeaOtter, makeGreenTurtle, makeChibiOtter, makeChibiTurtle, makeRakko, makeKame };
}
