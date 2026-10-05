// The residents' own media (島だより, utsushiyo.earth/journal/): the photographs they chose to take, and the posts
// they write from them and from their own records (ADR 0004, publishing). Shared by the island (robots/residents.ts),
// the daily run (scripts/journal-run.ts), the photo renderer (tools/journal/photos.cjs) and the pages
// (scripts/journal-pages.ts).

/** A photograph a resident chose to take: where its eyes were and what it was looking at, at that moment, and the
 *  others where they were — enough to draw the picture again exactly from the island as it was. */
export interface PhotoRecord {
  id: string;                 // e.g. "rakko-2026-10-04-1"
  who: string;                // the one who took it
  day: string;                // its day on the island (Asia/Tokyo), YYYY-MM-DD
  at: number;                 // world time (ms)
  eye: [number, number, number];
  look: [number, number, number];
  subject: { id: string; kind: string; label: string };
  why?: string;               // what it was doing / meant (its goal then), in its words
  others: { id: string; x: number; y: number; z: number; head: number; act: string; holding: string }[];
  file?: string;              // the rendered image, once drawn (photos/<id>.jpg)
}

export const PHOTOS_PER_DAY = 3;   // at most, each (none is fine: that day it draws instead)

export interface PostPhoto { id: string; caption: string }
/** A post, as written and checked. Published only once approved (a merged pull request). */
export interface Post {
  id: string;                 // "<day>-<who>"
  who: string; name: string;
  day: string;
  title: string;
  body: string[];             // paragraphs, plain text (older posts; a post written as a log has none)
  photos: PostPhoto[];        // its own from that day, 1–3; none on a day it took none
  island?: string;   // the island's own dates over that day (its calendar runs faster than ours)
  sns?: string;   // its post for the human world's social media that day (its role: to tell people outside what it is working on)
  drawing?: { svg: string; caption: string };   // a day without photographs: a figure it drew for the human world (SVG)
  // the day as an exchange: what the island gave back, and what it made of it — and, at the end, the day taken as a whole
  log?: { t: string; world: string; me: string; photo?: string }[];
  review?: { summary: string[]; state: string[]; unknown: string[]; outlook: string[] };
  tags: string[];
  written: string;            // ISO time it was written
  by: string;                 // the model that wrote it, or "draft" (no AI: a dry run, never published)
}
