# PassPlay

スマホ1台を回しながら遊ぶ「パスプレイ式」多人数ゲーム集。

## 遊ぶ

[**プレイページを開く**](https://sesshi0921.github.io/PassPlay/) ← タップしてスタート

## ローカル開発

```sh
python3 -m http.server 8000
# → http://localhost:8000/
```

## プラグインの追加

PassPlayのゲームは、バージョン付きマニフェストとHTML契約を持つプラグインです。
`games/<game-id>/`へプラグインを追加し、一覧を再生成します。

```sh
node build_games.js
```

このコマンドはマニフェスト、アセット、HTMLインターフェースも検証します。
`games.json`は生成ファイルのため、直接編集しないでください。

プラグインAPIと実装方法は [プラグイン開発ガイド](./docs/plugin-development.md) を参照してください。

## ドキュメント

各ゲームの遊び方は [docs/](./docs/README.md) を参照。
