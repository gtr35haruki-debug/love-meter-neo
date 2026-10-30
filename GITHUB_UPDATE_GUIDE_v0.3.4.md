# v0.3.4 更新手順（GitHub Pages）

**今の本番データは消さず、アプリのソースファイルだけを差し替えます。**

1. 同梱のZIPを展開してください。
2. GitHubの `love-meter-neo` リポジトリを開きます。
3. ルート（`index.html` がある位置）に `index.html`、`styles.css`、`README.md`、`CHANGELOG_v0.3.4.md` 等を配置・更新してください。
4. `src` フォルダ内の全ての `.js` を **GitHub側の既存 `src` フォルダの中** に配置してください。`src/src` にしないでください。新ファイル `src/research-export.js` も必要です。
5. コミット完了後、GitHub Pagesの反映を待ち、Ctrl+Shift+Rで再読み込み。`APP 0.3.4` と表示されることを確認してください。
6. Recordsを開き、一覧のチェックボックスが表示されるか確認します。
7. テスト用のセッション2件を選択 →「選択した実験をまとめて書き出す」→ ZIPを保存 → 展開して `all_sessions.json` / `session_list.csv` / 各 `heart_rate_raw_A.csv`・`heart_rate_raw_B.csv` を確認します。

## 読み出し前の大事なこと

- RAWは各計測PCがFirebaseに同期した分と、書き出し実行PCのローカル保存分から取得します。各計測PCのネット接続・送信完了を確認してください。
- アンケートを他人に送るときは参加者の許諾を確認してください。アンケートの個別回答は初期状態ではZIPに入れません。
- 今回の更新にFirebase設定の変更や、既存データの削除は必要ありません。
