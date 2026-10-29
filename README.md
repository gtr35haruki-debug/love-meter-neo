# LOVE METER NEO v0.4.0-beta.5 LOCAL AI

ダイフェスタ向け統合β版。心拍・音声・会話の反応を組み合わせ、カラオケ採点風の結果画面で表示します。

## この版の大きな変更

AI処理を OpenAI API / Firebase Cloud Functions から切り離し、ブラウザ上のローカルAIへ変更しました。

- OpenAI APIキー：不要
- OpenAI API課金：不要
- Firebase Cloud Functions：不要
- Firebase Blazeプラン：AIのためには不要
- 生音声：外部AIサービスへ送信しない
- 初回のみ：AIモデルファイルのダウンロードにインターネット接続が必要
- 2回目以降：ブラウザキャッシュが残っていれば端末内で推論可能

Firebase Hosting / Realtime Database は、従来どおり3台PC同期・記録保存に利用します。

## 推奨ブラウザ

最新版 Google Chrome または Microsoft Edge。

WebGPU が利用できる場合はGPUを優先します。WebGPUが使えない端末ではWASM/CPUへフォールバックするため、文字起こし・コメント生成が遅くなる場合があります。

## ローカルAI構成

### SENSOR A / SENSOR B

各端末で音声認識モデルを準備します。

- ランタイム：Transformers.js
- 音声認識：`onnx-community/whisper-tiny`
- 言語：日本語
- 用途：各参加者の質問中音声を端末内で文字起こし

A/Bはマイク付き片耳イヤホンをそれぞれ自分のSENSOR PCへ接続します。A音声とB音声を別々に処理するため、AIによる話者分離を主手段にはしません。

### 操作端末（Controller）

操作端末では上記音声認識に加えて、会話分析・一言コメント用の小型言語モデルも準備します。

- モデル：`onnx-community/Qwen2.5-0.5B-Instruct`
- AI TALK BONUS：会話への関与、相互応答、自己開示、感情表現、会話の豊かさを補助評価
- 一言コメント：HEART / VOICE / BONUSの結果に沿った短いカラオケ採点風コメント

AIに「恋愛感情がある」「仲が良い」などを直接判定させません。

## 初回準備

イベント前に、実際に使用するSENSOR A/Bの両PCで必ず実施してください。

1. 最新版Chrome / EdgeでLOVE METERを開く
2. SENSOR A / SENSOR Bとして同じセッションに参加する
3. 各端末で「ローカルAIを準備」を押す
4. SENSOR A/Bの `Local ASR` が両方 `READY` になることを確認する
5. 操作端末では `Local TALK AI` も `READY` にする
6. 1回テスト計測し、文字起こし・AI TALK BONUS・一言コメントまで確認する

初回はモデルをダウンロードするため時間と通信量が必要です。イベント当日に初回ダウンロードを行わず、事前に全PCで準備してください。ブラウザのサイトデータ / キャッシュを削除すると再ダウンロードが必要になる場合があります。

## 音声計測

### 1. マイクを選択

SENSOR A/Bでそれぞれ使用するマイクを選択します。

記録する情報：
- ブラウザ上のマイク名
- 有線 / ワイヤレス / 不明
- サンプルレート
- 入力遅延情報（取得できる場合）
- 周囲ノイズ量
- 発話判定しきい値
- ノイズ抑制 / エコーキャンセル / 自動音量調整の状態

### 2. 基準声

A → Bの順で各10秒測定します。

基準用質問：
「今日ここに来るまで、何をしていましたか？」

相手は基準声測定中は話しません。

保存する主な基準：
- 基準F0
- F0のばらつき
- 基準RMS
- 基準発話率

質問中は絶対Hzではなく、本人の基準声との差を主に使用します。

例：
- 120 Hz → 132 Hz = +10%
- 190 Hz → 202 Hz = 約+6.3%

元々声が高い人ほど「高反応」となる計算にはしません。

### 3. 質問中

音声特徴を時系列で取得し、以下を保存します。
- Pitch / F0
- RMS
- 発話判定
- ΔHz
- Δ%
- cents
- UP / DOWN / SAME
- 基準からの音量変化 dB

話者状態は200ms単位で、
- A
- B
- BOTH
- UNKNOWN
- SILENCE

の5状態として保存します。判定不能な区間を無理にA/Bへ割り当てません。

## VOICE SCORE β

主な4指標：
- Pitch Response
- Expressiveness
- Speech Balance
- Turn Taking

心拍と音声はセッション開始からの経過時間を使い、同じ時間軸で比較できるよう記録します。

## HEART SCORE

Question ResponseのEVENT_V2 Q2/Q3計算不整合を修正済みです。

V3暫定式：
- Direction 15%
- Temporal 10%
- Magnitude 10%
- Question Response 25%
- Balance 40%

旧式も比較用に保持します。V3は既存データをもとにした暫定式であり、今後の新規実験で検証する前提です。

## AI TALK BONUS

AI TALKは主得点ではなく補助的なボーナスです。

見るもの：
- 質問への取り組み
- 相互応答
- 自己開示
- 感情表現
- 会話の豊かさ

セッション全体のBONUSは最大+5点。ローカルAIが失敗してもHEART / VOICEの本体計測は維持します。

## AI一言コメント

HEART / VOICE / AI TALK BONUSなどの結果をローカル言語モデルに渡し、短いコメントを生成します。

- 採点には影響しない
- 関係性や恋愛感情を断定しない
- 結果に矛盾しない範囲で毎回表現を少し変える
- ローカルモデル生成が失敗した場合は安全な定型コメントへフォールバック

## Records

音声・AIタブから以下を確認できます。

- 使用マイク / 接続方式
- 基準声
- VOICE SCORE β
- Pitch Response / Expressiveness / Speech Balance / Turn Taking
- A/B音声特徴
- 200ms時系列
- A / B / BOTH / UNKNOWN / SILENCE
- A/B文字起こし
- AI TALK分析
- BONUS

### 生音声について

生の録音ファイルは研究DBへ保存しません。質問中に一時的に作成し、その端末内の文字起こし処理が終わった後は永続保存しません。

ただし、文字起こし本文とAI分析結果には個人的な会話内容が含まれる可能性があります。研究保存・発表・外部共有時は同意・匿名化・アクセス管理を行ってください。

## Firebaseへのデプロイ

このLOCAL AI版にはCloud Functionsはありません。

Firebase CLIで対象プロジェクトを選択後、通常は：

```bash
firebase deploy --only hosting,database
```

現在のDBルールを変更したくない場合は：

```bash
firebase deploy --only hosting
```

OpenAI APIキー、Secret Manager、Functionsのデプロイは不要です。

## 本番前チェック

- SENSOR A/Bのブラウザが最新版Chrome/Edge
- 両端末でLocal ASR READY
- 操作端末でLocal TALK AI READY
- A/Bそれぞれ正しいマイクを選択
- 有線/ワイヤレスを正しく記録
- A/B基準声10秒が有効
- HW9 A/B READY
- 実際のイヤホンで1セッション完走
- Recordsに文字起こし・音声特徴・AI分析が保存される
- 結果画面でAI BONUS / コメントが表示される

## 注意

この版では自動テストで心拍計算、音声基準差、5状態話者分類、記録・エクスポート等を確認しています。ただし、ブラウザ上で実AIモデルをダウンロードしてWebGPU/マイクを使う実機テストは、実際に使用するPCで必ず行ってください。
