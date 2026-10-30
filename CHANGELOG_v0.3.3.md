# LOVE METER NEO v0.3.3

## Cache reload fix
- APP_VERSION を 0.3.3 に更新。
- GitHub Pages / browser cache で旧 0.3.1 の JavaScript が残る問題を防ぐため、index.html の CSS / entry module と、src 内のローカル ES module import に `?v=0.3.3` を付与。
- v0.3.2 のイベント仕様（恋人カテゴリ、こどもサポート維持、イベント系アンケートなし、質問スキップ）自体は変更していない。
