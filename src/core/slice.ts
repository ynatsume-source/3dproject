// Long work done a slice at a time (a sea's build: ocean/build.ts, main.ts). The driver sets when the slice is up;
// the steps check due() at the top of their loops and give way (yield) once it is. Run straight through (drain, and
// whenever no slice is set) they never give way.
let sliceEnd = Infinity;
export function setSliceEnd(t: number) { sliceEnd = t; }
export const due = () => sliceEnd !== Infinity && performance.now() > sliceEnd;
export function drain<T>(g: Generator<unknown, T, unknown>): T { let r = g.next(); while (!r.done) r = g.next(); return r.value; }
