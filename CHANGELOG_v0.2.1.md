# v0.2.1 修正一覧

## 報告された不具合
- アンケートのチェックボックスが保持されない → 修正
- ボタンhover時に点滅・クリックしにくい → 修正
- Word版アンケートと質問文が異なる → 正式文へ置換
- デザイン仕様の反映不足 → 全画面デザイン再構成
- Records PIN 0711 が開かない → 開発用ハッシュ認証を実装

## 仕様再確認で追加修正したもの
- PC1から説明操作ボタンを撤去
- PC1説明をControllerから送る方式へ変更
- アンケート回答後に回答内容を再表示しない確認画面を追加
- O1「回答しない」でスライダーを無効化
- 「特になし」と他の測定条件が同時選択されないよう修正
- SENSOR READYはBluetooth接続だけでなく、心拍値を3回実受信してから成立
- 計測開始できない理由を明示
- Controller transferを追加
- DISPLAYのpublic dataから研究用metricsを除外
- PC1結果画面から研究用Direction/Temporal生値を削除
- PC1結果にA/B mini heart reaction timelineを追加
- Measurement IDを日付ごとの連番へ変更
- Participant IDを連番発行へ変更
- Pairの直前set orderを避けるleast-used割当へ改善
- 完了/中断後に6桁join codeを無効化
- Recordsの基本検索・Session Detail・RAW graph・CSVを追加
- Heart Rate graphはsession_elapsed_msを使用し、gapを接続しない
- 操作Audit Logを追加
- 3秒moving medianが欠測区間をまたいで平滑化しないよう修正
- Question ResponseにEARLY / INTERACTION / POST補助値を追加
- 関係カテゴリをWord版に近いradio選択へ変更し、「その他」自由入力を追加
- checkbox/radioの選択状態をカード全体で明確に表示
- 測定後の自由記述案内をWord版の正式文へ統一
- PC1のセッション接続後はAPP/Firebase/端末設定など技術UIを非表示
- Records PINはEnterキーでも送信可能
- SYSTEM CHECKに画面解像度とserver clock offset表示を追加
