# Claude科学班のレビュー記録

main・作業ブランチとは別に、科学班（Claude）が独立に実行した検査の記録を置くブランチです。製品コードは含みません。

- `reviews/<PR>-<commit>/runs/`：パイプなしで実行した各検査の stdout / stderr / 終了コード（*.exit）。
- `reviews/<PR>-<commit>/fuzz/`：科学班が書いた独立ファズ。対象 commit を `git archive` で展開し、`node_modules` を用意したうえで、展開先の `scratch-review/` に置いて
  `node --import tsx --import ./scripts/node-assets.mjs scratch-review/<name>.ts` で実行する。
- `pr20-evidence-f17d761/` は、元の一時ファイル削除後に実行ログから復元したファズを含む（README 参照）。

| ディレクトリ | 対象 | 結論 |
|---|---|---|
| pr20-evidence-f17d761 | PR20 f17d761 | 未校正の隔離試作として限定受入 |
| pr20-66232ac | PR20 66232ac（キメ値 v1） | 受入 |
| pr21-aeabb0d | PR21 aeabb0d（縄） | 受入（C1〜C3） |
| pr22-8ec9803 | PR22 8ec9803（殻の段取り） | 受入（C1・C2） |
| pr25-197088f / pr25-c923781 | PR25（縄の段取り） | B1 修正後に受入 |
| pr27-28-A / pr27-b866ff6 | PR27（交代・片付け） | B1 修正（b866ff6）後に受入 |
| pr27-28-B | PR28（縄の ID・観察） | 受入 |
| merge-trial-c29829f | main + b866ff6 + e864d2e の試し合わせ込み | 衝突なし・バンドル同一 |
| pr29-7dd61a4 | PR29 統合 PR | マージ可（バンドル同一、fast 52/52） |
| pr30-f9a95ca | PR30 灯芯 | 受入（C1・C2） |
| pr23-67fff99 | PR23 帆と帆走 | 隔離試作として受入（帆の接続前に C1・C2） |
| pr31-1b562ab | PR31 殻を浸ける | 受入（C1） |
| pr34-2b9baef | PR34 殻の住民接続（本体） | 受入（C1・C2・C3） |

各レビューの詳細は対応する PR のコメントにあります。
