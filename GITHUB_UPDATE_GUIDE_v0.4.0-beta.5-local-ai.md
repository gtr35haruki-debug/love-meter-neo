# GitHub / Firebase 更新ガイド v0.4.0-beta.5-local-ai

## 変更のポイント
この版ではAIがブラウザ内で動きます。OpenAI APIキーやFirebase Functionsの設定は不要です。

## GitHub
配布ZIPを展開して既存リポジトリへ上書きし、変更内容を確認してcommitしてください。

主な変更ファイル：
- src/ai.js
- src/app.js
- src/config.js
- src/backend.js
- src/firebase-backend.js
- src/local-backend.js
- src/survey-schema.js
- firebase.json
- README.md
- LOCAL_AI_SETUP.md

## Firebase Hostingのみ更新
```bash
firebase login
firebase use <LOVE METERのFirebase project id>
firebase deploy --only hosting
```

## database.rules.jsonも更新する場合
```bash
firebase deploy --only hosting,database
```

注意：本番用の厳格なルールを別途運用している場合、意図せず `database.rules.json` で上書きしないでください。

## 不要になった手順
- OpenAI APIキー作成
- `firebase functions:secrets:set OPENAI_API_KEY`
- `npm install` in functions
- `firebase deploy --only functions`
- AI用途のBlaze化

## 初回AIモデル準備
デプロイ後、実際に使うSENSOR A/B両端末で「ローカルAIを準備」を実行してください。
