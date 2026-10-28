// Chapter 1, the first crossing back to the south island (viewer design PROGRAM.md §2-1, owner's decision 2026-10-27; its
// name and its end's words in CHAPTER1_END.md, for the owner), read from the world's own record: the way's stages done
// when the world says so, the load brought from the south in four words, and which crossing brought its load. Only reads what the village keeps (village.firsts, never the labDone or lampLog rows, which are let
// go: science, specs/chapter1-world-values.md); the screen shows it as it is, decides nothing.

/** The way, in the order the screen shows it, as the world goes — the hut, then the raft (#185), then the crossing; the
 *  pot and the light come after the crossing and go to chapter 2 (viewer design CHAPTER1_END.md §3, whichever way the
 *  owner takes). Each done at the time the world kept (0: done before it kept them). */
export const WAY = ['hut', 'raft', 'south'] as const;
export type Stage = (typeof WAY)[number] | 'pot' | 'light';
const KEY: Record<Stage, string> = { hut: 'hut', raft: 'raft', south: 'south-load', pot: 'fired-pot', light: 'light' };
/** The load in words (PROGRAM.md §2-1-2): plenty over 60 % of what came, about half from 25 %, nearly gone under 25 %,
 *  gone when nothing more can be made of it (the world marks it). */
export type LoadWord = 'plenty' | 'half' | 'little' | 'gone';
export const LOAD_JA: Record<LoadWord, string> = { plenty: 'たっぷり', half: '半分ほど', little: '残りわずか', gone: '尽きた' };
export const LOAD_EN: Record<LoadWord, string> = { plenty: 'plenty', half: 'about half', little: 'nearly gone', gone: 'gone' };
/** What the first load always is, the 100 % (the same on every island, also where only the lack was made up). */
export const BASE_MG = { clay: 25e6, bamboo: 7e6 };

export interface Chapter1 {
  began: number;                                  // when the first load came (the chapter's start)
  way: Record<Stage, number | null>;              // when each stage was done; null not yet (pot and light kept for chapter 2)
  load: { clay: LoadWord; bamboo: LoadWord } | null;   // null once the chapter has ended: the load's line goes
  ended: number | null;                           // the south island's load on the shelf
  inTime: boolean | null;                         // ended before either the clay or the bamboo was gone
  crossing: number;                               // which crossing to the south island brought its load (or how many so far)
}

export function loadWord(mg: number, base: number, gone: boolean): LoadWord {
  return gone ? 'gone' : mg > base * 0.6 ? 'plenty' : mg >= base * 0.25 ? 'half' : 'little';
}

/** The chapter as the village has it; null on an island that never had the first load. */
export function chapter1(village: { firstLoad?: { at: number } | null; firsts?: Record<string, number>; loadMin?: { clayMg: number; bambooMg: number } | null; southSetOut?: number }): Chapter1 | null {
  if (!village.firstLoad) return null;
  const f = village.firsts ?? {}, at = (k: string) => (f[k] === undefined ? null : f[k]);
  const way = Object.fromEntries((Object.keys(KEY) as Stage[]).map((s) => [s, at(KEY[s])])) as Record<Stage, number | null>;
  const ended = way.south, clayGone = at('clay-gone'), bambooGone = at('bamboo-gone'), m = village.loadMin;
  return {
    began: village.firstLoad.at, way, ended,
    load: ended !== null || !m ? null : { clay: loadWord(m.clayMg, BASE_MG.clay, clayGone !== null), bamboo: loadWord(m.bambooMg, BASE_MG.bamboo, bambooGone !== null) },
    inTime: ended === null ? null : (clayGone === null || clayGone > ended) && (bambooGone === null || bambooGone > ended),
    crossing: village.southSetOut ?? 0,
  };
}
