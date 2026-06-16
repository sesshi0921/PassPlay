# Cloudflare セットアップ

PassPlay の multiplayer API を Cloudflare へ載せるための手順です。
静的サイトは Pages、ルーム API は Worker + Durable Objects を想定します。

## 先にやること

- Cloudflare にサインイン済みであること
- GitHub リポジトリがあること
- このリポジトリが `main` などのブランチに push されていること

## Pages を作る

1. Cloudflare ダッシュボードで `Workers & Pages` を開く
2. `Create application` を押す
3. `Pages` を選ぶ
4. `Connect to Git` を選ぶ
5. GitHub と連携する
6. このリポジトリを選ぶ
7. Framework preset は空のままでよい
8. Build command は空欄
9. Build output directory は `/`
10. Root directory は空欄
11. `Save and Deploy` を押す

## Wrangler 認証

ローカル端末で次を実行します。

```sh
npx wrangler login
```

ブラウザが開いたら:

1. Cloudflare アカウントを選ぶ
2. 権限を承認する
3. ターミナルに戻る

確認:

```sh
npx wrangler whoami
```

## Worker と Durable Object

この repo に `wrangler.jsonc` と Worker コードを追加してあります。
認証後、次を実行します。

```sh
npx wrangler deploy
```

必要に応じて、初回だけ Durable Object の migration が走ります。

## デプロイ後に確認するもの

- Worker URL
  - 例: `https://passplay-multi.<subdomain>.workers.dev`
- Pages URL
  - 例: `https://passplay.pages.dev`

## Pages から API を使う方法

初期段階では Pages と Worker を別 URL にしてよいです。
その場合、フロント側は API ベース URL を設定して接続します。

今後、同一ドメインに寄せたければ:

- Pages Functions へ寄せる
- あるいは Worker 経由で静的配信もまとめる

まずは別 URL で動かしてから整理する方が速いです。
