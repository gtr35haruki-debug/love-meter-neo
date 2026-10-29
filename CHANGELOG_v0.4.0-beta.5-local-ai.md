# CHANGELOG v0.4.0-beta.5-local-ai

- OpenAI API / Cloud Functions依存を撤去
- Transformers.jsによるブラウザ内ローカルAIを追加
- A/B各SENSORでWhisper音声認識
- ControllerでQwen会話分析・AI TALK BONUS・一言コメント生成
- 生音声を外部AIサービスへ送信しない構成へ変更
- SENSOR A/B両方のLocal ASR READYを開始条件に追加
- WebGPU優先、WASM/CPUフォールバック
- ローカルAIの状態・モデル・実行デバイスを監査ログへ記録
- 同意文をローカルAI処理に合わせて更新
- Firebase Functionsをfirebase.jsonおよび配布物から削除
- 既存のHeart V3、Voice Baseline、5-state speaker timeline、Records、karaoke resultを維持
