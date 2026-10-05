// What has paid off, learnt from what came of it (ADR 0006: rewards counted by the world, learnt as values). Each step
// a resident takes is kept for a while; when the world counts a reward, the step that earned it gets it whole and the
// steps that led up to it get a share that halves with each step back (so walking to the beach, hearing where the log
// was, and picking it up all learn something when the piece goes on the hut). Its mind is shown the best of it as
// numbers — what it is, how much it paid on average, how many times — never as a feeling.

export interface Value { key: string; label: string; n: number; sum: number; credit: number }
const TRACE_MS = 2 * 3600e3, TRACE_N = 8;

export class Values {
  m = new Map<string, Value>();
  private trace: { key: string; label: string; at: number }[] = [];

  private get(key: string, label: string) {
    let v = this.m.get(key); if (!v) { v = { key, label, n: 0, sum: 0, credit: 0 }; this.m.set(key, v); }
    if (label) v.label = label;
    return v;
  }
  /** A step was taken and the world judged it: its own reward (0 if none), and a share for the steps before it. */
  step(key: string, label: string, reward: number, at: number) {
    const v = this.get(key, label); v.n++; v.sum += reward;
    if (reward > 0) {
      let w = 0.5;
      for (let i = this.trace.length - 1; i >= 0 && w > 0.06; i--) {
        const t = this.trace[i]; if (at - t.at > TRACE_MS) break;
        if (t.key !== key) { this.get(t.key, t.label).credit += reward * w; w /= 2; }
      }
    }
    this.trace.push({ key, label, at }); if (this.trace.length > TRACE_N) this.trace.shift();
  }
  /** A reward that came of something not taken as a step (what it heard turned out to be of use). */
  bonus(key: string, label: string, reward: number) { const v = this.get(key, label); v.n = Math.max(v.n, 1); v.credit += reward; }
  value(v: Value) { return (v.sum + v.credit) / Math.max(1, v.n); }
  /** Its hits: the best-paying things it has tried more than once, as its mind is shown them. */
  hits(k = 5): string[] {
    return [...this.m.values()].filter((v) => v.n >= 2 && this.value(v) > 0.05).sort((a, b) => this.value(b) - this.value(a)).slice(0, k)
      .map((v) => `${v.label}：平均 ${this.value(v).toFixed(2)}（${v.n}回）`);
  }
  save() { return [...this.m.values()].sort((a, b) => b.n - a.n).slice(0, 80); }
  load(s: unknown) { if (Array.isArray(s)) for (const v of s) if (v && typeof v.key === 'string') this.m.set(v.key, { key: v.key, label: String(v.label ?? v.key), n: +v.n || 0, sum: +v.sum || 0, credit: +v.credit || 0 }); }
}
