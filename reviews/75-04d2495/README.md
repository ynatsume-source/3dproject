# PR #75 04d2495 縄の荷重チェックポイント整理（Codex）

- tsc / build / fast 81/81
- fuzz75.log：/4 と /5 の差分ファズ（40 seed × 1500 手、違い0）
- old75.log：整理されたあとの古い再送（missing-material で拒否、台帳不変）
- soak-migrate.out：#70–72 の /4 保存を12時間閉じたあと開いて12時間（エラー0、coirCordLoads 63 KB で頭打ち）
