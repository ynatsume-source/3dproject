# 設計ボードの画像と操作確認

ここにある画像は `../design-board.html` の **固定シナリオによる設計の説明図**。本番の島、実 AI の自律行動、物理・経路探索、共有サーバーの実行結果ではない。

| ファイル | 内容 |
|---|---|
| `design-board-desktop.png` | 林縁・雨・段階6「直す」、1440 px 幅 |
| `design-board-assembly.png` | 林縁・雨・段階4「建てる」。骨組みは雨よけにならない |
| `design-board-shore.png` | 海辺・晴れ・段階6。風対策の材と手入れが必要な敷地の例 |
| `design-board-mobile.png` | 林縁・雨・段階6、390 px 幅 |
| `design-board-concept.svg` | ボードの保存ボタンから出力した、同じ段階の自己完結した概念図 |
| `design-board-concept.png` | 上記 SVG を単独で開いた画像、1200 × 720 px |
| `design-board-browser-report.json` | 操作確認の結果、描画した HTML の SHA-256、ブラウザの版 |

## 再現

手動の閲覧は HTML をブラウザで開くだけでよい。外部の画像・フォント・API・アプリのビルドは不要。以下は画像と確認記録を再生成するときの手順。

リポジトリのルートで、まず静的サーバーを起動する。

```sh
python3 -m http.server 4194 --bind 127.0.0.1
```

別のターミナルで、Playwright を利用できる Node 環境から実行する。リポジトリの依存には追加していない。

```sh
node docs/proposals/creative-world/images/capture.cjs
```

Chromium は初期値 `/usr/bin/chromium`。別の場所なら `CHROMIUM_PATH`、異なる URL なら `CAPTURE_URL` を指定する。スクリプトはこのディレクトリ内の画像・SVG・JSON を上書きする。製品の保存データは読まず、書かない。

確認は 7 段階 × 2 天候 × 2 敷地の28組合せ、未完成の雨よけ無効表示、条件に応じた説明、共有履歴の表示、キーボード操作、390 px での横方向はみ出し、SVG 出力・単独表示、外部 HTTP 通信なし、JavaScript/console エラーなし、localStorage/sessionStorage 未使用の計40項目。これは説明ボードの確認であり、世界の収支や住民の自律性を検証するものではない。

材料の数は説明用の仮定。現場で取り置いた材は骨組みに使用し、使用後の置き場は空で描く。屋根・机・改修・海辺の支えには追加搬入した材を使う表現に揃えている。敷地の切替も、実際の島を移設する操作ではない。
