// The body YouTube's caption ingestion takes (an HTTP POST per caption, to the stream's caption URL with &seq=N): a
// timestamp in UTC — YYYY-MM-DDTHH:MM:SS.mmm, no zone letter — on its own line, then the caption's text. A caption is
// two lines at most of 42 characters, broken at a space; a longer line goes on in the next caption, after the time it
// takes to read the one before: max(2.5 s, its characters ÷ 15 a second).
export function captionStamp(ms) {
  return new Date(ms).toISOString().replace('Z', '');
}
/** The text as caption-sized pieces: each at most two lines of `width`, broken at spaces (a word longer than a line
 *  stays whole). */
export function captionPieces(text, width = 42) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean), lines = [];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur !== undefined && (cur + ' ' + w).length <= width) lines[lines.length - 1] = cur + ' ' + w;
    else lines.push(w);
  }
  const pieces = [];
  for (let i = 0; i < lines.length; i += 2) pieces.push(lines.slice(i, i + 2).join('\n'));
  return pieces;
}
/** How long a caption is left to be read: max(2.5 s, its characters at 15 a second). */
export const readMs = (piece) => Math.max(2500, Math.round(piece.replace(/\n/g, ' ').length / 15 * 1000));
/** The bodies to post for one line said: one per piece, each stamped once the one before has been read. */
export function captionBodies(text, ms) {
  let at = ms;
  return captionPieces(text).map((p) => { const b = `${captionStamp(at)}\n${p}\n`; at += readMs(p); return b; });
}
