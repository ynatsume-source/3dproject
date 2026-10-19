// The body YouTube's caption ingestion takes (an HTTP POST per caption, to the stream's caption URL with &seq=N): a
// timestamp in UTC — YYYY-MM-DDTHH:MM:SS.mmm, no zone letter — on its own line, then the caption's text. A caption is
// two lines at most of 42 characters, broken at a space; a longer line goes on in the next caption, 2.5 s later.
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
/** The bodies to post for one line said: one per piece, each stamped 2.5 s after the one before. */
export function captionBodies(text, ms) {
  return captionPieces(text).map((p, i) => `${captionStamp(ms + i * 2500)}\n${p}\n`);
}
