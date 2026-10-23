// Where a frame's time went, by name (the rehearsal's log, ?rehearsal — ui/rehearsal-log.ts). Off, each call is one
// check and nothing else. Sections may sit inside one another (住人 holds 道探し, 殻, 縄, 帆, 保存): each is its own total.
export const prof = { on: false, ms: {} as Record<string, number>, open: {} as Record<string, number> };
export function profBegin(name: string) { if (prof.on) prof.open[name] = performance.now(); }
export function profEnd(name: string) {
  if (!prof.on || prof.open[name] === undefined) return;
  prof.ms[name] = (prof.ms[name] ?? 0) + performance.now() - prof.open[name]; delete prof.open[name];
}
/** f timed under name (for a call made from several places, such as a way's search) */
export function profed<A extends unknown[], R>(name: string, f: (...a: A) => R): (...a: A) => R {
  return (...a: A) => {
    if (!prof.on) return f(...a);
    const t = performance.now();
    try { return f(...a); } finally { prof.ms[name] = (prof.ms[name] ?? 0) + performance.now() - t; }
  };
}
