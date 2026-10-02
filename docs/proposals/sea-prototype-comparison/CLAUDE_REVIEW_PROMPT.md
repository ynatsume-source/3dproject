# Claude へ渡す依頼

紅海北部カルナティック号の改善と、新しい海の制作について、先行版と GPT-6 Astra・Ultra 版ができました。以下4ブランチを比較し、画面の出来・実在する環境との整合性・描画負荷・保守しやすさを根拠に、良いものを選んで調整・統合してください。

対象リポジトリ: `ynatsume-source/3dproject`

1. `codex/carnatic-wreck-detail`
   - 資料: `docs/proposals/carnatic-wreck/README.md` と `CLAUDE_HANDOFF.md`
2. `astra/carnatic-wreck-ultra`
   - 資料: `docs/proposals/astra-carnatic/README.md` と `CLAUDE_HANDOFF.md`
3. `codex/monterey-kelp-prototype`
   - 資料: `docs/proposals/monterey-kelp/README.md` と `CLAUDE_HANDOFF.md`
4. `astra/new-sea-ultra`
   - 資料: `docs/proposals/astra-new-sea/README.md` と `CLAUDE_HANDOFF.md`

比較資料: `review/sea-prototype-comparison` ブランチの `docs/proposals/sea-prototype-comparison/README.md`。

進め方:

- 現在の作業と未コミットの変更を保護し、まず fetch と資料・差分の確認から始める。
- 4案は同じ `7124cc6` を開始点にしている。最新 main や進行中の住民改修を、この古い開始点の状態に戻さない。
- Astra版は複数コミットに分かれているため、最新の1コミットだけでなく `7124cc6` から各ブランチ先端までの累積差分を読む。
- 比較資料の `INTEGRATION_NOTES.md` を先に読む。main `4219cb0` では海底生成が変わっており、新海域案のサンゴ重み0判定は `coralAt()` 内で `continue` から `return` への適応が必要。区画生成・`cur.grow`・`ZONE`・`T.nearFish` を保つ。
- 沈没船は同じ日時・カメラで比較し、新海域は森の中層・水面側・海底・夜・既存海域への往復で確認する。
- 新海域2案はモントレー湾と近隣のポイントロボスのケルプ林。採用する体験としてどちらが良いか判断し、必要なら良い部品を組み合わせる。両方を追加する場合は、体験が重複しない理由を説明する。
- 一括で4ブランチを merge せず、採用する形状・材質・動き・地形・UIの差分を選ぶ。モデル名は制作来歴として記録し、判断は具体的な画面・コード・検証結果に基づける。
- 実船写真、現地環境、生物の同定は推定部分を照合する。未確認ならその範囲を説明に残す。
- 選んだ案と、必要なら混ぜる部分・採用しない部分を短く示したうえで、既存の開発方針に沿って実装を進める。
- 統合後に型検査・ビルド・必要なモデル/生態系検査・ブラウザ描画と画面遷移を確認。可能な実機で負荷も確認する。公開は現在のプロジェクトの運用に従う。

世界の目標は、静かに眺めることで孤独が和らぎ、地球の美しさを実在するものとして感じられることです。その体験に寄与する表現を優先してください。
