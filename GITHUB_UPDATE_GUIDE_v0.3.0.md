# GitHub Pages 更新ガイド — v0.3.0

最も安全なのは、このZIPの中身をリポジトリのルート構成どおりに反映することです。

## 必須更新ファイル

- `styles.css`
- `src/app.js`
- `src/config.js`
- `src/firebase-backend.js`
- `src/metrics.js`
- `src/protocols.js`
- `src/question-bank.js`
- `src/radar.js`
- `src/survey-schema.js`
- `tests/metrics.test.mjs`
- `tests/survey-schema.test.mjs`
- `tests/event-v2.test.mjs`
- `README.md`
- `CHANGELOG_v0.3.0.md`

既存の `index.html` や Firebase 設定ファイルもZIP内に含まれています。フル置換する場合はフォルダ構成を崩さないでください。

## 反映後の確認

1. GitHub Pagesを開く。
2. 画面上部の APP が `0.3.0` になっていることを確認。
3. SENSOR A/Bのどちらかで「イベントモード (EVENT_V2)」を選ぶ。
4. 5カテゴリが表示されることを確認。
5. 「こどもサポート」をONにして、アンケート対象側を選べることを確認。
6. 3台を接続し、DEMO HRで1回通しテストする。
7. 質問中に「この質問をスキップ」を押し、次の質問まで時計が進み続けることを確認。
8. こどもサポートでは測定後に4問の顔アンケートが出ることを確認。
9. 結果・Recordsにスキップ情報が保存されていることを確認。

古いService Workerやブラウザキャッシュが残っている場合は、Ctrl+Shift+Rで強制再読み込みしてください。
