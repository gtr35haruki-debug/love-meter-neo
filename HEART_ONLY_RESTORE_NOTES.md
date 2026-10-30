# LOVE METER NEO v0.3.5 HEART ONLY

音声・ローカルAI追加前の心拍中心UIへ戻した版。

## 残した改良
- EVENT_V2 の Question Response で Q1/Q2/Q3 を計算できる baseline coverage 修正
- 5指標を使う DISPLAY_SCORE_V3_PILOT（暫定）
  - Direction 15%
  - Temporal 10%
  - Magnitude 10%
  - Question Response 25%
  - Balance 40%
- 旧V2スコアは内部比較用に保持

## 外したもの
- マイク取得・音声保存
- VOICE SCORE
- AI TALK BONUS
- AI文字起こし
- AIコメント
- ローカルAIモデル
- 音声ベースライン・話者判定

V3は既存データから作った探索的な体験用重みであり、科学的に確定した関係性尺度ではありません。
