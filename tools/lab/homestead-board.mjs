import fs from 'node:fs';
import {chromium} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='docs/proposals/homestead-style-2026-10-14/evidence';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});
try{
 const page=await browser.newPage({viewport:{width:2560,height:810},deviceScaleFactor:1});
 await page.setContent(`<style>body{margin:0;font:22px system-ui;color:#f2eee0;background:#334337}header{height:50px;box-sizing:border-box;padding:8px 24px}main{display:flex}section{width:1280px}p{margin:0;height:40px;padding:4px 24px;box-sizing:border-box}img{display:block;width:1280px;height:720px}</style><header>拠点25mの小試作・本体統合前 ／ 同じ人工保存・同じカメラ・昼12:00</header><main>${['before','after'].map((v,i)=>`<section><p>${i?'試作：若木・薪棚・作業台・焚き火の石のみ':'変更前：main c29829f'}</p><img src="data:image/png;base64,${fs.readFileSync(`${root}/${v}/desktop-home-wide-day.png`).toString('base64')}"></section>`).join('')}</main>`);
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:root+'/day-comparison.png'});
}finally{await browser.close()}
