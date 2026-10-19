// The live screen's captions (viewer design v2 §5, L5): what is said, and the island's firsts, handed to the stream PC's
// own caption sender (tools/live/captions.mjs, on this machine) — which posts them to YouTube. Only with ?captions=<url>;
// otherwise nothing is sent. Each line once, in the screen's own language, stamped with the real time it appeared.
export interface CaptionSender { send(text: string, worldMs: number): void }

export function captionSender(url: string | null): CaptionSender {
  if (!url || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) return { send() {} };   // (the stream PC's own sender only)
  let last = '';
  return {
    send(text: string) {
      const t = text.trim(); if (!t || t === last) return; last = t;
      // (the real time it appeared: the stream's own timeline; a failed send is not tried again — a caption late is no use)
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, at: Date.now() }) }).catch(() => {});
    },
  };
}
