// Collect paired offline captures; fail before making claims if replay conditions differ.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.argv[2],out='docs/proposals/homestead-style-2026-10-14/v3/extra';
if(!root)throw Error('Pass raw capture root');
fs.mkdirSync(out,{recursive:true});
for(const kind of ['extra','motion']) {
 const dirs=['before','after'].map(v=>path.join(root,`${kind}-${v}`));
 const reports=dirs.map(d=>JSON.parse(fs.readFileSync(d+'/report.json','utf8')));
 const compared=execFileSync(process.execPath,['tools/lab/homestead-compare.mjs',...dirs.map(d=>d+'/report.json')],{encoding:'utf8'});
 fs.writeFileSync(`${out}/${kind}-comparison.json`,compared);
 for(let i=0;i<dirs.length;i++)fs.copyFileSync(dirs[i]+'/report.json',`${out}/${kind}-${i?'after':'before'}-report.json`);
 if(kind==='extra') {
  assert.equal(reports[0].measurements.length,5,'Expected five additional cases');
  for(let i=0;i<dirs.length;i++)for(const row of reports[i].measurements)fs.copyFileSync(`${dirs[i]}/${row.id}.png`,`${out}/${i?'after':'before'}-${row.id}.png`);
 } else {
  const rows=reports.map(r=>r.measurements[0]);
  assert.equal(rows[0].motionFrames.length,12);
  for(const row of rows){assert.equal(row.motionRenderCounts.length,12);assert(row.motionRenderCounts.every(c=>Number.isFinite(c.calls)&&c.calls>0&&Number.isFinite(c.triangles)&&c.triangles>0),'Missing frame render counts');}
  assert.deepEqual(rows[0].motionFrames,rows[1].motionFrames,'Motion camera/rotation/projection/clock/RNG differs');
  assert.equal(rows[0].motionEndStateSha256,rows[1].motionEndStateSha256,'End save differs');
  const deltas=rows[0].motionRenderCounts.map((a,i)=>({frame:i,calls:rows[1].motionRenderCounts[i].calls-a.calls,triangles:rows[1].motionRenderCounts[i].triangles-a.triangles}));
  fs.writeFileSync(`${out}/motion-render-deltas.json`,JSON.stringify({note:'Compare matching frames; total scene counts can change during existing world updates.',deltas},null,2)+'\n');
  const hashes=dirs.map(d=>fs.readdirSync(d+'/frames').filter(n=>n.endsWith('.png')).sort().map(n=>({file:n,sha256:createHash('sha256').update(fs.readFileSync(d+'/frames/'+n)).digest('hex')})));
  assert(hashes.every(h=>h.length===12));
  fs.writeFileSync(`${out}/motion-frame-hashes.json`,JSON.stringify({note:'12 offline frames each; camera, rotation, projection, clock, RNG and end save match. PNG hashes before encoding.',variants:hashes},null,2)+'\n');
  execFileSync('ffmpeg',['-y','-framerate','8','-i',dirs[0]+'/frames/%03d.png','-framerate','8','-i',dirs[1]+'/frames/%03d.png','-filter_complex','[0:v][1:v]hstack=inputs=2','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',`${out}/motion-comparison.mp4`],{stdio:'ignore'});
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,nb_frames,r_frame_rate,duration','-of','json',`${out}/motion-comparison.mp4`],{encoding:'utf8'}));
  assert.equal(probe.streams[0].nb_frames,'12');assert.equal(probe.streams[0].r_frame_rate,'8/1');assert.equal(probe.streams[0].width,780);assert.equal(probe.streams[0].height,844);
  fs.writeFileSync(`${out}/motion-video-info.json`,JSON.stringify(probe,null,2)+'\n');
 }
}
console.log('PASS: five static pairs and twelve motion frames match replay conditions; video encoding verified.');
