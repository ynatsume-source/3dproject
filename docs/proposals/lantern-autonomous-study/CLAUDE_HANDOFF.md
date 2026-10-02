# Claudeへの引き継ぎ

ランタン1体に、経験を受けて次の行動を選び、星の観察と制作を続ける仕組みを追加した試作です。最新mainの既存の住民・動作を使い、利用者の保存を守るため別モードにしています。

## コピペ用

```text
ynatsume-source/3dproject の codex/lantern-autonomous-study をレビューしてください。
実装コミットは c6827eb12446384bed2fd967da6e9b419b0d2f02、基準mainは fd492b4c94db51f390877a4d76a7891c58a3c250 です。あなたがその後変更した箇所を優先して比較してください。

docs/proposals/lantern-autonomous-study/README.md の実景・動画・完成SVGと、DESIGN.md、検証結果を確認してください。
目的は、ランタンが本人の経験・関心・途中の作品から次の行動を選び、実行結果を記憶して制作を続けることです。
AIが出した文章をそのまま世界の事実にせず、実際に移動して観察/制作が完了した結果だけを記録しています。

?lantern-study#kayama の試作モードで開き、「島の住人」→ランタン→「星の手帖と、いま気になること」から見られます。
AIは初期状態でオフ。既存のAnthropicキーとアトリエ内の明示的な切替で、本人の記憶を使った行動提案が入ります。
今回の検証では実APIを呼んでいません。画像・動画はルール判断、APIは模擬応答での検証です。

通常の住民データは上書きせず、試作では島の住民の状態と記憶を別キーに保存します。画質などの設定、APIキー・使用回数、観賞ログは既存と共通です。
住民は観賞用の早回しとは別の現実時刻で動きます。
通常モードの住民の行動と保存は維持していますが、既存の会話APIにも共通の8秒タイムアウト・回数制限・エラー保護が入っています。

UIの使いやすさ、既存の移動・会話との共存、旧保存の保持、実APIでの選択の多様性と費用を確認し、良い部分を取り込んでください。
本番のAPIキー管理や、通常モード全体の時計移行、長期の作品庫は別途検討してください。ブランチの一括採用を前提にする必要はありません。
```

## ファイルの担当

| ファイル | 役割 |
|---|---|
| `robots/lantern-study-types.ts`, `robots/lantern-study.ts` | 純粋な状態・判断・検査・完了・永続化の形式 |
| `robots/lantern-brain.ts` | 本人に渡す情報、JSON提案、許可済み候補の検査 |
| `robots/mind.ts` | 既存会話と共通のAPI通信、排他、制限、タイムアウト |
| `robots/lantern-sky.ts` | 既存カタログによる星の位置とSVG出力 |
| `robots/residents.ts` | 実際の移動/作業、完了・中断の通知、試作の保存 |
| `robots/models.ts` | 制作中だけ開く小さなスレートと記録する動き |
| `ui/lantern-study.ts`, `.css` | 関心・手帖・記憶・AI切替・SVGダウンロード |
| `ocean/build.ts`, `main.ts` | 試作モード、住民の時刻、天気入力、UIの接続 |

すべて `src/` 以下です。依存関係とロックファイルは変更していません。世界の事実や保存に、LLMが任意の座標・コード・完了報告を書き込む仕組みはありません。

## 最新mainとの比較

作業終了前の取得で、mainは `18c1229fea9f57847020c82e8d076100f588797c` に進んでいました。海面の音・跳躍カメラ・ウミガメの睡眠姿勢・フレーム例外処理の変更です。この試作の基準は `fd492b4` のままです。`git merge-tree --write-tree` による機械的な統合予測では競合なしでしたが、統合後の動作は未検証です。最新mainの修正を保持して取り込み、型検査とブラウザ確認を再実行してください。

## 採用時の注意

- `seaglass.residents.v1` は読み取りだけで、試作の書込先は `seaglass.lantern-study.residents.v1`。試作を通常モードへ移す場合は、この隔離と時計の移行方針を決めてください。設定・APIキー/使用回数・観賞ログは既存と共通です。
- 未完成の作品・観察は保存し、実行中のHTTPやタスクは再開時に中断扱い。既存の住民・日記・共同作業を消しません。
- 追いつき計算は最大12時間。新しい星の観測やAPI通信は行いません。過去の観察を使った制作等には不在中の推定フラグを残します。
- 星のカタログと天文計算には既存と同じ精度制限があります。実際の見え方を計測した星図ではなく、作中の観察記録と幾何学的な星の位置です。
- 会話と判断が共有するAPI上限は単一タブの試作制限です。APIキーのサーバー保持・複数タブの課金制御は未実装。
- 作品6件・記憶48件などの上限があります。長期の愛着を支える作品庫や重要記憶の保持は、次の段階で設計できます。

## 再検証

```sh
npm ci
npm run typecheck
npm run build
npx tsx scripts/lantern-study-check.ts
npx tsx scripts/lantern-brain-check.ts
npx tsx scripts/lantern-sky-check.ts
npx tsx --import ./scripts/node-assets.mjs scripts/lantern-residents-check.ts
npx tsx --import ./scripts/node-assets.mjs scripts/lantern-check.ts
npm run sim -- miyako
```

ブラウザ撮影スクリプトは環境側のPlaywright/ChromiumとFFmpegを使います。アプリの依存関係には追加していません。撮影時刻を制御し、実際の行動更新から生成した作品を取得します。fixtureによるUI単体検証と、実際の島での記録を混同しないでください。
