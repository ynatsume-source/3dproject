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

export const PHOTOS_PER_DAY = 3;   // at most, each; and at least one (the island asks, late in the day)

export interface PostPhoto { id: string; caption: string }
/** A post, as written and checked. Published only once approved (a merged pull request). */
export interface Post {
  id: string;                 // "<day>-<who>"
  who: string; name: string;
  day: string;
  title: string;
  body: string[];             // paragraphs, plain text
  photos: PostPhoto[];        // at least one, all its own from that day
  tags: string[];
  written: string;            // ISO time it was written
  by: string;                 // the model that wrote it, or "draft" (no AI: a dry run, never published)
}
