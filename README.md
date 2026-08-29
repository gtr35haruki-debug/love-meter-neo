# LOVE METER NEO v0.3.2 — Event + Child Support Refined Build

## v0.3.2 のイベント向け変更（2026-08-29）

- EVENT_V2 は **恋人 / 友達 / 親子 / 兄弟・姉妹 / 夫婦 / 初対面** の6カテゴリ、合計54問です。
- `CHILD_SUPPORT_V1` を復活しました。質問内容と120秒の計測時間は通常EVENT_V2と同じで、表示・案内・スタッフ読み上げ補助だけを子ども向けにします。
- **イベントモード／こどもサポートではアンケートを実施しません。** 測定終了後は自動解析して結果へ進みます。
- EVENT_V2では、測定中の質問を操作端末から **「この質問をスキップ」** できます。
- スキップした質問はRAWを削除せず、`QUESTION_SKIPPED` として記録し、その質問だけ指標集計から除外します。残り時間は待機して共通タイムラインを維持します。
- RESEARCH_V1の質問・アンケート・5指標・NEO SCORE計算、EVENTの120秒計測時間は変更していません。

詳細は `CHANGELOG_v0.3.2.md` を参照してください。

## v0.2.2 の追加変更（2026-08-24 パイロット反映）

- NEO SCOREを `DISPLAY_SCORE_V2_PILOT` へ変更
- 心拍シンクロ50%＋心拍リアクション50%の構造へ
- 1Hz化を「秒切り捨て」から共有時刻への最近傍割当へ修正
- 連続欠測をQualityへ反映
- DISPLAYにホームへ戻る導線を追加
- Recordsを日本語中心＋英語併記へ変更
- 結果画面にSYNC / REACTION内訳を追加

詳細は `CHANGELOG_v0.2.2.md` と `PILOT_REVIEW_2026-08-24.md` を参照してください。

---

2026-08-08 の統合開発仕様書と自己申告アンケート v1.0 を再照合して、v0.2.0 の操作バグ・アンケート・デザイン・Records を修正した安定化版です。

## 今回の最重要修正

### 1. ボタン・チェックボックスが押しにくい問題
v0.2.0 は計測画面を 250ms ごとに画面全体再描画していたため、カーソルを合わせたボタンやアンケートのチェックボックスが再生成され、点滅・クリック失敗・チェック解除が起きる可能性がありました。

v0.2.1 では、
- 画面全体を 250ms ごとに再描画しない
- タイマー・BPM・プログレスだけを部分更新
- フェーズが変わったときだけ画面を再構築
- アンケート中は Firebase 更新・センサー更新による再描画を禁止

に変更しました。

### 2. アンケートを Word 版と同じ正式質問文へ
`LOVE_METER_NEO_自己申告アンケート_v1.0_2026-08-08.docx` の文面に合わせ、R1-R8 / S1-S2 / O1 / P1-P4 を正式な質問文で実装しました。

測定前には、
- 研究参加の確認
- 現在の関係性
- R1-R8
- S1-S2
- O1（任意・回答しない可）
- 測定条件チェック

を表示します。

測定後には P1-P4 と自由記述を表示します。

回答確定後は運用画面へ即時復帰せず、参加者には「回答を保存しました。PCを実験担当者へ返してください。」だけを表示します。

### 3. デザインを仕様書へ再整合
世界観を「近未来の二者生体反応解析装置 / HEART × SCIENCE × INTERACTION」に統一しました。
- near-black / deep navy
- blue-violet + soft magenta/pink + cyan
- 2本の生体信号・同期円・波形を中心に使用
- ハートアイコンを乱用しない
- PC1 は没入感と最小情報
- PC2/3 は研究機器らしい運用ダッシュボード
- Records は研究ダッシュボード

PC1 の参加説明は3ページ構成のままですが、PC1には操作ボタンを置かず、Controller側からページを送ります。

### 4. Records PIN 0711 を開発版でも利用可能に
Cloud Function をまだデプロイしていないため v0.2.0 では 0711 を入力しても開けませんでした。

v0.2.1 は Spark プランで動作確認を続けられるよう、開発段階だけブラウザ側の salted SHA-256 hash 照合で PIN を確認します。0711 の平文は JavaScript に保存していません。

- 30分無操作でロック
- 手動ロックあり
- Records / Participants / Pairs / Analysis / Export の基本画面
- Session Detail: Overview / Heart Rate / Metrics / Questionnaire / Quality & Logs / Raw Data
- `session_summary.csv` / metadata JSON / RAW CSV の基本出力

**注意:** これは開発用ゲートです。本番研究データを扱う前に Cloud Function + Production Database Rules に切り替えます。

## 3-PC の基本運用

1. 3台とも同じ GitHub Pages URL を Chrome / Edge で開く
2. PC1 → DISPLAY
3. PC2 → SENSOR A
4. PC3 → SENSOR B
5. SENSOR A または B で新しいセッションを作る
6. 発行された6桁コードを残り2台へ入力
7. SENSOR A/B で HW9 を接続
8. 数秒間の実心拍受信後に SENSOR READY
9. RESEARCH_V1 では A/B が個別に事前アンケート
10. 5分順応 → 3秒後に同期開始 → 3セット9問
11. 測定後アンケート
12. PC1 で NEO SCORE / 5軸レーダー / コメント / most reactive question / mini timeline

## Firebase

- Project: `love-meter-neo-58978`
- Realtime Database: `asia-southeast1`
- Anonymous Authentication: ON
- GitHub Pages: HTTPS

現在 Firebase Console で設定している開発用ルールは、匿名認証済みユーザーに読み書きを許可するものです。**実参加者の本番データ取得前に Production Rules へ変更してください。**

ファイル:
- `database.rules.dev.json` — 現在の接続試験用
- `database.rules.production.json` — Cloud Function 管理権限を前提にした本番候補
- `functions/` — Records PIN の本番用 Cloud Function

## 科学値と体験値

研究では Direction / Magnitude / Temporal / Balance / Question Response を別々に保存します。

体験用 NEO SCORE v2 pilot は、今回のパイロット分布で0〜100表示を校正した4成分を使います。

`Direction 30% + Temporal 20% + Magnitude 20% + Question Response 30%`

見方としては、`心拍シンクロ 50% + 心拍リアクション 50%` と同じ構造です。Balanceは5軸表示に残しますが総合点には入れません。科学的解析では表示用に尺度変換する前の生指標を使います。

## テスト

```bash
node tests/metrics.test.mjs
node tests/survey-schema.test.mjs
```

## 現在まだ「完成版ではない」部分

v0.2.2 はパイロット反映版です。次段階では主に以下を詰めます。

- HW9×2＋実PC3台での長時間ストレステスト
- 3PCの実測 phase 表示差 <500ms の検証
- F5 / PC交換 / Wi-Fi断 / BLE断の実機復旧テスト
- Cloud Function を使った Records 本番認証
- Production Database Rules への移行
- Reference HR-WCC / surrogate・shuffled pair の研究解析フロー
- ZIP一括エクスポートとより高度な Analysis
- Pilotデータ後の DISPLAY_SCALE_RESEARCH_V1 / EVENT_V2 固定


## 仕様再監査
同梱の `SPEC_AUDIT_v0.2.1.md` に、開発仕様書の主要項目を「実装済み / 実機検証が必要 / 本番前セキュリティ強化 / 後続実装」に分けて再監査した表を入れています。
