# バックアップ（Google Drive）

GitHub Actions（`.github/workflows/backup.yml`）が毎日 3:15（日本時間）に動き、その日に更新があれば、リポジトリの全履歴を1ファイルにまとめた git bundle を Google Drive の `Utsushiyo-backup` フォルダに置く。

- ファイル名：`utsushiyo-YYYY-MM-DD.bundle`（1つ15MBほど）
- 保持：日次は60日分。毎月1日の分はずっと残す
- 更新のない日は何もしない。Actions の画面から「Run workflow」で手動でも実行できる

## 最初に一度だけ：Drive への接続許可

1. PC に rclone を入れる
   - Mac：`brew install rclone`
   - Windows：`winget install Rclone.Rclone`
2. ターミナル（Windows は PowerShell）で次を実行する
   ```
   rclone authorize "drive"
   ```
   ブラウザが開くので、バックアップ先の Google アカウントを選んで「許可」する。
3. ターミナルに `{"access_token":"…","token_type":"Bearer","refresh_token":"…","expiry":"…"}` のような1行が出る。`{` から `}` までをまるごとコピーする。
4. GitHub のリポジトリ → Settings → Secrets and variables → Actions → New repository secret
   - Name：`RCLONE_DRIVE_TOKEN`
   - Secret：3でコピーした1行
5. Actions タブ → 「Backup to Google Drive」→ Run workflow。数十秒後、Drive に `Utsushiyo-backup` フォルダとファイルができていれば完了。

注意：この許可は rclone 経由で Drive 全体へのアクセスを与える。中身は GitHub のシークレットとして暗号化して保管され、ログには出ない。不要になったら Google アカウントの「サードパーティのアクセス」から rclone を外せば無効になる。

## 戻すとき

```
git clone utsushiyo-2026-10-01.bundle 3dproject
```

これで、その日までの全履歴と全ファイルがそろったリポジトリになる。GitHub に置き直すなら、新しいリポジトリを作って `git push --all` する。
