# GitHub更新手順（v0.2.1 → v0.2.2）

GitHubに詳しくなくても、ブラウザだけで更新できます。

1. このZIPをWindowsで「すべて展開」する。
2. GitHubの `gtr35haruki-debug/love-meter-neo` を開く。
3. `Add file`（＋）→ `Upload files` を開く。
4. 展開した `love-meter-neo-v0.2.2` フォルダの**中身を全部**ドラッグする。
5. 同じ名前のファイルは更新対象として表示される。
6. `Commit directly to the main branch` を選ぶ。
7. Commit messageを `Update LOVE METER NEO to v0.2.2` にする。
8. `Commit changes` を押す。
9. GitHub Pages は main / root のままでよい。通常は数十秒〜数分で自動更新される。
10. NEO URLを開いて右上が `APP 0.2.2` になっていることを確認する。
11. 古い表示なら Ctrl+Shift+R で強制再読み込みする。

注意: `firebaseConfig` はWebクライアント用設定です。Service Account秘密鍵などはGitHubへ入れないでください。
