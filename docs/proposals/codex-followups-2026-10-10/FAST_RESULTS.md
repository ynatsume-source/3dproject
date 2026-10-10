# Fast 検査の結果（2026-10-10）

`npm run check:fast -- --out /tmp/codex-followups-fast`：37本をすべて実行、36本 PASS、journal の同期子プロセス起動で環境 EPERM、集約 exit 1。失敗を無視しなかった。

journal を非同期起動へ修正後、`node scripts/checks.mjs fast --only journal --out /tmp/codex-followups-journal-recheck`：PASS、exit 0。それ以外の検査に関係するコードは一括実行後に変更していない。全一括の再実行は行っていない。

| 検査 | 最終確認 | 秒 | 備考 |
|---|---|---:|---|
| assembly | passed | 0.277 | 一括実行 |
| body | passed | 0.872 | 一括実行 |
| house | passed | 46.092 | 一括実行 |
| hypo | passed | 11.574 | 一括実行 |
| island-science | passed | 1.424 | 一括実行 |
| island-time | passed | 0.65 | 一括実行 |
| journal | passed | 0.925 | 初回 EPERM、修正後の単独再実行 |
| lamp | passed | 15.147 | 一括実行 |
| lantern | passed | 0.338 | 一括実行 |
| lantern-brain | passed | 0.233 | 一括実行 |
| lantern-residents | passed | 1.109 | 一括実行 |
| lantern-sky | passed | 0.191 | 一括実行 |
| lantern-study | passed | 0.235 | 一括実行 |
| lumau | passed | 0.24 | 一括実行 |
| map | passed | 15.801 | 一括実行 |
| mind | passed | 2.294 | 一括実行 |
| nav | passed | 1.138 | 一括実行 |
| pottery-host | passed | 0.425 | 一括実行 |
| process-runner | passed | 0.448 | 一括実行 |
| science-barometer-pot | passed | 1.126 | 一括実行 |
| science-charcoal | passed | 0.846 | 一括実行 |
| science-clay-prep | passed | 0.679 | 一括実行 |
| science-fired-pot-assembly | passed | 0.379 | 一括実行 |
| science-firewood | passed | 1.271 | 一括実行 |
| science-integration | passed | 0.145 | 一括実行 |
| science-oil-lamp | passed | 0.878 | 一括実行 |
| science-pit-fire | passed | 1.285 | 一括実行 |
| science-pottery | passed | 1.206 | 一括実行 |
| science-vessel | passed | 0.613 | 一括実行 |
| settle | passed | 20.094 | 一括実行 |
| social | passed | 17.754 | 一括実行 |
| values | passed | 0.165 | 一括実行 |
| wall | passed | 11.037 | 一括実行 |
| wear | passed | 2.267 | 一括実行 |
| words | passed | 0.664 | 一括実行 |
| world-switch | passed | 1.283 | 一括実行 |
| worlds | passed | 0.317 | 一括実行 |

終了コードと JSON は上記 `/tmp` ディレクトリに保存。初回 runner は子の出力を pipe 経由で受け、検査の明示的な `process.exit()` で標準出力が失われていた。ログfdへの直接出力に修正し、journal・world-switch・worlds を `/tmp/codex-followups-log-recheck` で再実行：全3本 PASS、各ログ24・33・11行で本文も保存できた。ほかの初回ログは runner のヘッダと終了結果が中心で、全検査の出力本文が残っているとは扱わない。数値はこのローカル環境の実時間であり、CI の性能保証ではない。
