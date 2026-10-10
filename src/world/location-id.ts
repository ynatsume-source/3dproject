import type { Sea } from '../data/locations';

// The survey/land id stays 'kayama'; built oceans and viewing state belong to a world.
export const worldKey = (loc: Pick<Sea, 'id' | 'world'>): string => `${loc.world ?? 'earth'}:${loc.id}`;
export const seaHash = (loc: Pick<Sea, 'id' | 'world'>): string => '#' + (loc.world === 'planet' ? 'planet' : loc.id);

// Preserve existing Earth links while keeping the resident planet stable across reloads.
export function seaForHash(hash: string, locations: Sea[], planet: Sea): Sea | undefined {
  return hash === '#planet' ? planet : locations.find((loc) => '#' + loc.id === hash);
}

// Old Kayama sightings may come from either world. Rebuild that viewing cache;
// unambiguous Earth discoveries keep their history. Resident saves are unrelated.
export function migrateSeen(values: unknown, locations: Sea[]): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((key): key is string => typeof key === 'string').flatMap((key) => {
    const id = key.split(':', 1)[0], loc = locations.find((loc) => loc.id === id);
    if (!loc) return [key];
    return id === 'kayama' ? [] : [`earth:${key}`];
  });
}
