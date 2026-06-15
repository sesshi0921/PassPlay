# PassPlay プラグイン開発ガイド

PassPlayのゲームは、共通ホスト内の`iframe`で実行されるHTMLプラグインです。
プラグインはマニフェストとHTMLインターフェースを宣言し、ホスト機能へは
`window.PassPlay` APIを通してアクセスします。

## ディレクトリ構成

```text
games/example-game/
├── meta.json
├── index.html
├── game.js
├── style.css
└── icon.png
```

## マニフェスト

`meta.json`の必須項目は次のとおりです。
完全な形式は
[`core/plugin-manifest.schema.json`](../core/plugin-manifest.schema.json)でも定義しています。

```json
{
  "name": "サンプルゲーム",
  "version": "1.0.0",
  "apiVersion": "1.0",
  "entry": "index.html",
  "icon": "icon.png",
  "description": "ゲームの説明",
  "min": 2,
  "max": 4,
  "permissions": ["players:read", "navigation"],
  "assets": ["index.html", "game.js", "style.css", "icon.png"]
}
```

- `version`: プラグイン自身のSemVerバージョン
- `apiVersion`: 対応するPassPlay Plugin APIバージョン
- `entry`: ホストが読み込むHTML
- `permissions`: 使用するホストAPIの権限
- `assets`: オフラインキャッシュへ含める全ファイル
- `min` / `max`: 対応プレーヤー数

## HTMLインターフェース

エントリHTMLは次の契約を満たす必要があります。

```html
<meta name="passplay-plugin-id" content="example-game">
<meta name="passplay-api-version" content="1.0">

<link rel="stylesheet" href="./style.css">
<link rel="stylesheet" href="../../core/game-theme.css">

<main data-passplay-plugin-root>
  <!-- ゲームUI -->
  <a href="../../index.html" data-passplay-home>トップへ戻る</a>
</main>

<script src="../../core/plugin-sdk.js"></script>
<script src="./game.js"></script>
```

- プラグインIDはディレクトリ名と一致させます。
- `data-passplay-plugin-root`は1つ以上必要です。
- ゲーム固有CSSの後に`core/game-theme.css`を読み込みます。
- 盤面などの固有レイアウトは`style.css`、背景・カード・ボタン・入力欄は共通テーマへ委ねます。
- オセロも共有テーマを使用し、緑の盤面など必要なゲーム固有部分だけを維持します。
- SDKはゲームスクリプトより先に読み込みます。
- `data-passplay-home`付き要素はNavigation APIへ自動接続されます。

## JavaScript API

ゲームは`PassPlay.register()`へ初期化関数を登録します。初期化が完了するまで、
ホストはゲームをready状態として扱いません。

```js
window.PassPlay.register(async api => {
  const players = await api.players.list();
  // DOMイベント登録と初期画面の描画
});
```

### コンテキスト

```js
const context = await api.context.get();
```

プラグイン情報、APIバージョン、ロケール、PWA実行状態を返します。

### プレーヤー

権限: `players:read`

```js
const players = await api.players.list();
```

プレーヤー名の配列を返します。プラグインから共有ストレージを直接読む必要はありません。

### プラグインストレージ

権限: 読み込みは`storage:read`、変更は`storage:write`

```js
await api.storage.set('settings', { sound: true });
const settings = await api.storage.get('settings');
await api.storage.remove('settings');
```

データはプラグインIDごとに名前空間分離されます。1件の上限は100KBです。

### ナビゲーション

権限: `navigation`

```js
await api.navigation.home();
```

### アセット

```js
const url = api.assets.url('./data.json');
const data = await api.assets.fetchJSON('./data.json');
```

プラグインディレクトリを基準にローカルアセットへアクセスします。

### ライフサイクル

```js
const unsubscribe = api.lifecycle.on('activate', () => {
  // ゲームを再開
});

api.lifecycle.on('deactivate', () => {
  // タイマーやアニメーションを停止
});
```

現在のイベントは`activate`と`deactivate`です。

公開APIの型定義は[`core/plugin-api.d.ts`](../core/plugin-api.d.ts)を参照してください。

## 実行モデル

`play.html?game=<plugin-id>`が`games.json`からプラグインを解決し、`iframe`へ読み込みます。
SDKとホストは`postMessage`で通信し、ホストは呼び出し元と宣言権限を検証します。

同一オリジンの静的配信でローカルアセットを利用するため、`iframe`は
`allow-same-origin`付きです。この境界はAPIとDOMの分離を目的としたもので、
悪意ある第三者コードを安全に実行するためのセキュリティサンドボックスではありません。

ゲームHTMLを直接開いた場合、SDKは互換モードで動作します。

## 検証

```sh
node build_games.js
```

以下を検証して`games.json`を生成します。

- マニフェストの必須項目とAPIバージョン
- 権限名
- 宣言アセットの存在
- エントリとアイコンが`assets`に含まれること
- HTMLメタタグ、ルート要素、共通テーマ、SDK読み込み
- `game.js`の`PassPlay.register()`登録
