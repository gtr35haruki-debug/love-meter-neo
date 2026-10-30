# LOVE METER NEO v0.2.1 仕様再監査

基準: `LOVE_METER_NEO_開発仕様書_v1.0_2026-08-08.docx`、`LOVE_METER_NEO_自己申告アンケート_v1.0_2026-08-08.docx`、時間・前処理・5指標の根拠整理、およびその後に確定した GitHub Pages + Firebase 運用。

## 判定
- ✅ = v0.2.1 で実装済み
- 🧪 = 実装済みだが実PC/HW9で検証が必要
- 🔐 = 開発版として動作するが、本番研究前にセキュリティ強化が必要
- ⏳ = 後続版で仕上げる

| 領域 | 状態 | v0.2.1 |
|---|---|---|
| URLだけで起動 | ✅ | GitHub Pages / HTTPS |
| 3PC role | ✅ | DISPLAY / SENSOR A / SENSOR B / RECORDS |
| 6桁 join code | ✅ | 完了/中断後は無効化 |
| Controller | ✅ | SENSOR A/Bの一方のみ。transfer + audit |
| PC1参加者画面 | ✅ | 測定中は操作ボタン・Firebase状態・研究値を非表示 |
| PC1説明 | ✅ | 3画面の確定文。Controllerから送る |
| PC2/3参加者表示 | ✅ | アンケート時のみ PRIVACY MODE |
| RESEARCH_V1 | ✅ | 5分順応 + 3set/9問 + 30/40/30... |
| EVENT_V1 | ✅ | 1set/3問、120秒、詳細研究surveyなし |
| 質問バンク | ✅ | QUESTION_BANK_V1 全カテゴリ |
| 測定前survey | ✅ | 正式文 R1-R8 / S1-S2 / O1 / condition / consent |
| 関係カテゴリ | ✅ | 正式選択肢 + その他自由入力 + 回答しない |
| 測定後survey | ✅ | 正式文 P1-P4 + 正式自由記述案内 |
| survey操作安定 | ✅ | survey中のfull renderを禁止。checkbox/radio checked状態を視覚化 |
| survey保存後privacy | ✅ | 内容を再表示せず端末返却画面 |
| HW9 Web Bluetooth | 🧪 | 接続コードあり。3通知/7秒でREADY判定。実機連続試験が必要 |
| DEMO HR | ✅ | 開発試験用 |
| Firebase Anonymous Auth | ✅ | 自動ログイン |
| server time offset | ✅ | normalized timeに使用 |
| T0予約開始 | 🧪 | +3秒で予約。3PCの実測表示差<500msは要検証 |
| IndexedDB outbox | 🧪 | local-first送信・再送あり。Wi-Fi断の実PC試験が必要 |
| RAW保存 | ✅ | overwriteせずsample_id付き |
| 3秒moving median | ✅ | 欠測gapをまたがない |
| Direction | ✅ | ±2 bpm / Δ3s / active条件 |
| Magnitude | ✅ | BASE差、負値保存 |
| Temporal | ✅ | -4..+4 sec / r_max / best_lag |
| Balance | ✅ | epsilon 0.5未満NA |
| Question Response | ✅ | local 15s + EARLY/INTERACTION/POST |
| NEO SCORE v1 | ✅ | Direction 50% + Temporal 50%、体験用のみ |
| 5軸radar | ✅ | 息ぴったり/ドキドキ/同時リアクション/バランス/質問ヒット |
| invalid時score抑制 | ✅ | MEASUREMENT INCOMPLETE |
| Records PIN 0711 | 🔐 | v0.2.1はsalted SHA-256 client gate。平文PINなし。30分lock |
| Records global nav | ✅ | Records / Participants / Pairs / Analysis / Export |
| Session detail | ✅ | Overview / Heart Rate / Metrics / Questionnaire / Quality & Logs / Raw Data |
| Records HR graph | ✅ | session_elapsed_ms、gapを接続しない |
| Audit log | ✅ | create/join/survey/start/pause/resume/abort/transfer/result等 |
| CSV基本出力 | ✅ | UTF-8 BOM session summary / RAW |
| ZIP一括export | ⏳ | 後続版 |
| 本番Security Rules | 🔐 | 候補ファイル同梱。Cloud Function管理権限とセットで後日有効化 |
| Cloud Function PIN | ⏳ | scaffold同梱。本番前にdeploy |
| shuffled/surrogate | ⏳ | 研究解析フェーズで実装 |
| Reference HR-WCC | ⏳ | 研究解析フェーズで実装 |
| Pilot P10/P90 display scale | ⏳ | 実データ取得後に固定 |
| 3PC/HW9ストレス試験 | 🧪 | ユーザー環境で次に実施 |

## v0.2.0 の今回の主原因
v0.2.0 は 250ms ごとに画面全体を再描画していたため、DOM上のボタン・checkbox・rangeなどが操作中に作り直されていました。v0.2.1 は、通常tickでは countdown / progress / BPM だけを書き換え、full renderはstate/phase変化時に限定しています。survey中はFirebase/センサー更新でもfull renderしません。

## 本番研究前に必ず残す作業
1. 実PC3台 + HW9×2 でRESEARCH_V1通し試験。
2. phase開始差、F5、Wi-Fi断、BLE断、PC交換を計測・記録。
3. Cloud Function PIN認証とProduction Database Rulesへ移行。
4. 予備実験でPROVISIONAL閾値・表示scaleを検証。
5. Reference HR-WCC / shuffled-surrogate / ZIP exportを研究解析版に追加。
