# PassPlay みんなのスマホ設計メモ

PassPlay に `みんなのスマホ` の共通基盤を足すための下書きです。
まずは通信仕様と Cloudflare 構成を固定し、個別ゲームはその上に載せます。

## 前提

- 参加者は各自の端末を使います
- ルームは一時的なものとして扱います
- 進行役はホスト 1 人を想定します
- 同期は `HTTP + long polling` を基本にします
- サーバ実装は Cloudflare Workers + Durable Objects を想定します

## Cloudflare 構成

- Cloudflare Pages
  - `index.html` や `play.html` などの静的配信
- Cloudflare Worker
  - ルーム作成
  - 参加・退出
  - 状態取得
  - アクション受付
- Durable Objects
  - 1 ルームにつき 1 インスタンス
  - 順番管理
  - カード配布
  - ターン進行
  - 勝敗判定

## ルームの流れ

1. ホストがルームを作成する
2. 部屋コードを共有する
3. 各端末が参加する
4. 2人以上そろったら開始可能になる
5. ホストが開始する
6. サーバが順番を決めてカードを配る
7. 各端末は自分の手札だけを受け取る
8. プレイヤーは自分の番にカードを引く
9. ペアは自動で除去する
10. 最後までジョーカーを持った人が負けになる

## 通信方式

### 基本

状態はサーバが持ち、クライアントは「意図だけ」を送ります。
クライアントは `revision` を持っておき、差分があるかを取りにいきます。

### 推奨エンドポイント

- `POST /api/rooms`
- `POST /api/rooms/:roomId/join`
- `POST /api/rooms/:roomId/leave`
- `POST /api/rooms/:roomId/start`
- `POST /api/rooms/:roomId/actions`
- `GET /api/rooms/:roomId/state?since=<revision>`

### 役割

- `state`
  - 現在の公開状態と、本人だけに見せる私有状態を返します
- `actions`
  - `drawCard`
  - `setAppeal`
  - `clearAppeal`
  - `startGame`

## ババ抜きのルール案

- 2人以上で成立
- ジョーカー 1 枚を含める
- 開始時に全員へ均等に配る
- 同じ数字は開始時に自動で捨てる
- 自分の番に次の生存プレイヤーから 1 枚引く
- 引かれた側は手札の並び順の 1 枚を選ばせる
- 先に手札を空にした人が勝ち
- 最後までジョーカーを持っていた人が負け

## アピール機能

- 各プレイヤーは手札から最大 2 枚を選べます
- 選んだカードは少し上にずらして表示します
- 他人からは「アピール中のカード枚数」だけ見えてもよいです
- 実カード内容は本人だけに返します

## API 返却イメージ

```json
{
  "roomId": "ABCD12",
  "revision": 18,
  "phase": "playing",
  "players": [
    { "id": "p1", "name": "ホスト", "cardCount": 7, "alive": true }
  ],
  "turnPlayerId": "p1",
  "you": {
    "playerId": "p1",
    "isHost": true,
    "hand": []
  }
}
```

## PassPlay 側の拡張案

- `api.room.create()`
- `api.room.join(roomId)`
- `api.room.leave()`
- `api.room.getState()`
- `api.room.onStateChange(handler)`
- `api.room.sendAction(action)`

この形にすると、今後のみんなのスマホ対応ゲームでも同じ API を使えます。
