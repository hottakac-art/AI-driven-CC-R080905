<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# プロジェクト仕様

## 基本情報

- **プロジェクト名**: Entertainment AI Chat(仮)
- **目的・背景**: エンターテインメント目的のAIチャットボット。雑談・娯楽的な対話体験を提供する。
- **対象ユーザー**: 一般の人(不特定多数のWebユーザーを想定)。

## 概要

Claude APIを用いたWebチャットアプリケーション。ユーザーは認証なしでアクセスし、AIとの対話を楽しむ。MCPツール連携は行わない、対話に特化したシンプルなチャットボット。

## プラットフォーム

Webアプリケーション(ブラウザからアクセス)。

## 技術スタック

- **フロントエンド**: Next.js (App Router)
- **バックエンド**: Hono(Next.js App Router内にAPIルートとしてマウント。`app/api/[[...route]]/route.ts`でHonoアプリを実行)
- **ORM**: Prisma ORM 8(`@prisma/orm-mongo`によるMongoDB向けcontract方式)
- **データベース**: MongoDB(Prisma経由で接続)
- **AIエージェントフレームワーク**: Mastra(`@mastra/core`)
- **AIモデル**: Anthropic Claude API(モデルルーティング文字列 `anthropic/claude-sonnet-5`)

## アーキテクチャ

```
ブラウザ (Chat UI, React / Next.js)
  ⇄ Next.js App Router内のHonoアプリ (app/api/[[...route]]/route.ts)
      ⇄ Mastra Agent (エージェント/会話オーケストレーション)
          ⇄ Anthropic Claude API
      ⇄ Prisma (orm-mongo) ⇄ MongoDB (会話データの永続化)
```

- MCPサーバー連携は行わない(対話機能のみに特化)。
- 会話履歴はMongoDBから読み出してMastra Agentの`generate()`にメッセージ配列として渡す方式とし、Mastra組み込みのMemory機能は使わない(DBを明示的にPrisma経由で扱う要件のため)。

## 機能要件

- **必須機能**: AIとの対話(チャット)機能。テキストに加え、画像添付によるマルチモーダル入力に対応(`claude-sonnet-5`のVision機能を利用)。
- ユーザー認証: 不要。
- 多言語対応: 不要。

## 画像添付(マルチモーダル)

- 1メッセージにつき最大3枚、1枚あたり4MB(base64化前サイズ換算)まで。対応形式は png/jpeg/webp/gif。
- 制限値は`app/api/[[...route]]/route.ts`(サーバー側の最終防御)と`components/ChatApp.tsx`(クライアント側の即時フィードバック)の両方に定義している。変更する際は両方を揃えること。
- メッセージ本文にも上限を設定済み(`MAX_MESSAGE_LENGTH = 4000`文字、`route.ts`)。
- Claude APIへは`@mastra/core/llm`の`CoreMessage`が持つ`UserContent`形式(`{ type: 'text' | 'image', ... }`の配列)で渡す。assistant側の発言は常にテキストのみ(画像を生成しないため)。

## データ永続化

- 会話履歴は**セッション中のみ**保持する。ブラウザの`sessionStorage`でセッションID(UUID)を発行し、タブ/ブラウザを閉じると履歴は失われる想定。
- MongoDB(Prisma `orm-mongo`経由)には`Message`コレクション(`sessionId`・`role`・`content`・`images`(`ImageAttachment[]`複合型: `mediaType`・`data`)・`createdAt`)として保存するが、これはHono APIがステートレスにリクエストを処理するための一時的な会話コンテキスト保持が目的であり、長期保存・分析目的の永続化ではない。画像もbase64のまま同一ドキュメントに保存する(外部ストレージ連携は行っていない)。
- 1会話セッションあたりのメッセージ数に上限は設けない。
- 運用上の補足: セッション終了後のドキュメントは自動削除されない(明示的なクリーンアップは未実装)。長期間放置されたデータを残したくない場合は、MongoDB側でTTLインデックス(例: `createdAt`に対し`expireAfterSeconds`)を運用者が別途設定することを想定。
- スキーマ変更時の注意: `messages`コレクションに既存データがある状態で`Message`モデルへ必須フィールドを追加すると、`prisma db init`はMongoDBのバリデータ更新を「destructive」と判断し失敗する(additive操作のみ許可のため)。ローカル開発ではコレクションをdropしてから`db init`し直す運用としている(本番はまだ運用データが無いため未検証。将来同様の変更をする際は移行方針を検討すること)。

## 環境変数

`.env`(コミットしない):

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=mongodb+srv://...
```

## 決定事項

- **エージェントのキャラクター設定**: 持たせない。名前や人格を設定せず、丁寧で実務的なトーンの中立的なアシスタントとして応答する(`lib/mastra/agent.ts`)。
- **AIモデル**: `anthropic/claude-sonnet-5` を使用し、`providerOptions.anthropic`で`thinking: { type: "adaptive" }` + `effort: "high"`を指定して応答品質を優先する。
- **ストリーミング**: 行わない(単発リクエスト/レスポンス)。
- **デザインテーマ**: ビジネスライク(Slate系の落ち着いた配色、装飾を抑えた角丸、フォーマルな文言)。レスポンシブ対応必須(スマートフォン幅でも崩れないレイアウト)。
- **デプロイ先**: Google Cloud Run。GCPプロジェクトID: `ai-chat-509719`(`Makefile`の`PROJECT_ID`既定値もこれに設定済み)。リージョンは`asia-northeast1`。
- **想定スケール**: 同時接続ユーザー数5〜10人程度。
- **開発計画**: 段階的リリースや優先順位付けは行わない。
- **予算**: API利用料金や予算の制約は設けない。

## ビルド・実行コマンド

初期化・開発・ビルド・デプロイの各コマンドは`Makefile`にまとめている。`make help`で一覧表示できる(`make`はこの環境ではwingetで`ezwinports.make`をインストール済み)。個別のnpm/prismaコマンドは以下の通り。

- `npm install` — 依存関係インストール
- `npm run dev` — 開発サーバー起動
- `npm run lint` — ESLint実行
- `npm run build` — 本番ビルド確認
- `npx prisma contract emit` — Prisma contractからクライアントコード(`contract.json`/`contract.d.ts`)を生成(`DATABASE_URL`未設定でも生成自体は可能)
- `npx prisma db init` — 実DBに対してコレクション・インデックスを作成(要`DATABASE_URL`)

### ローカル開発用MongoDBの起動

本番はMongoDB Atlas等を想定するが、ローカル開発では以下でDockerコンテナを起動する:

```
docker run -d --name entertainment-chat-mongo -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=appuser \
  -e MONGO_INITDB_ROOT_PASSWORD=apppassword \
  -e MONGO_INITDB_DATABASE=entertainment_chat \
  mongo:8
```

対応する`.env`の`DATABASE_URL`:

```
DATABASE_URL="mongodb://appuser:apppassword@localhost:27017/entertainment_chat?authSource=admin"
```

停止/再開は `docker stop entertainment-chat-mongo` / `docker start entertainment-chat-mongo`。データはコンテナ内に保持されるため、`docker rm`すると消える(永続化が必要な場合は`-v`でボリュームをマウントする)。

### コンテナイメージのビルド・ローカル起動(Cloud Run想定)

```
docker build -t entertainment-chat:local .
docker run -d --name entertainment-chat-test -p 8080:8080 \
  -e ANTHROPIC_API_KEY="..." \
  -e DATABASE_URL="..." \
  entertainment-chat:local
```

`server.js`(Next.js standalone出力)は`PORT`(デフォルト8080)・`HOSTNAME`(デフォルト`0.0.0.0`)環境変数を読むため、Cloud Runの規約にそのまま適合する。

### gcloud CLI(Google Cloud SDK)

このプロジェクトの開発環境にはWindowsネイティブの`gcloud` CLIをインストールせず、公式Dockerイメージを使用する。認証情報は名前付きボリューム`gcloud-config`に永続化する。

```
# 初回のみ: ブラウザでのGoogleアカウント認証が必要なため対話的に実行する
docker run --rm -it -v gcloud-config:/root/.config \
  gcr.io/google.com/cloudsdktool/google-cloud-cli:stable \
  gcloud auth login

# 以降のコマンド実行例(プロジェクト一覧表示)
docker run --rm -v gcloud-config:/root/.config \
  gcr.io/google.com/cloudsdktool/google-cloud-cli:stable \
  gcloud projects list
```

### 本番インフラ(GCPプロジェクト: ai-chat-509719)

- **Cloud Run**: サービス名`entertainment-chat`、リージョン`asia-northeast1`。VPCコネクタ`ent-chat-vpc`経由でMongoDB VMに接続(`--vpc-egress=private-ranges-only`でAnthropic APIへの通常インターネット接続は維持)。
- **MongoDB**: GCE VM `entertainment-chat-mongo-vm`(`asia-northeast1-a`)に自前構築。外部IPなし、ファイアウォール`allow-mongo-internal`でVPC内(サブネット`10.146.0.0/20`・VPCコネクタ`10.8.0.0/28`)からのポート27017のみ許可。内部IPは静的予約(`entertainment-chat-mongo-ip`)。
- **Cloud NAT**: `ent-chat-router` + `ent-chat-nat`(VMがパッケージ取得のためインターネットに出るために必要。外部IPを持たないVMの標準構成)。
- **Secret Manager**: `ANTHROPIC_API_KEY`・`DATABASE_URL`を登録。Cloud Runのランタイムサービスアカウント(`63766419466-compute@developer.gserviceaccount.com`)に`roles/secretmanager.secretAccessor`を付与済み。
- **Artifact Registry**: リポジトリ`entertainment-chat`(Docker形式、`asia-northeast1`)。

### CI/CD(GitHub Actions)

- ワークフロー: リポジトリルートの`.github/workflows/deploy-entertainment-chat.yml`(`ch03_MCP_AIbot/entertainment-chat/**`への変更で自動デプロイ、`workflow_dispatch`で手動実行も可)。
- 認証はWorkload Identity Federation(サービスアカウントキーの発行はしない)。
  - Workload Identity Pool: `github-pool`(GitHub OIDC、`repository_owner == 'hottakac-art'`に制限)
  - Provider: `github-provider`
  - CI用サービスアカウント: `github-actions-deploy@ai-chat-509719.iam.gserviceaccount.com`(このリポジトリ`hottakac-art/AI-driven-CC-R080905`からのみimpersonate可能)
- **未対応(要ユーザー承認)**: `github-actions-deploy`サービスアカウントへの実行権限付与(`roles/run.admin`・`roles/artifactregistry.writer`・`roles/iam.serviceAccountUser`)。IAMロールの付与は権限昇格を伴うため、Claude Codeの自動実行では許可されずブロックされた。ユーザー自身が実行するか、明示的に許可した上で依頼する必要がある。
