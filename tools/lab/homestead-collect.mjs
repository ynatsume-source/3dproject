// Preserve raw reports; label the runner checkout separately from the code served by each preview.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=process.argv[2],out='docs/proposals/homestead-style-2026-10-14/evidence';
const cases=['desktop-home-wide-day','phone-home-wide-day','desktop-home-wide-evening','phone-home-wide-evening','desktop-home-wide-night','phone-home-wide-night','desktop-home-near-day'];
const datasets={};
for(const variant of ['before','after']) {
 const reports=[];
 for(const id of cases) {
  const dir=id==='desktop-home-wide-day'?`${root}/${variant}-fast`:`${root}/${variant}-${id}`;
  const file=dir+'/report.json',r=JSON.parse(fs.readFileSync(file));assert.equal(r.failures.length,0);assert.equal(r.measurements.length,1);assert.equal(r.measurements[0].id,id);
  reports.push(r);fs.mkdirSync(`${out}/raw`,{recursive:true});fs.copyFileSync(file,`${out}/raw/${variant}-${id}.json`);fs.copyFileSync(dir+'/'+id+'.png',`${out}/${variant}/${id}.png`);
 }
 for(const r of reports)for(const key of ['fixtureSha256','browser','harnessSha256'])assert.equal(r[key],reports[0][key],key+' differs across captures');
 const repo=variant==='before'?'/workspace/casuarina-visual-study/baseline-app':process.cwd();
 const commit=variant==='before'?'c29829f53a2e19852ced6650ecefdff34473edbc':'45d61c9ec900977a27e3467af50c643f0e538685';
 assert.equal(execFileSync('git',['diff',commit,'--','src/'],{cwd:repo,encoding:'utf8'}),'','Served source changed since declared code commit');
 const bundle=fs.readdirSync(repo+'/dist/assets').filter(f=>/^main-.*\.js$/.test(f)).map(f=>({name:f,sha256:createHash('sha256').update(fs.readFileSync(repo+'/dist/assets/'+f)).digest('hex')}));
 assert(bundle.length>0);
 const combined={...reports[0],sourceCommit:commit,sourceNote:'Source commit is the served application code; later commits only add harness/docs/evidence. Raw report sourceCommit identifies the runner checkout, which captured both URLs.',servedBundles:bundle,measurements:reports.flatMap(r=>r.measurements),runnerCheckouts:reports.map(r=>r.sourceCommit)};
 delete combined.sourceSha256;
 datasets[variant]=combined;fs.writeFileSync(`${out}/${variant}-report.json`,JSON.stringify(combined,null,2)+'\n');
}
// The comparison rejects differing camera, time, quality, save, RNG, browser, or harness.
const compared=execFileSync(process.execPath,['tools/lab/homestead-compare.mjs',`${out}/before-report.json`,`${out}/after-report.json`],{encoding:'utf8'});
fs.writeFileSync(`${out}/comparison.json`,compared);console.log(compared);

const result=JSON.parse(compared);let md='# 同条件比較の結果\n\n全7ケースで保存・乱数・カメラ・時刻・画質・オブジェクト数・Mesh数が変更前後一致。draw callsと三角形は全描画passの合計。同期フレーム時間はSwiftShaderの3サンプル中央値で実機FPSではない。共有CPUのばらつきや短いwarmupがあるため、比の大小だけで性能の優劣を結論しない。\n\n|ケース|画像|draw calls 前→後|三角形 前→後|中央値ms 前→後|時間比 後/前|\n|---|---|---|---|---|---|\n';
for(const r of result.rows)md+=`|${r.case}|[前](evidence/before/${r.case}.png) / [後](evidence/after/${r.case}.png)|${r.beforeCalls}→${r.afterCalls}|${r.beforeTriangles}→${r.afterTriangles}|${r.beforeMs.toFixed(1)}→${r.afterMs.toFixed(1)}|${r.relativeMedian.toFixed(3)}×|\n`;
md+='\n近景の移動診断（最大二階明度差0.12超の全画面画素率）：\n';
for(const r of result.rows)if(r.beforeFlicker)md+=`\n- ${r.case}: ${(r.beforeFlicker.over12*100).toFixed(5)}% → ${(r.afterFlicker.over12*100).toFixed(5)}%。${r.beforeFlicker.frames}フレーム。\n`;
md+='\nこれは色・輪郭・影にも依存する比較診断。純粋なaliasingの分離や合格判定ではなく、実機・長時間・複数視点の確認は未実施。\n';
fs.writeFileSync(path.dirname(out)+'/RESULTS.md',md);
