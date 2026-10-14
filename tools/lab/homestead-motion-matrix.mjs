// Sequential offline capture: do not compete for the software renderer.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=process.argv[2];if(!root)throw Error('Output root required');
for(const [variant,port,source] of [['v2','5324','/workspace/homestead-v2-motion'],['v3','5323',process.cwd()]]) {
 const out=`${root}/motion-${variant}`;fs.mkdirSync(out,{recursive:true});const log=fs.openSync(out+'/run.log','w');
 console.log('START',variant);
 try {execFileSync(process.execPath,['tools/lab/homestead-motion.mjs'],{env:{...process.env,URL:`http://127.0.0.1:${port}`,SOURCE_ROOT:source,FIXTURE:'docs/proposals/homestead-style-2026-10-14/evidence/fixture.json',OUT:out},stdio:['ignore',log,log]});}finally{fs.closeSync(log)}
 console.log('DONE',variant);
 execFileSync('ffmpeg',['-y','-framerate','8','-i',out+'/frames/%03d.png','-c:v','libx264','-pix_fmt','yuv420p','-crf','18',out+'/motion.mp4'],{stdio:'ignore'});
}
