# PassPlay

スマホ1台を回しながら遊ぶ「パスプレイ式」多人数ゲーム集。

## 遊ぶ

[**プレイページを開く**](https://sesshi0921.github.io/PassPlay/) ← タップしてスタート

## ローカル開発

```sh
python3 -m http.server 8000
# → http://localhost:8000/
```

## ゲーム一覧の更新

`games/<game-id>/meta.json` を置けば、`build_games.js` で `games.json` を再生成できる。

```sh
node build_games.js
```

手動で `games.json` を直接編集してもOK。

## ドキュメント

各ゲームの遊び方は [docs/](./docs/README.md) を参照。
