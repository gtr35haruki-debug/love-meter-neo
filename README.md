# LOVE METER NEO v0.4.0-beta.1

2026-10-29 の改良案を一度実装したβ版です。

## この版で入れたもの

### 1. 心拍計算の修正・V3暫定式
- EVENT_V2 の Question Response で Q2/Q3 が無効になっていた問題を修正済み。
- 旧 DISPLAY_SCORE_V2_PILOT は比較用 `legacyNeoScore` として保存。
- β表示用 Heart V3 は以下の探索的重みを採用。
  - Direction 15%
  - Temporal 10%
  - Magnitude 10%
  - Question Response 25%
  - Balance 40%
- Balance が NA の場合は、利用可能な指標の重みを正規化してβスコアを計算する。
- これは既存の少数研究データから作った暫定式で、科学的に確定した式ではない。

### 2. PC内蔵マイク
- SENSOR A / B それぞれで「PCマイクを準備」を押してマイクを接続。
- 質問中だけ音声解析を行う。
- LOVE METER のDBには生音声ファイルを保存しない。
- 保存するのは音声特徴量と、AIを使う場合は文字起こし・AI分析結果。

### 3. VOICE ANALYSIS β
質問中の音声から次を計算する。
- PITCH DYNAMICS β: 質問内のF0変動の大きさ。現段階では個人基準音声との差ではない。
- EXPRESSIVENESS: F0変動幅と音量変動の組合せ。
- SPEECH BALANCE: A/Bの発話量バランス。
- TURN TAKING: A/Bの発話交代の多さをβ評価。

VOICE SCORE β は利用可能な上記指標の平均。

注意：同じ部屋のPC内蔵マイクは相手の声も拾うため、Speech Balance / Turn Taking はクロストークの影響を受ける。ダイフェスタβ版では体験・検証用として扱い、正式研究ではマイク配置・話者分離の検証が必要。

### 4. AI TALK BONUS
- SENSOR A 側の質問音声を Firebase Cloud Function 経由で OpenAI API に送る。
- `gpt-transcribe` で文字起こし。
- 文字起こしをAIで、質問への取り組み・自己開示・感情表現・会話の内容的な豊かさという観察可能な特徴に分けて分析。
- AIには親密さ、恋愛感情、相性を判定させない。
- 各質問 0〜2点、セッション全体で最大 +5点のBONUS。
- 話者分離を行っていないため、AI TALK BONUSでは「どちらが話したか」を推測させない。

### 5. AI RESULT COMMENT
Heart / Voice / AI TALK BONUS / 特徴をAIに渡し、結果画面用の短い一言コメントを生成する。
コメントは採点には一切影響しない。
AIが利用できない場合は、従来の心拍コメントへ自動フォールバックする。

### 6. カラオケ採点風の結果画面
- 大きな総合点
- RANK表示
- HEART / VOICE / AI TALK BONUS の3本ゲージ
- AI一言コメント
- VOICE 4指標
- HEART 5指標レーダー
- 最も反応が大きかった質問
- ネオン、光、キラキラ、採点画面風演出

## β版の表示スコア

Heart V3 と Voice β が両方取得できた場合：

`BASE = Heart × 0.70 + Voice × 0.30`

`EXPERIENCE SCORE β = BASE + AI TALK BONUS（最大+5、上限100）`

Voice が取得できなかった場合は Heart V3 をベースにする。

この重みは研究で確定したものではなく、ダイフェスタ向け体験β版の暫定値。今後の心拍＋音声＋アンケート実験で見直す。

## AIを動かすための設定

Firebase Functions を使う。APIキーをブラウザ側の `src/config.js` に入れてはいけない。

1. Firebase CLIでプロジェクトにログイン。
2. Functions の secret `OPENAI_API_KEY` を設定。
3. Functionsをデプロイ。
4. Hostingもデプロイ。

例：

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase deploy --only functions
firebase deploy --only hosting
```

必要ならFunctionsの環境変数 `AI_ANALYSIS_MODEL` で会話分析モデルを変更できる。未指定時は `gpt-6-astra`。

## 初回テスト手順

1. 3台のPCで同じ最新版を開く。
2. SENSOR A / SENSOR B で HW9 を接続する。
3. SENSOR A / SENSOR B それぞれで「PCマイクを準備」を押す。
4. 2台とも Heart と Microphone が READY になったことを確認。
5. EVENT_V2 でテストセッションを1回実施。
6. 結果画面で HEART / VOICE / AI TALK BONUS / AI COMMENT を確認。
7. RECORDS とExport ZIPで、旧V2・Heart V3・Voice特徴・AI分析が保存されていることを確認。

## 研究上の注意

- Heart V3、VOICE SCORE、最終EXPERIENCE SCOREはすべてβ版。
- 「高得点＝仲が良い」「恋愛感情が強い」とは扱わない。
- AI TALK BONUSは会話内容の補助的な演出・探索指標。
- AIコメントは演出専用。
- 音声を外部AIサービスへ送ることを参加者に事前説明する。
- 研究モードの同意文は音声・AI分析を含む内容へ更新済み。
- イベント表示にも音声AI利用の案内を追加済み。
