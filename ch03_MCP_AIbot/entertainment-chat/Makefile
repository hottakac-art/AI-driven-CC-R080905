# entertainment-chat: 初期化・開発・ビルド・デプロイ用コマンド集
#
# 前提: Node.js/npm, Docker (Docker Desktop起動済み)
# デプロイ関連ターゲットは gcloud CLI をネイティブインストールせず、
# 公式Dockerイメージ(gcr.io/google.com/cloudsdktool/google-cloud-cli)を使う。
# 認証情報は名前付きボリューム gcloud-config に永続化される。
#
# 使い方: `make help` でターゲット一覧を表示
# GCPプロジェクトを切り替える場合は `make deploy PROJECT_ID=other-project-id` のように上書きする。

SHELL := /bin/bash

# ---- 変数(必要に応じて上書き可能) ----
PROJECT_ID      ?= ai-chat-509719
REGION          ?= asia-northeast1
SERVICE_NAME    ?= entertainment-chat
REPO_NAME       ?= entertainment-chat
MIN_INSTANCES   ?= 0
MAX_INSTANCES   ?= 3
IMAGE           := $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPO_NAME)/$(SERVICE_NAME)

MONGO_CONTAINER ?= entertainment-chat-mongo
MONGO_IMAGE     ?= mongo:8
MONGO_USER      ?= appuser
MONGO_PASSWORD  ?= apppassword
MONGO_DB        ?= entertainment_chat

GCLOUD_VOLUME   ?= gcloud-config
GCLOUD_IMAGE    ?= gcr.io/google.com/cloudsdktool/google-cloud-cli:stable
GCLOUD          := docker run --rm -v $(GCLOUD_VOLUME):/root/.config -v "$(CURDIR)":/workspace -w /workspace $(GCLOUD_IMAGE) gcloud

.PHONY: help init env mongo-up mongo-down mongo-logs db-init dev lint build \
        docker-build docker-run docker-stop gcloud-login require-project \
        gcp-enable-apis artifact-repo push deploy release clean

help: ## 使用可能なコマンド一覧を表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## ---- 初期化 ----

init: env mongo-up ## 依存関係インストール・ローカルMongoDB起動・スキーマ適用までまとめて実行
	npm install
	@echo "MongoDBの起動を待機しています..."
	@sleep 3
	npx prisma contract emit
	npx prisma db init
	@echo "初期化完了。.envのANTHROPIC_API_KEYを設定してから 'make dev' を実行してください。"

env: ## .envが無ければ.env.exampleからコピー
	@test -f .env || cp .env.example .env
	@echo ".envを確認しました。ANTHROPIC_API_KEYが未設定の場合は設定してください。"

## ---- ローカルMongoDB ----

mongo-up: ## ローカル開発用MongoDBをDockerで起動(既存コンテナがあれば再利用)
	@docker inspect $(MONGO_CONTAINER) >/dev/null 2>&1 && \
	  docker start $(MONGO_CONTAINER) >/dev/null || \
	  docker run -d --name $(MONGO_CONTAINER) -p 27017:27017 \
	    -e MONGO_INITDB_ROOT_USERNAME=$(MONGO_USER) \
	    -e MONGO_INITDB_ROOT_PASSWORD=$(MONGO_PASSWORD) \
	    -e MONGO_INITDB_DATABASE=$(MONGO_DB) \
	    $(MONGO_IMAGE) >/dev/null
	@echo "MongoDB: $(MONGO_CONTAINER) 起動済み(mongodb://$(MONGO_USER):$(MONGO_PASSWORD)@localhost:27017/$(MONGO_DB)?authSource=admin)"

mongo-down: ## ローカルMongoDBコンテナを停止
	docker stop $(MONGO_CONTAINER)

mongo-logs: ## ローカルMongoDBのログを表示
	docker logs -f $(MONGO_CONTAINER)

db-init: ## Prisma contractを再生成し、実DBにコレクション/インデックスを反映
	npx prisma contract emit
	npx prisma db init

## ---- 開発 ----

dev: mongo-up ## 開発サーバーを起動(MongoDBも自動起動)
	npm run dev

lint: ## ESLintを実行
	npm run lint

build: ## 本番ビルド(Next.js)を確認
	npm run build

## ---- コンテナ(Cloud Run互換イメージ) ----

docker-build: ## Cloud Run向けDockerイメージをローカルビルド
	docker build -t $(SERVICE_NAME):local .

docker-run: docker-build ## ビルドしたイメージをローカルで起動(.envの値を使用、http://localhost:8080)
	-docker rm -f $(SERVICE_NAME)-local >/dev/null 2>&1
	docker run -d --name $(SERVICE_NAME)-local -p 8080:8080 --env-file .env $(SERVICE_NAME):local
	@echo "起動しました: http://localhost:8080 ('make docker-stop' で停止)"

docker-stop: ## ローカルコンテナを停止・削除
	-docker rm -f $(SERVICE_NAME)-local

## ---- Google Cloudデプロイ ----
## 事前に `make gcloud-login` でGoogleアカウント認証が必要(ブラウザでの対話操作)。
## PROJECT_ID未指定のターゲットはエラーで停止する。

require-project:
	@test -n "$(PROJECT_ID)" || (echo "エラー: PROJECT_ID が未指定です。例: make deploy PROJECT_ID=my-project-id" && exit 1)

gcloud-login: ## gcloud CLIにログイン(ブラウザでの対話操作が必要)
	docker run --rm -it -v $(GCLOUD_VOLUME):/root/.config $(GCLOUD_IMAGE) gcloud auth login

gcp-enable-apis: require-project ## Cloud Run/Artifact Registry/Secret ManagerのAPIを有効化
	$(GCLOUD) services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project=$(PROJECT_ID)

artifact-repo: require-project ## Artifact Registryリポジトリを作成(既存の場合はエラーを無視)
	$(GCLOUD) artifacts repositories create $(REPO_NAME) \
	  --repository-format=docker --location=$(REGION) --project=$(PROJECT_ID) || true

push: require-project artifact-repo ## Cloud Buildでイメージをビルドし、Artifact Registryへpush
	$(GCLOUD) builds submit --tag $(IMAGE) --project=$(PROJECT_ID)

VPC_CONNECTOR  ?= ent-chat-vpc

deploy: require-project push ## Cloud Runにデプロイ(ANTHROPIC_API_KEY/DATABASE_URLはSecret Manager登録済み前提)
	$(GCLOUD) run deploy $(SERVICE_NAME) \
	  --image=$(IMAGE) \
	  --region=$(REGION) \
	  --project=$(PROJECT_ID) \
	  --platform=managed \
	  --allow-unauthenticated \
	  --vpc-connector=$(VPC_CONNECTOR) \
	  --vpc-egress=private-ranges-only \
	  --min-instances=$(MIN_INSTANCES) \
	  --max-instances=$(MAX_INSTANCES) \
	  --memory=512Mi \
	  --set-secrets=ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,DATABASE_URL=DATABASE_URL:latest

release: build docker-build deploy ## ローカルビルド確認 → イメージビルド → Cloud Runデプロイを一括実行

## ---- 後片付け ----

clean: ## ビルド成果物・ローカルテストコンテナを削除
	rm -rf .next
	-docker rm -f $(SERVICE_NAME)-local
