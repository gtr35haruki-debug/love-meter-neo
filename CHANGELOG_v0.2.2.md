# LOVE METER NEO v0.2.2 — Pilot Review

2026-08-20 / 08-24 の実機パイロット6セッションを受けて、スコア・1Hz前処理・Records UI・DISPLAY操作を見直した版。

## 1. NEO SCORE V2_PILOT

旧V1は Direction 50% + Temporal 50% で、パイロットでは17〜26点付近に集中した。これは「反応が弱い」ことより、研究用の生指標をそのまま0〜100表示へ使っていたことが主因。

V2_PILOTでは、科学用の生指標はそのまま保存した上で、体験表示のみパイロット分布に合わせて尺度変換する。

- 方向一致 (Direction): 30%
- 時間同期 (Temporal): 20%
- 反応の大きさ (Magnitude): 20%
- 質問反応量 (Q Response): 30%
- 反応バランス (Balance): 総合点には入れず5軸表示のみ

解釈上は、
- 心拍シンクロ (SYNC) = Direction 60% + Temporal 40%
- 心拍リアクション (REACTION) = Magnitude 40% + Q Response 60%
- NEO SCORE = SYNC 50% + REACTION 50%

と同じ構造。

表示尺度は、今回のGOODセッションの質問別データ45点を基準に、各指標のP10→30、中央値→60、P90→90へ写像する暫定パイロット尺度 `DISPLAY_SCALE_PILOT_20260824_V1`。

## 2. 1Hz化の修正

旧版は `floor(sessionElapsedMs / 1000)` の1秒バケットを使っていたため、HW9通知の数十〜数百msの揺れが秒境界を跨ぐと、実際にはデータが届いているのに「同じ秒に2件＋次の秒が欠測」と誤認することがあった。

v0.2.2では共有セッション時刻の0,1,2...秒へ、±650ms以内の最も近いRAWサンプルを1回だけ割り当てる。RAWは変更しない。

## 3. データ品質

- Coverageは新しい1Hz系列で計算
- 5秒以上の連続欠測がある場合は、Coverageが90%以上でもCAUTION
- Recordsに最大連続欠測秒数を表示
- `sequence` は欠測判定に使わない

## 4. DISPLAY

- DISPLAY上部に「ホームへ戻る」追加
- 測定中 / 順応中 / 一時停止 / 解析中は誤操作防止のため無効
- 結果画面にもホームボタン追加
- 結果に「心拍シンクロ」「心拍リアクション」の2つの内訳を追加
- 反応コメントの閾値を旧70%/r=.6固定からV2表示尺度ベースへ変更

## 5. Records 日本語化

英語の識別名は消さず、日本語を先に表示する。

例:
- 概要 (Overview)
- 心拍数 (Heart Rate)
- 指標 (Metrics)
- 品質・ログ (Quality & Logs)
- 方向一致 (Direction)
- 時間同期 (Temporal r)
- 良好 (GOOD)
- セッション作成 (SESSION_CREATED)

アンケートキー、Quality、Status、Role、Phase、イベントログも日本語説明＋英語/内部名を併記。

## 注意

`DISPLAY_SCORE_V2_PILOT` は今回の少数パイロットから作った体験表示尺度であり、普遍的な科学尺度ではない。研究解析ではDirection / Magnitude / Temporal / Balance / Q Responseの生値、自己申告、品質を別々に扱う。
