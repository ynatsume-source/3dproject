// The stream PC's caption sender (viewer design v2 §5, L5). The live page (?live&lang=en&captions=http://127.0.0.1:8787/caption)
// hands it each line as it appears; it posts them, one at a time and in order, to the stream's YouTube caption
// ingestion URL (YouTube Studio → the stream's settings → closed captions → "POST captions to URL"), each with &seq=N.
// Captions over HTTP POST add delay to the stream: set the stream's latency to normal and a 30 s delay (stream notes).
// Without CID_URL it only logs (a dry run). Each line is logged as JSONL either way.
// Usage: CID_URL='https://upload.youtube.com/closedcaption?cid=…' PORT=8787 LOG=captions.jsonl node tools/live/captions.mjs
import http from 'node:http';
import fs from 'node:fs';
import { captionBodies } from './caption-format.mjs';

const CID = process.env.CID_URL || '', PORT = +(process.env.PORT || 8787), LOG = process.env.LOG || 'captions.jsonl';
let seq = +(process.env.SEQ || 1), busy = false;
const queue = [];
const log = (o) => fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');

async function pump() {
  if (busy) return; busy = true;
  while (queue.length) {
    const c = queue.shift();
    for (const body of captionBodies(c.text, c.at)) {
      const n = seq++;
      if (!CID) { log({ seq: n, dry: true, body }); continue; }
      try {
        const r = await fetch(`${CID}&seq=${n}`, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body });
        log({ seq: n, status: r.status, reply: r.ok ? undefined : (await r.text()).slice(0, 200), text: c.text });
      } catch (e) { log({ seq: n, error: String(e), text: c.text }); }
    }
  }
  busy = false;
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.method !== 'POST' || !req.url?.startsWith('/caption')) { res.writeHead(404).end(); return; }
  let raw = '';
  req.on('data', (d) => { raw += d; if (raw.length > 4000) req.destroy(); });
  req.on('end', () => {
    try {
      const { text, at } = JSON.parse(raw);
      if (typeof text !== 'string' || !text.trim() || !Number.isFinite(at)) throw new Error('bad caption');
      queue.push({ text: text.slice(0, 300), at }); pump();
      res.writeHead(204).end();
    } catch { res.writeHead(400).end(); }
  });
}).listen(PORT, '127.0.0.1', () => console.log(`captions: on 127.0.0.1:${PORT}${CID ? '' : ' (dry run: no CID_URL)'}; log ${LOG}`));
