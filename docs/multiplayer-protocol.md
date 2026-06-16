# PassPlay Multiplayer Protocol

PassPlay の `みんなのスマホ` モード向け共通仕様です。
HTTP と WebSocket のどちらでも同じデータ構造を使い、ゲーム側は transport を意識しません。

## 目的

- ゲームごとに通信仕様を分裂させない
- HTTP と WebSocket を共存させる
- 再接続時に `revision` ベースで追いつける
- 公開状態と秘密状態を分離する

## 共通用語

- `roomId`
  - ルーム識別子
- `playerId`
  - プレイヤー識別子
- `sessionToken`
  - サーバが発行するセッショントークン
- `revision`
  - 状態更新ごとの連番
- `publicState`
  - 全員に見せてよい状態
- `privateState`
  - 本人にだけ見せる状態

## クライアントアクション

```json
{
  "type": "draw-card",
  "payload": {
    "slot": 2
  }
}
```

ルール:

- クライアントは状態そのものを書き換えない
- クライアントは `action` を送るだけにする
- サーバが妥当性を検証して新しい状態を返す

## スナップショット

```json
{
  "roomId": "ABCD12",
  "gameId": "old-maid",
  "revision": 12,
  "phase": "playing",
  "transport": "http",
  "me": {
    "roomId": "ABCD12",
    "playerId": "p_1",
    "playerName": "Host",
    "isHost": true,
    "transport": "http",
    "joined": true
  },
  "players": [],
  "publicState": {},
  "privateState": {}
}
```

## HTTP API

- `POST /api/rooms`
- `POST /api/rooms/:roomId/join`
- `POST /api/rooms/:roomId/leave`
- `POST /api/rooms/:roomId/start`
- `POST /api/rooms/:roomId/actions`
- `GET /api/rooms/:roomId/sync`

### `POST /api/rooms`

```json
{
  "gameId": "old-maid",
  "playerName": "Host",
  "transport": "http"
}
```

### `POST /api/rooms/:roomId/join`

```json
{
  "playerName": "Guest",
  "transport": "ws"
}
```

### `GET /api/rooms/:roomId/sync`

クエリ:

- `playerId`
- `sessionToken`
- `since`

`since` が最新未満なら即時返却し、同じなら短時間待機して差分が出た時点で返します。

## WebSocket

URL:

- `GET /api/rooms/:roomId/ws?playerId=...&sessionToken=...`

### client -> server

```json
{
  "type": "hello",
  "lastRevision": 10
}
```

```json
{
  "type": "action",
  "action": {
    "type": "draw-card",
    "payload": {
      "slot": 2
    }
  }
}
```

### server -> client

```json
{
  "type": "snapshot",
  "snapshot": {}
}
```

```json
{
  "type": "error",
  "message": "invalid action"
}
```

## transport の使い分け

- `http`
  - 初期実装
  - ターン制ゲーム
  - シンプルな復帰処理
- `ws`
  - リアルタイム演出が強いゲーム
  - 低遅延同期が必要なゲーム

ゲームコードは transport を選ぶだけにして、データ構造は変えません。
