# TEST REPORT v0.3.2

実施日: 2026-08-29

## 自動チェック

- `src/app.js` JavaScript構文: PASS
- `src/question-bank.js` JavaScript構文: PASS
- `src/radar.js` JavaScript構文: PASS
- EVENT_V2 6カテゴリ × 9問 = 54問: PASS
- 恋人カテゴリ: PASS
- EVENT_V2 120秒タイムライン: PASS
- 質問スキップ時の指標除外: PASS
- 1Hz補正回帰テスト: PASS
- RESEARCHアンケートスキーマ: PASS
- CHILD_SUPPORT_V1 選択UI・表示切替・読み上げ補助: PASS（静的回帰テスト）
- EVENT/CHILDのアンケートコードが存在しないこと: PASS
- EVENT終了後がアンケートではなく自動解析へ進むこと: PASS（静的回帰テスト）

## 実機で残る確認

- GitHub Pagesでの画面表示
- 3台同期
- COOSPO HW9 ×2の接続
- こどもサポートON時のPC1表示
- 質問スキップの3台同期
- イベント終了後にアンケートを挟まず結果画面へ進むこと
