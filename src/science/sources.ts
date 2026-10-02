// Source cards for the clay loop. Retrieval state is recorded honestly:
//   'retrieved'        – source text was read (OpenStax CNXML at a pinned commit; see data/science/sources.json)
//   'archive-copy'     – text read in a third-party archive copy (original publisher not verified; not for calibration)
//   'search-summary'   – only a web-search result summary was seen (2026-10-02); page text NOT read.
//                        Numbers below are what the summary said and must be checked before citing.
//   'not-found'        – nothing usable located
// A param may point at a card in any state; params.ts status decides whether the number counts as sourced.

export type Retrieval = 'retrieved' | 'archive-copy' | 'search-summary' | 'not-found';

export interface SourceCard {
  id: string;
  topic: string;
  retrieval: Retrieval;
  /** Where to verify; names of sites/documents as given by search results. */
  candidates: string[];
  /** What the search summary claimed. Not verified. */
  summaryClaims: string[];
  /** How the model uses it, and what it does not claim. */
  modelUse: string;
}

export const SOURCES: SourceCard[] = [
  { id: 'S-dry', topic: '粘土の乾燥と収縮', retrieval: 'archive-copy',
    candidates: ['Digitalfire「Drying Shrinkage」「Drying Performance」「LDW」「DFAC」の保存コピー（AngelOnFira/potter@59f128a、data/science/sources.json の digitalfire-archive-*）', '粘土供給会社の技術資料（leather hard）'],
    summaryClaims: ['収縮はレザーハード（含水12〜14%前後）でほぼ止まる', '一般的な粘土の乾燥収縮は4〜6%、製品例で4.75〜7.4%', '可塑水20.6〜36%（製品例）', '速さより均一な乾燥が重要'],
    modelUse: '収縮期と非収縮期の二段乾燥、折れ点0.13、全収縮6%、可塑水0.24を試験粘土Aの仮定値に使う。保存コピーでは、乾燥収縮の定義＝(湿潤長−乾燥長)/湿潤長、典型的な陶土で約6%、含水率は湿量基準。どれも原典未照合で、実測の時系列はない。厚さと割れの関係は未確認の設計仮定' },
  { id: 'S-slake', topic: '未焼成粘土は水で崩れ再生でき、焼成後は戻らない', retrieval: 'search-summary',
    candidates: ['陶芸材料の解説（reclaiming clay）'],
    summaryClaims: ['未焼成の粘土は再生可能、焼成後は不可（温度の記載なし）'],
    modelUse: '脱水が不十分な試験体は浸漬で崩れる。境界の「脱水90%」はゲームの校正値' },
  { id: 'S-kaol', topic: 'カオリナイトの脱水', retrieval: 'search-summary',
    candidates: ['Ceramics-Silikáty（2007）カオリナイトの脱水に関する論文'],
    summaryClaims: ['質量減少13.96%', '開始420〜450 °C、ピーク500〜560 °C', 'Al2Si2O5(OH)4 → Al2Si2O7 + 2H2O'],
    modelUse: '反応式と質量減少は化学量論から計算（元素収支で検査）。温度窓に合わせて速度式を校正。吸熱量は見つからず仮定値' },
  { id: 'S-quartz', topic: '石英転移とダンティング', retrieval: 'search-summary',
    candidates: ['Digitalfire（quartz inversion, dunting）'],
    summaryClaims: ['573 °Cで線膨張約0.45%', '急冷でダンティング。大物では50 °C/h以下の推奨例', 'クリストバライトは約200〜220 °C、1100 °C超で生成'],
    modelUse: '573 °C通過時の温度変化速度で割れ確率。小試験体の許容600 K/hは校正値。クリストバライトはv0対象外（低温焼成）' },
  { id: 'S-steam', topic: '残留水分と急昇温による水蒸気割れ', retrieval: 'search-summary',
    candidates: ['陶芸の焼成解説（candling, water smoking）'],
    summaryClaims: ['100 °C付近の水蒸気放出は250 °Cまでに終える', '85〜93 °Cや100〜120 °Cで保持する例'],
    modelUse: '100〜250 °Cを通るときの含水率と昇温速度で割れ確率。閾値は校正値' },
  { id: 'S-calc', topic: '炭酸カルシウムの分解と生石灰の再水和', retrieval: 'search-summary',
    candidates: ['陶芸材料・石灰の解説（複数）'],
    summaryClaims: ['分解温度は資料により約700/800/900 °C', '残ったCaOが湿気を吸ってはじける（ライムポップ）'],
    modelUse: '反応式は化学量論。700〜900 °Cの窓に速度式を校正。標準反応熱178 kJ/molは一般値として仮定。ライムポップはv0未実装' },
  { id: 'S-fire', topic: '焼成温度帯', retrieval: 'search-summary',
    candidates: ['考古学・陶芸の野焼き解説', '陶芸材料の焼成温度表'],
    summaryClaims: ['野焼きは600 °C程度から、800〜1100 °Cが多い', '土器・陶器1000〜1200 °C、炻器1100〜1300 °C（重なる）'],
    modelUse: '試験世界の焚き火（最高約720 °C）と試験窯（1000 °C到達可）の能力設定の目安' },
  { id: 'S-abs', topic: '吸水率と試験法', retrieval: 'archive-copy',
    candidates: ['Digitalfire「SHAB」の保存コピー（digitalfire-archive-shab）：ABS=(煮沸後−焼成後)/焼成後×100、5時間煮沸＋19時間浸漬', 'ASTM C373（特許文献・第三者の写しによる記述）', '焼成温度と吸水率の研究（850 °Cで18.3%、1200 °Cで5.5%）'],
    summaryClaims: ['150 °C乾燥、5時間煮沸、24時間浸漬、吸水率=(飽水−乾燥)/乾燥×100', '焼成温度が上がると吸水率が下がる例'],
    modelUse: '吸水率の定義式はそのまま。v0の測定は燃料を使わない24時間冷水浸漬で、煮沸値の0.8倍と仮定（未確認）' },
  { id: 'S-glow', topic: '炎・炉内の色と温度', retrieval: 'search-summary',
    candidates: ['Stirling（1905）の色温度表', '電気窯メーカーの色見本表'],
    summaryClaims: ['暗赤約700 °C、桜赤800〜1000 °C、橙約1100 °C、白1300 °C以上', '別の表とは最大約200 °C食い違う'],
    modelUse: '計器のない住民には色の区分だけを渡す。区分の境界は粗く、資料間の差を残す' },
  { id: 'S-latent', topic: '水の蒸発潜熱', retrieval: 'retrieved',
    candidates: ['OpenStax College Physics「Phase Change and Latent Heat」(m42225) — openstax/osbooks-college-physics-bundle@fd1b25d, blob 9e2415b'],
    summaryClaims: ['表：水の Lv は 100 °C で 2256 kJ/kg', '本文：37 °C での Lv は 2430 kJ/kg', '沸点未満でも蒸発し熱を奪う。湿度が高いと蒸発が抑えられる'],
    modelUse: '100 °C は 2.256 MJ/kg。常温乾燥は 37 °C の値 2.43 MJ/kg で代用（25〜28 °C の値は出典になし）。照合：Codex（GitHub コネクタ）と科学側 Claude（git で同じ blob を取得し本文を確認）の二者' },
  { id: 'S-heatcap', topic: '熱と温度の区別、Q = mcΔT、比熱', retrieval: 'retrieved',
    candidates: ['OpenStax「Heat」(m42223) blob 8edc973', 'OpenStax「Temperature Change and Heat Capacity」(m42224) blob 1ce2eba'],
    summaryClaims: ['熱は温度差による自発的なエネルギーの移動で、温度とは別物', 'Q = mcΔT、水 4186 J/(kg·°C)（15 °C）', '表：コンクリート・花崗岩 840、ガラス 840 J/(kg·°C)（粘土はない）'],
    modelUse: '温度と熱量を分ける設計の根拠。粘土の比熱そのものは出典になく、仮定のまま' },
  { id: 'S-cp', topic: '焼成体の比熱', retrieval: 'search-summary', candidates: ['工学定数表（fired brick）'],
    summaryClaims: ['800〜900 J/(kg·K)'], modelUse: '0.9 J/(g·K)で一定' },
  { id: 'S-comb', topic: '炭素の燃焼熱', retrieval: 'not-found', candidates: [], summaryClaims: [],
    modelUse: '393.5 kJ/molは一般的な標準値として仮定（今回未照合）' },
  { id: 'S-wood', topic: '木材の発熱量・組成・灰分', retrieval: 'search-summary', candidates: ['木質燃料の解説'],
    summaryClaims: ['乾燥木材18.5〜21.0 MJ/kg（高位か低位か不明）', 'C50/H6/O44%前後', '灰分の数値は見つからず'],
    modelUse: '絶乾LHV 18 MJ/kg、組成CH1.44O0.66、灰1%を仮定。含水分は蒸発潜熱を差し引く' },
  { id: 'S-kilneff', topic: '薪窯の熱効率', retrieval: 'search-summary', candidates: ['タイの薪窯の測定（18%）', 'ガーナの薪窯（12.4〜21.6%）'],
    summaryClaims: ['熱効率は12〜22%程度、煙突損失が最大'],
    modelUse: '燃焼熱の30%が炉内へ入り、さらに壁から失う構成。結果として製品への熱は数%以下になる' },
  { id: 'S-local', topic: '嘉弥真島・八重山の粘土', retrieval: 'not-found',
    candidates: ['八重山の焼物（パナリ焼：島の粘土と砕いた貝を混ぜ、野焼き、17〜19世紀）— 検索要約のみ'],
    summaryClaims: ['嘉弥真島の粘土・地質の資料は見つからない'],
    modelUse: '嘉弥真島の資源は追加しない。試験粘土Aは仮想の試験材料' },
];

export const sourceById = (id: string): SourceCard | undefined => SOURCES.find((s) => s.id === id);
