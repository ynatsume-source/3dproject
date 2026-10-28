// What the island has done for the first time (viewer design 2-a, 2026-10-18): the world's own events, graded by the
// world — a milestone is the first time one kind of thing happens on the island. The live screen's card, the digest's
// "today's milestones" and the scene index read the grade; none of them decide it. This table says which events are
// of a kind that can be a first, and what kind; whether it is the first is the world's record (village.firsts).
// Only the world's own words are matched; nothing a resident's mind wrote.

const KINDS: [kind: string, re: RegExp, key: (m: RegExpMatchArray) => string][] = [
  ['science', /島で初めて灯りをともした/, () => 'light'],
  ['science', /天気の壺ができた/, () => 'weather-pot'],
  ['science', /乾留の器ができた/, () => 'retort'],
  ['science', /島の鍋になった/, () => 'cook-pot'],
  ['science', /島で初めて器が焼けた/, () => 'fired-pot'],
  ['raft', /筏ができた/, () => 'raft'],
  ['map', /筏で(.+?)に渡り、戻ってきた/, (m) => `crossing:${m[1]}`],
  ['map', /水平線に島を.+?見つけ/, () => 'sighting'],
  ['pier', /桟橋が完成した/, () => 'pier'],
  ['house', /家の屋根が葺き上がった/, () => 'house-roof'],
  ['house', /家の土壁が塗り上がった/, () => 'house-walls'],
  ['house', /家ができた/, () => 'house'],
  ['house', /家の石垣ができた/, () => 'wall'],
  ['nest', /ラッコの休み場ができた/, () => 'rakko-bed'],
  ['pit', /粘土の池を掘った/, () => 'clay-pit'],
  ['husk', /殻を打って、繊維をとった/, () => 'fibre'],
  ['cord', /撚り糸を三本合わせて、縄をなった/, () => 'rope'],
  ['cord', /縄で鍋を軒下に吊るした/, () => 'hang'],
  ['cord', /縄で筏を縛った/, () => 'lash'],
  ['cord', /縄が切れた/, () => 'cord-break'],
  ['sail', /帆のむしろを編み上げた/, () => 'sail'],
  ['sail', /竹のマストを切り出した/, () => 'mast'],
  ['sail', /筏に帆とマストを取りつけた/, () => 'rig'],
  ['sail', /帆を張って(.+?)まで渡った/, () => 'sail-crossing'],
];

/** The kind of first this event would be, or null for an event that is never a milestone. */
export function milestoneKey(kind: string, text: string): string | null {
  for (const [k, re, key] of KINDS) { if (k !== kind) continue; const m = text.match(re); if (m) return key(m); }
  return null;
}
