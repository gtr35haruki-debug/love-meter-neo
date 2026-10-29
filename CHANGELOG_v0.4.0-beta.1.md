# LOVE METER NEO v0.4.0-beta.2

## 2026-10-29

- EVENT_V2 Question Response のQ2/Q3ローカル基準問題を修正。
- Heart V3 暫定重みを追加。旧V2スコアは比較用に保持。
- PC内蔵マイクによる質問中音声取得を追加。
- PITCH DYNAMICS / EXPRESSIVENESS / SPEECH BALANCE / TURN TAKING のVOICE β指標を追加。
- SENSOR A の質問音声をCloud Functionへ送り、`gpt-transcribe`で文字起こしするAI TALK BONUS機能を追加。
- AI TALK BONUSは最大+5点。親密さ・恋愛感情・相性の直接判定は禁止するプロンプト設計。
- Heart/Voice/AI結果からAI一言コメントを生成。コメントは採点に不使用。
- 結果画面をカラオケ採点風に刷新。
- 音声・AIに関する研究同意文とイベント説明を追加。
- Export ZIPにvoice_featuresとai_talk_analysisを追加。生音声は保存しない。
- VOICEの自動テストを追加。
