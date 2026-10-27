// Cuts clips from the stream's recording, by the trial's log (docs/proposals/viewer-design-2026-10-16/CLIPS.md): the
// candidates of §2-1 from the log's rows with their points, those whose resident was not on the screen left out (the
// drone's cam rows: K7), one a resident and kind a day, the best first; each one cut from the recording (OBS), across one
// skip of time at most with "○分後" between (§2-3), as it was (horizontal, an end card of 1.5 s) and in the vertical
// frame (§3); the checks K7–K11 (§6); for each, its title and description in a .txt of the same name (§4–5). Words put on
// the picture are only the log's own (K11): nothing added, nothing mended.
// It runs where the recording is (the stream PC: Node and ffmpeg with libass — `winget install Gyan.FFmpeg` on Windows). Without
// ffmpeg, or with --plan, it prints what it would cut and the ffmpeg commands, and writes plan.json.
// Usage:
//   npx tsx scripts/cut-clips.ts --log rehearsal-….ndjson --video 2026-11-02_10-00-00.mkv --start 2026-11-02T10:00:00+09:00
//     [--out clips] [--top 3] [--fontname 'Yu Mincho'] [--fontsdir dir] [--live https://…] [--ffmpeg ffmpeg] [--plan]
//   --start: the time in Japan of the recording's first frame (OBS names its files by it); the log's times are cut by it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { islandDate } from '../src/world/island-time';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const logFile = arg('log'), video = arg('video'), startAt = arg('start'), out = arg('out', 'clips')!, top = +(arg('top', '3')!);
const fontName = arg('fontname', 'Yu Mincho')!, fontsDir = arg('fontsdir', '');
const liveUrl = arg('live', '（ライブのリンク）')!, FF = arg('ffmpeg', 'ffmpeg')!;
if (!logFile || !startAt) { console.error('usage: npx tsx scripts/cut-clips.ts --log <rehearsal.ndjson> --video <recording> --start <JST of its first frame> [--plan]'); process.exit(2); }
const hasFF = spawnSync(FF, ['-version']).status === 0, plan = flag('plan') || !hasFF || !video;

type Row = Record<string, any> & { t: string; jst: string };
const rows: Row[] = readFileSync(logFile, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const T = (r: Row) => Date.parse(r.jst), t0 = Date.parse(startAt);
const NAMES: Record<string, string> = { dot: 'ドット', rakko: 'ラッコ', kame: 'カメマル', lantern: 'ランタン' };
const whoIn = (text: string) => Object.entries(NAMES).find(([, n]) => text.includes(n))?.[0] ?? '';
const cams = rows.filter((r) => r.t === 'cam').sort((a, b) => T(a) - T(b));
const subs = rows.filter((r) => r.t === 'sub').sort((a, b) => T(a) - T(b));

// ---------- §2-1: the candidates ----------
interface Seg { from: number; to: number }   // (ms, the log's clock)
interface Clip { kind: string; who: string; points: number; segs: Seg[]; text: string; at: number; skipMin?: number; top: string; with?: string[] }   // (with: a talk's speakers — the drone on any of them)
const cands: Clip[] = [];
for (const c of rows.filter((r) => r.t === 'card')) cands.push({ kind: 'card', who: whoIn(c.text ?? ''), points: 5, segs: [{ from: T(c) - 20e3, to: T(c) + 13e3 }], text: c.text, at: T(c), top: c.text });
for (const r of rows.filter((x) => x.t === 'trial' && x.kind === 'result')) {
  const said = rows.filter((x) => x.t === 'trial' && x.kind === 'say' && x.who === r.who && T(x) < T(r)).at(-1);
  const b: Seg = { from: T(r) - 15e3, to: T(r) + 8e3 };
  const segs: Seg[] = said && T(r) - T(said) > 60e3 ? [{ from: T(said) - 3e3, to: T(said) + Math.min(12, 4 + 0.15 * (said.text ?? '').length) * 1e3 }, b] : [{ from: Math.min(b.from, said ? T(said) - 3e3 : b.from), to: b.to }];
  cands.push({ kind: `result:${r.outcome}`, who: r.who, points: r.outcome === 'confirmed' || r.outcome === 'done' ? 4 : 3, segs, text: r.text ?? '', at: T(r), skipMin: segs.length > 1 ? Math.round((segs[1].from - segs[0].to) / 60e3) : undefined, top: said?.text ?? r.text ?? '' });
}
for (let i = 0; i < subs.length;) {   // (a run of lines in the same talk, ten seconds apart at most)
  let j = i; while (j + 1 < subs.length && T(subs[j + 1]) - T(subs[j]) <= 10e3) j++;
  const run = subs.slice(i, j + 1), text = run.map((s) => s.text).join(' '), ask = /頼|渡|運|教|知らせ/.test(text);
  if (run.length >= 2) cands.push({ kind: ask ? 'talk:ask' : 'talk', who: whoIn(run[0].who ?? ''), with: [...new Set(run.map((r) => whoIn(r.who ?? '')).filter(Boolean))], points: ask ? 3 : 2, segs: [{ from: T(run[0]) - 3e3, to: Math.min(T(run[0]) + 57e3, T(run.at(-1)!) + 6e3) }], text: run[0].text, at: T(run[0]), top: run[0].text });
  i = j + 1;
}
for (const e of rows.filter((r) => r.t === 'event' && r.shown === true && /manta|eagleray|breach|bait|school/.test(r.kind ?? ''))) cands.push({ kind: 'sea', who: '', points: 2, segs: [{ from: T(e) - 5e3, to: T(e) + 25e3 }], text: e.text, at: T(e), top: e.text });

// ---------- §6: the checks ----------
const onScreen = (who: string[], s: Seg) => {   // K7: the drone on that one (a talk: any of them) throughout, a second's grace at the start
  let cur = ''; for (const c of cams) { if (T(c) > s.from + 1e3) break; cur = c.who; }
  return who.includes(cur) && !cams.some((c) => T(c) > s.from + 1e3 && T(c) < s.to && !who.includes(c.who));
};
const seaOnScreen = (s: Seg) => cams.some((c) => c.pri === 4 && T(c) <= s.from + 1e3) && !cams.some((c) => T(c) > s.from && T(c) < s.to && c.pri !== 4);
const audioOn = (s: Seg) => { let st = ''; for (const r of rows) { if (r.t !== 'audio' && !(r.t === 'event' && r.kind === 'audio')) continue; if (T(r) > s.to) break; if (T(r) <= s.from) st = r.state ?? r.text; else if ((r.state ?? r.text) !== 'on') return false; } return st === 'on'; };
const INNER = /[a-z]+:[a-z#0-9]|lot:|req#|共有：|目的：|仮説：|\d+\/\d+/;
function check(c: Clip) {
  const k: Record<string, string> = {};
  k.K7 = c.kind === 'sea' ? (c.segs.every(seaOnScreen) ? 'ok' : 'not on screen') : !c.who ? 'ok (the world\'s card)' : c.segs.every((s) => onScreen(c.with ?? [c.who], s)) ? 'ok' : 'not on screen';
  k.K8 = c.segs.every(audioOn) ? 'ok (loudness measured once cut)' : 'no sound in the log';
  k.K9 = rows.some((r) => r.t === 'slow' && r.ms > 1000 && c.segs.some((s) => T(r) >= s.from && T(r) <= s.to)) ? 'a stall over 1 s' : 'ok';
  k.K10 = c.segs.length <= 2 && (c.segs.length === 1 || c.skipMin !== undefined) ? 'ok' : 'more than one skip';
  const words = [c.top, ...subsIn(c).map((s) => s.text)];
  k.K11 = words.some((w) => INNER.test(w ?? '')) ? 'inner words' : 'ok';
  return k;
}
const subsIn = (c: Clip) => subs.filter((s) => c.segs.some((g) => T(s) >= g.from && T(s) <= g.to));

// ---------- §2-2: choosing ----------
const day = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const chosen: (Clip & { checks: Record<string, string> })[] = [], left: string[] = [];
for (const c of [...cands].sort((a, b) => b.points - a.points || (a.text?.length ?? 0) - (b.text?.length ?? 0) || b.at - a.at)) {
  if (chosen.length >= top) break;
  const k = check(c), no = Object.entries(k).filter(([, v]) => !v.startsWith('ok'));
  if (no.length) { left.push(`${c.kind} ${c.who || '-'} ${new Date(c.at + 9 * 3600e3).toISOString().slice(11, 19)}: ${no.map(([n, v]) => `${n} ${v}`).join(', ')}`); continue; }   // (§6: a check not passed, not made)
  if (chosen.some((x) => x.who === c.who && x.kind.split(':')[0] === c.kind.split(':')[0] && day(x.at) === day(c.at))) continue;
  if (c.segs[0].from < t0) { left.push(`${c.kind} ${c.who}: before the recording began`); continue; }
  chosen.push({ ...c, checks: k });
}

// ---------- §3–5: cutting, and the words to go with it ----------
// (the words are put on with libass — the ass filter, in ffmpeg's usual builds — from a subtitle file written for each
// cut: the font by name, --fontname, found in --fontsdir or the system's own; ffmpeg runs in the output folder, so the
// files are named without a drive)
const CH = '第1章　尽きる前に、南の島へ', Q = '第1章　持ってきた分が尽きる前に、南の島へ渡れるか', BRAND = 'UTSUSHIYO PROJECT ／ Series 1 ルマウ';
mkdirSync(out, { recursive: true });
const sec = (ms: number) => ((ms - t0) / 1000).toFixed(2);
const at = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}`; };
const assEsc = (t: string) => t.replace(/[{}\\]/g, '').replace(/\n/g, '\\N');
// (a line broken to fit the frame — after a 、 or 。 near the end if there is one — two lines at most, smaller if longer)
const fit = (t: string, per: number) => { const out: string[] = []; let rest = t; while (rest.length > per) { const cut = Math.max(rest.lastIndexOf('、', per), rest.lastIndexOf('。', per)); const k = cut > per * 0.5 ? cut + 1 : per; out.push(rest.slice(0, k)); rest = rest.slice(k); } if (rest) out.push(rest); return out; };
const block = (t: string, size: number, width: number) => { for (const s of [size, Math.round(size * 0.86), Math.round(size * 0.75)]) { const lines = fit(t, Math.floor(width / s)); if (lines.length <= 2) return { size: s, text: lines.join('\n') }; } const s = Math.round(size * 0.75), lines = fit(t, Math.floor(width / s)); return { size: s, text: lines.slice(0, 2).join('\n') }; };
const ass = (w: number, h: number, lines: { from: number; to: number; x: number; y: number; size: number; text: string; a?: number }[]) =>
  `[Script Info]\nScriptType: v4.00+\nPlayResX: ${w}\nPlayResY: ${h}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
  `Style: W,${fontName},40,&H17FFFFFF,&H00FFFFFF,&H80000000,&H00000000,0,0,0,0,100,100,0,0,1,1.5,0,8,60,60,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
  lines.map((l) => `Dialogue: 0,${at(l.from)},${at(l.to)},W,,0,0,0,,{\\an${l.a ?? 8}\\pos(${l.x},${l.y})\\fs${l.size}}${assEsc(l.text)}`).join('\n') + '\n';
const commands: { cwd: string; args: string[] }[] = [], report: any[] = [];
chosen.forEach((c, n) => {
  const base = `clip-${day(c.at)}-${n + 1}`, wr = [...rows].reverse().find((r) => r.world && T(r) <= c.at)?.world;
  const d = wr ? islandDate(Date.parse(wr)) : null, date = d ? `島暦${d.year}年 ${d.month}月${d.day}日` : '';
  const ins = c.segs.flatMap((s) => ['-ss', sec(s.from), '-t', ((s.to - s.from) / 1000).toFixed(2), '-i', video ? resolve(video) : 'RECORDING']);
  const gap = c.segs.length > 1;
  // (the body: the segments, a 0.5 s dark between them; then 1.5 s of dark for the horizontal's end card)
  const v = (i: number) => `[${i}:v]scale=1920:1080,setsar=1,fps=30[v${i}];[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`;
  let graph = c.segs.map((_, i) => v(i)).join(';');
  const parts = c.segs.map((_, i) => `[v${i}][a${i}]`);
  if (gap) { graph += ';color=c=black:s=1920x1080:r=30:d=0.5,setsar=1[vg];anullsrc=r=48000:cl=stereo,atrim=0:0.5[ag]'; parts.splice(1, 0, '[vg][ag]'); }
  const len0 = (c.segs[0].to - c.segs[0].from) / 1000, body = c.segs.reduce((n, s) => n + (s.to - s.from) / 1000, 0) + (gap ? 0.5 : 0);
  // (where each line said falls in the cut)
  const said: { from: number; to: number; text: string }[] = []; let off = 0;
  c.segs.forEach((s, i) => { for (const r of subs.filter((x) => T(x) >= s.from && T(x) <= s.to)) { const a = off + (T(r) - s.from) / 1000; said.push({ from: a, to: Math.min(body, a + 6), text: `${r.who ?? ''}　${r.text ?? ''}` }); } off += (s.to - s.from) / 1000 + (gap && i === 0 ? 0.5 : 0); });
  const hAss = `${base}-h.ass`, vAss = `${base}-v.ass`;
  writeFileSync(join(out, hAss), ass(1920, 1080, [
    ...(gap ? [{ from: len0, to: len0 + 0.5, x: 960, y: 520, size: 40, text: `${c.skipMin}分後` }] : []),
    { from: body, to: body + 1.5, x: 960, y: 500, size: 48, text: '続きは24時間ライブで ・ Utsushiyo Project' }]));
  writeFileSync(join(out, vAss), ass(1080, 1920, [
    { from: 0, to: body, x: 540, y: 90, size: 28, text: BRAND }, { from: 0, to: body, x: 540, y: 200, size: 44, text: CH },
    { from: 0, to: body, x: 540, y: 330, ...block(c.top ?? '', 56, 960) },
    ...(gap ? [{ from: len0, to: len0 + 0.5, x: 540, y: 840, size: 40, text: `${c.skipMin}分後` }] : []),
    ...said.map((l) => ({ ...l, x: 540, y: 1300, ...block(l.text, 60, 960) })),
    { from: 0, to: body, x: 540, y: 1820, size: 28, text: '続きは24時間ライブで ・ 住人はAIです' }]));
  const fdir = fontsDir ? `:fontsdir='${fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:')}'` : '';
  const enc = ['-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'];
  const hGraph = `${graph};${parts.join('')}concat=n=${parts.length}:v=1:a=1[vb][ab];color=c=black:s=1920x1080:r=30:d=1.5,setsar=1[ve];anullsrc=r=48000:cl=stereo,atrim=0:1.5[ae];[vb][ab][ve][ae]concat=n=2:v=1:a=1[vc][ah];[vc]ass='${hAss}'${fdir}[vh]`;
  commands.push({ cwd: out, args: ['-y', ...ins, '-filter_complex', hGraph, '-map', '[vh]', '-map', '[ah]', ...enc, `${base}-h.mp4`] });
  const vGraph = `${graph};${parts.join('')}concat=n=${parts.length}:v=1:a=1[vb][ab];[vb]scale=1080:608,setsar=1,pad=1080:1920:0:560:color=0x0b1828,ass='${vAss}'${fdir}[vv]`;
  commands.push({ cwd: out, args: ['-y', ...ins, '-filter_complex', vGraph, '-map', '[vv]', '-map', '[ab]', ...enc, `${base}-v.mp4`] });
  const words = c.kind.startsWith('result') ? c.text : c.top ?? c.text;
  const title = `${c.kind === 'card' ? c.text : `「${(words ?? '').replace(/。$/, '')}」`} ｜ ルマウ`;
  writeFileSync(join(out, `${base}.txt`), `${title}\n\n${Q}\n${liveUrl}\n住人はAIです${date ? `\n${date}` : ''}\n`);
  report.push({ file: base, kind: c.kind, who: c.who, points: c.points, from: new Date(c.segs[0].from + 9 * 3600e3).toISOString().slice(11, 19), seconds: Math.round(body), skipMin: c.skipMin ?? null, checks: c.checks, title });
});
writeFileSync(join(out, 'plan.json'), JSON.stringify({ log: logFile, video: video ?? null, start: startAt, chosen: report, left, commands }, null, 1));
console.log(`candidates ${cands.length}; chosen ${chosen.length}${left.length ? `; left out: ${left.length}` : ''}`);
for (const r of report) console.log(`  ${r.file}  ${r.kind} ${r.who || '-'}  ${r.points} pt  from ${r.from}, ${r.seconds} s${r.skipMin != null ? `, ${r.skipMin} min skipped` : ''}  ${Object.entries(r.checks).map(([k, v]) => `${k} ${v}`).join(' · ')}\n    ${r.title}`);
for (const l of left.slice(0, 8)) console.log(`  left out: ${l}`);
if (plan) { console.log(`${hasFF ? '' : 'ffmpeg not found: '}plan only — the commands are in ${join(out, 'plan.json')}`); process.exit(0); }
let bad = 0;
for (const cmd of commands) { const r = spawnSync(FF, cmd.args, { cwd: cmd.cwd, stdio: ['ignore', 'ignore', 'pipe'] }); if (r.status !== 0) { bad++; console.error(`failed: ${cmd.args.at(-1)}\n${String(r.stderr).slice(-800)}`); } }
// (K8, the loudness: −16 LUFS ±2 on each horizontal cut)
for (const r of report) {
  const m = spawnSync(FF, ['-hide_banner', '-nostats', '-i', join(out, `${r.file}-h.mp4`), '-filter_complex', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(String(m.stderr).split('Summary:').at(-1) ?? '')?.[1];
  const ok = !!I && Math.abs(+I + 16) <= 2; if (!ok) bad++;   // (§6: off the mark, not to be put up)
  console.log(`  ${r.file}: K8 ${I ? `${I} LUFS` : 'loudness not read'} — ${ok ? 'ok' : 'not to be put up (−16 LUFS ±2)'}`);
}
process.exit(bad ? 1 : 0);
