# ローカル検証記録

開始点：`4b5397773a0a0abddb0b19f9c849292dd45d996c`。環境：Node 24.19.0 / npm 11.9.0。接続済み GitHub ツールで署名付き commit・tree・blob を読み、すべて Git SHA を検証して取得した。main への書き込みはしていない。

| コマンド | 結果 |
| --- | --- |
| `npx tsc --noEmit -p .` | 終了0 |
| `npm run build` | 終了0、Vite・OG・島だよりページ生成成功 |
| `node scripts/checks.mjs all --list` | 終了0、89本すべて登録済み（fast 37 / slow 52） |
| `node scripts/checks.mjs fast --out /tmp/codex-followups2-results/fast` | 終了0、37 assertion passes / 0 diagnostics / 0 failures、合計151.356秒、最長house 45.599秒 |
| `node --import tsx --import ./scripts/node-assets.mjs scripts/world-switch-check.ts` | 終了0、53項目成功 |
| `node --check scripts/worlds-browser-check.mjs` | 終了0 |
| `npm run check:browser -- --help` | 終了0 |
| PyYAML `safe_load`（headless / browser workflow） | 構文成功 |
| `git diff --check` | 終了0 |
| 保護範囲の `git diff --exit-code` | 終了0、差分なし |

## 修正前の再現

最初に hashchange が未接続である検査を追加し、修正前に終了1を確認した。完成した回帰検査でも開始点の実ソースを指定すると13項目失敗する。

```sh
git show 4b5397773a0a0abddb0b19f9c849292dd45d996c:src/main.ts > /tmp/codex-followups2-main-baseline.ts
WORLD_SWITCH_MAIN=/tmp/codex-followups2-main-baseline.ts node --import tsx --import ./scripts/node-assets.mjs scripts/world-switch-check.ts
```

世界識別子・保存の既存27項目は開始点でも成功し、hash-only の両順、連続要求、UI 読込中の hash 変更、未知 hash による古い保留の取消、起動待ちの変更などが失敗した。検査は TypeScript AST から実際の main.ts の関数と hash controller 初期化を取り出して動かし、描画・地形・時間待ちだけを代用する。海モードのまま潜水して globe tween が停止する経路も fixture で検知する。

修正後の53項目はすべて成功。キャッシュ・住人保存・旧形式の扱いは前回実装の回帰として引き続き検査する。

## ブラウザ・slow の境界

本ブラウザ実行は Chromium 起動の `setsockopt EPERM` / `SIGTRAP` により終了2、0段階。localhost listen も `EPERM`。詳細コマンドと結果は [BROWSER_CHECK.md](BROWSER_CHECK.md)。環境権限待ちは追加していない。

slow の52本はローカルでは今回実行していない。07:36 UTC の確認時点では GitHub にも結果がなかったが、引き渡し前の17:41 UTC以降の再確認で夜間実行の52本と6失敗を取得した。[CI_RESULTS.md](CI_RESULTS.md) と HANDOFF に追加してあり、未実行のまま扱ったり失敗を除外したりしていない。前回の bait の失敗も未解決（[前回 HANDOFF](../codex-followups-2026-10-10/HANDOFF.md)）。科学や住人の工程に対する source 修正は行っていない。
