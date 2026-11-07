# Power

筋肉を増やしながら体脂肪を落とすための記録アプリです。体重・体脂肪率・食事を記録し、グラフで推移を確認します。
自分の PC の中だけで動きます（インターネットには公開しません。費用はかかりません）。

- 要件定義書：[docs/requirements.md](docs/requirements.md)
- 基本設計書：[docs/basic-design.md](docs/basic-design.md)
- 詳細設計書：[docs/detailed-design.md](docs/detailed-design.md)

## 使い方

必要なもの：[Node.js](https://nodejs.org/) 22.13 以上（推奨 24）

1. `start.bat` をダブルクリックします。
   - 初回は必要なファイルを自動で準備します（数分かかることがあります）。
   - プログラムが更新されていれば（`git pull` 後など）、自動でビルドし直してから起動します。
2. ブラウザで `http://localhost:3000` が開きます。
3. 終了するときは、黒いウィンドウを閉じます。

## データとバックアップ

| 場所 | 内容 |
|---|---|
| `data/power.db` | 記録データ本体 |
| `data/backups/power-YYYYMMDD.db` | 自動バックアップ（起動時に 1 日 1 回作成、30 日分を保持） |

`data/` フォルダは Git の管理対象外です。PC を移行するときは `data/` フォルダごとコピーしてください。

### バックアップから戻す方法

1. アプリを終了します（黒いウィンドウを閉じる）。
2. `data/power.db`、`data/power.db-wal`、`data/power.db-shm` を別の場所に移動します（念のため削除せず残しておきます）。
3. 戻したい日の `data/backups/power-YYYYMMDD.db` を `data/power.db` という名前でコピーします。
4. `start.bat` で起動します。

## 開発

```sh
npm install
npm run dev        # 開発サーバー（画面 http://localhost:5173 、API :3000）
npm test           # 自動テスト（計算・API）
npm run test:e2e   # 画面の自動テスト（ビルド後、Microsoft Edge を自動操作。保存先は一時フォルダ）
npm run typecheck  # 型チェック
npm run build      # ビルド（dist/）
npm start          # ビルド済みを起動
```

## 実装状況

| フェーズ | 内容 | 状況 |
|---|---|---|
| 1 | 土台・体組成の記録・体重/体脂肪率/除脂肪体重グラフ・自動バックアップ | ✅ |
| 2 | 食事記録・1 日合計・カロリー/PFC グラフ | ✅ |
| 3 | マイ食品・倍率入力・食事コピー | 未着手 |
| 4 | プロフィール・目安計算・目標・ホーム画面 | 未着手 |
| 5 | エクスポート/インポート・週次サマリー・履歴 | 未着手 |
