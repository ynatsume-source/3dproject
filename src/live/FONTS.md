# Fonts of the live screen

The live screen (`?live`) draws with fonts bundled from npm (`@fontsource/*`), so the stream PC never fetches them from
outside. All are under the SIL Open Font License 1.1 (each package's `LICENSE`):

| Font | Package | Weights |
|---|---|---|
| Zen Old Mincho (The Zen Old Mincho Project Authors) | `@fontsource/zen-old-mincho` | 500, 600 |
| Cormorant SC (Christian Thalmann) | `@fontsource/cormorant-sc` | 500 |
| IBM Plex Mono (IBM Corp.) | `@fontsource/ibm-plex-mono` | 400 |
| Cormorant Garamond (Christian Thalmann) | `@fontsource/cormorant-garamond` | 500, 600, 500 italic |

They are loaded only with `?live` (src/live/live.ts is imported on demand); the app's own pages are unchanged.
