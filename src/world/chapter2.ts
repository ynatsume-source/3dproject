// Chapter 2, the first light (viewer design PROGRAM.md §2-2, CHAPTER2.md; the owner's decision 2026-10-29, D34), read
// from the world's own record: it begins as chapter 1 ends, with the south island's load on the shelf, and ends with the
// island's first lamp lit. Only reads what the village keeps (village.firsts); the screen shows it as it is, decides
// nothing. No load's line: the clay does not run out within it.

/** The way, in the order the screen shows it — the firewood, the pots, the lamp dish, the oil, the light. The lamp dish
 *  and the oil may be done in either order. Each done at the time the world kept (0: done before it kept them). */
export const WAY2 = ['wood', 'pot', 'dish', 'oil', 'light'] as const;
export type Stage2 = (typeof WAY2)[number];
/** The world's firsts each stage reads (robots/residents.ts): seasoned wood enough for a pit fire; a pot fired, not
 *  cracked; a lamp dish fired, not cracked; coconut oil; the first lamp lit. */
export const KEY2: Record<Stage2, string> = { wood: 'dry-wood', pot: 'fired-pot', dish: 'lamp-dish', oil: 'oil', light: 'light' };

export interface Chapter2 {
  began: number;                                  // the south island's load on the shelf (chapter 1's end)
  way: Record<Stage2, number | null>;             // when each stage was done; null not yet
  ended: number | null;                           // the first lamp lit
}

/** The chapter as the village has it; null before chapter 1 has ended. */
export function chapter2(village: { firsts?: Record<string, number> }): Chapter2 | null {
  const f = village.firsts ?? {}, at = (k: string) => (f[k] === undefined ? null : f[k]);
  const began = at('south-load'); if (began === null) return null;
  const way = Object.fromEntries(WAY2.map((s) => [s, at(KEY2[s])])) as Record<Stage2, number | null>;
  return { began, way, ended: way.light };
}
