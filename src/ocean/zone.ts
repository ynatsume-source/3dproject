// Where the sea's life keeps to. Fish, turtles, octopuses and the like roam a square LIMIT metres either
// side of a centre: the middle of the sea, ordinarily; by an island (whose lagoon is far bigger than that)
// the centre goes with the camera, so wherever it goes along the shore there is life about it.
import { LIMIT } from './scenery';

export const ZONE = { x: 0, z: 0 };
export const zx = (x: number) => Math.max(ZONE.x - LIMIT, Math.min(ZONE.x + LIMIT, x));
export const zz = (z: number) => Math.max(ZONE.z - LIMIT, Math.min(ZONE.z + LIMIT, z));
// outside the square (by a fraction k of it)?
export const outZone = (x: number, z: number, k = 1) => Math.abs(x - ZONE.x) > LIMIT * k || Math.abs(z - ZONE.z) > LIMIT * k;
// the heading back toward the middle of it
export const toZone = (x: number, z: number) => Math.atan2(ZONE.z - z, ZONE.x - x);
