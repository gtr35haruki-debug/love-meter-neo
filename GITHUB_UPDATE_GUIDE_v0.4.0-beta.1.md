# LOVE METER NEO v0.4.0-beta.2 更新手順

## 1. ファイルを更新
このZIPの内容を既存プロジェクトへ反映する。特に次を必ず更新する。
- index.html
- styles.css
- src/
- functions/
- firebase.json
- database.rules.json

## 2. OpenAI API keyをFirebase Secretへ設定
ブラウザ側へAPIキーを書かない。

```bash
firebase functions:secrets:set OPENAI_API_KEY
```

## 3. Functionsをデプロイ

```bash
firebase deploy --only functions
```

## 4. Hostingをデプロイ

```bash
firebase deploy --only hosting
```

## 5. 3台すべて再読み込み
各PCで Ctrl+Shift+R。画面上部 `APP 0.4.0-beta.2` を確認。

## 6. 動作確認
- A/B両方のHW9 READY
- A/B両方のMicrophone READY
- EVENT_V2 3問を実施
- Q1/Q2/Q3のQuestion Responseが有効
- VOICE SCOREが表示
- AI設定済みならAI TALK BONUSとAIコメントが表示
- AIが失敗しても結果画面自体は表示される

## 注意
この版はβ版。旧本番版を上書きする前に別ブランチまたは別Hosting環境で検証することを推奨。
