# LOCAL AI 初回セットアップ

## 料金
この版のAI機能に OpenAI API は使用しません。APIキー・API課金・Firebase Cloud Functionsは不要です。

## 事前準備
1. イベントで使う2台のSENSOR PCを用意
2. 最新ChromeまたはEdgeへ更新
3. 十分な空き容量を確保
4. 安定したWi-Fi環境で初回セットアップを行う

## 各SENSOR PC
1. LOVE METERを開く
2. SENSOR A / SENSOR Bを選択
3. 同じ6桁コードに参加
4. 「ローカルAIを準備」を押す
5. モデル取得完了までページを閉じない
6. `Local ASR · SENSOR A/B` が両方READYになることを確認

操作端末ではさらに `Local TALK AI` がREADYになるまで待ちます。

## 初回モデル
- ASR: onnx-community/whisper-tiny
- TALK/COMMENT: onnx-community/Qwen2.5-0.5B-Instruct

WebGPUを優先し、利用できない場合はWASM/CPUへフォールバックします。

## イベント当日
- ブラウザキャッシュを削除しない
- シークレット/ゲストモードは使わない
- 事前にLOVE METERを開いてLocal AI READYを確認
- AI準備が失敗したPCは再読み込み後に再度「ローカルAIを準備」

## プライバシー
音声認識・会話分析・コメント生成は端末内AIで行います。生音声は研究DBへ保存しません。文字起こしと分析結果はRecordsへ保存されるため、個人情報を含む可能性があります。

## Records PINについて
この無料β版ではCloud Functionsを使わないため、RecordsのPINはブラウザ側のsalted SHA-256ハッシュ照合です。学校内・実験中の誤操作防止用の簡易ロックであり、インターネット公開サービス向けの強固な認可ではありません。機微な研究データを広く公開する運用では、別途サーバー側認可を導入してください。
