# 実行計画: Entertainment AI Chat 構築ToDo

対象: `ch03_MCP_AIbot/entertainment-chat`
前提: Next.js(App Router) + Hono + Prisma(orm-mongo) + MongoDB + Mastra + Claude API のコード実装は完了済み(ローカルbuild/lint通過済み)。以下は**本番相当で動く状態**にするための残タスク。

## Phase 0: 完了済み(記録)

- [x] Next.jsプロジェクト scaffold
- [x] Hono APIルート(`/api/chat`, `/api/messages`)実装
- [x] Prisma ORM 8(`@prisma/orm-mongo`)で`Message`コレクション定義・contract emit
- [x] Mastra Agent実装(`claude-sonnet-5`, adaptive thinking + effort high, ノーペルソナ)
- [x] チャットUI実装(ビジネスライク・Slateデザイン・レスポンシブ)
- [x] セッション限定保存(`sessionStorage`)への変更
- [x] `npm run lint` / `npm run build` 通過確認
- [x] ダミー環境変数でのエラーハンドリング動作確認(MongoDB未接続時に500+エラーJSONを返すこと)

## Phase 1: 実接続環境の準備

- [ ] Anthropic API キーを発行(console.anthropic.com) — **要ユーザー対応**: Claude Codeの認証情報とは別に、アプリ実行用のキーが必要。Claude Codeからはアカウント操作を代行できないため、ユーザーがキーを発行し`.env`に設定する必要がある。
- [x] MongoDB接続先を決定・構築
  - [x] ローカル開発用MongoDBをDockerコンテナ(`mongo:8`, コンテナ名`entertainment-chat-mongo`, ポート27017)で起動(本番用のMongoDB Atlasクラスタは別途Phase 5で検討)
  - [x] 接続文字列(`DATABASE_URL`)を`.env`に設定(`mongodb://appuser:apppassword@localhost:27017/entertainment_chat?authSource=admin`)
  - [ ] (本番向け)MongoDB Atlasクラスタ作成・Cloud Runからのネットワークアクセス設定 — Phase 5で対応
- [x] ローカル`.env`に`DATABASE_URL`を設定(`ANTHROPIC_API_KEY`は依然プレースホルダーのまま — 要ユーザー対応)
- [x] `npx prisma contract emit` を実接続で再実行し、スキーマとMongoDB側の整合を確認
- [x] `npx prisma db init` で`messages`コレクション・`sessionId`インデックスを実際に作成
- [x] Prisma Client経由での実データCRUD(create/where/delete)をスモークテストし、正常動作を確認

> **残タスク**: `ANTHROPIC_API_KEY`の発行・設定のみユーザー対応が必要です。それ以外(MongoDB接続・スキーマ適用)はローカルDocker環境で完了しました。

## Phase 2: ローカルでの実動作確認

- [ ] `npm run dev` で起動し、実際にメッセージを送受信して**応答が返る**ことを確認 — **未完了(要ユーザー対応)**: `ANTHROPIC_API_KEY`が未発行のため、有効なキーでの応答生成は未検証。ダミーキーでAPIパイプライン自体(リクエスト受信→Mastra Agent呼び出し→エラー整形→JSON応答)は正常動作することは確認済み。
- [x] 会話履歴がMongoDBに保存され、`/api/messages`で正しく復元されることを確認(Node `fetch`で実リクエストを送信し、日本語メッセージがMongoDBへ正しいUTF-8で保存・復元されることを確認。**注意**: Git Bash上の`curl`直接実行はWindowsのコンソールコードページ(Shift-JIS)の影響で日本語が文字化けする既知の制約があるため、検証はNode `fetch`経由で実施)
- [ ] ブラウザタブを閉じて再度開いた際に履歴が失われる(セッション限定保存)ことを確認 — **未検証**: このセッションには実ブラウザ操作の手段(Playwright MCP等)が接続されていないため、実機/実ブラウザでの確認ができていない。コードレビュー上は`sessionStorage`使用によりタブを閉じれば消える実装になっている。
- [ ] スマートフォン幅でレイアウト崩れがないか確認 — **未検証**(同上の理由。ブラウザでの目視確認が必要)
- [ ] ダーク/ライトモード両方で表示を確認 — **未検証**(同上の理由)
- [x] エラーケースの確認(APIキー不正・MongoDB切断時にUI上でエラーメッセージが表示されること)
  - 不正なAPIキーで`/api/chat`を呼び出し、`{"error":"API key is invalid."}`(HTTP 500)が返ることを確認
  - MongoDB未接続時に`ECONNREFUSED`エラーがJSONとして安全に返ることを確認(Phase 0で確認済み)
  - いずれもUIの`ChatApp.tsx`側で`isError`スタイルのメッセージとして表示される実装になっていることをコードレビューで確認
- [x] 複数セッションから利用し、セッションごとに会話が独立していることを確認(APIレベル: 2つの異なる`sessionId`で同時にメッセージを送信し、互いの履歴が混在しないことをNode `fetch`で検証。**注意**: 実際の複数ブラウザタブでの確認は未実施)

> **残タスク**: (1) `ANTHROPIC_API_KEY`発行(要ユーザー対応)で応答生成そのものを検証、(2) 実ブラウザでのセッション限定保存・レスポンシブ・ダーク/ライトモードの目視確認(要ユーザー対応、またはPlaywright MCP接続後にClaude Codeが代行可能)。

## Phase 3: Google Cloudへのデプロイ準備

- [x] `next.config.ts`に`output: "standalone"`を設定(Cloud Run向け軽量ビルド)
- [x] `Dockerfile`を作成(マルチステージビルド、Node.js 24 slim、非rootユーザーで実行)
- [x] `.dockerignore`を作成(`node_modules`, `.next`, `.env`等除外)
- [x] ローカルで`docker build` / `docker run`し、コンテナ単体で動作することを確認(ダミー環境変数でHTTP 200/API 500の想定挙動を確認済み)
- [x] `gcloud` CLIを利用可能にする(Windowsにネイティブインストールする代わりに、公式Dockerイメージ`gcr.io/google.com/cloudsdktool/google-cloud-cli:stable`を使用。認証情報は名前付きボリューム`gcloud-config`に永続化する構成)
- [ ] GCPプロジェクトを用意(未作成なら新規作成、課金有効化) — **要ユーザー対応**: `gcloud auth login`はブラウザでのGoogleアカウント認証が必要なため、以下のコマンドをユーザー自身のターミナルで対話的に実行する必要がある:
  ```
  docker run --rm -it -v gcloud-config:/root/.config gcr.io/google.com/cloudsdktool/google-cloud-cli:stable gcloud auth login
  ```
  認証完了後は、同じ`gcloud-config`ボリュームを使うことでClaude Code側からも`gcloud`コマンドを継続実行できる。
- [ ] 必要なAPIを有効化(Cloud Run API, Artifact Registry API, Secret Manager API) — 上記認証完了後、Claude Codeが代行可能

## Phase 4: シークレット・設定管理 — **要ユーザー対応(GCPアカウント操作)**

- [ ] Secret Managerに`ANTHROPIC_API_KEY`・`DATABASE_URL`を登録
- [ ] Cloud Run サービスアカウントにSecret Managerへのアクセス権限を付与
- [ ] Cloud Runのサービス設定でシークレットを環境変数としてマウント

## Phase 5: Google Cloudへのデプロイ — **要ユーザー対応(GCPアカウント操作)**

- [ ] Artifact Registryにコンテナイメージをpush(`gcloud builds submit` または `docker push`)
- [ ] Cloud Runサービスを作成・デプロイ
- [ ] 同時接続5〜10人規模を踏まえた最小構成を設定(最小インスタンス数・最大インスタンス数・メモリ/CPU割り当て)
- [ ] デプロイ後のURLで実際にチャットが動作することを確認
- [ ] MongoDB Atlas側からCloud Runの送信元(固定IPまたはVPCコネクタ)を許可

> Phase 4・5は認証済みの`gcloud` CLIとGCPプロジェクトへのアクセス権が必要です。`gcloud` CLI自体はDockerイメージとして利用可能な状態まで準備済み(Phase 3参照)。ユーザーが`gcloud auth login`でログインし、プロジェクトを選択すれば、以降はClaude Codeからコマンド実行(イメージのビルド&push、Cloud Runへのデプロイ)を代行できます。

## Phase 6: 運用確認

- [ ] Cloud Loggingでアプリログ・エラーログが確認できることを確認
- [ ] レイテンシ・エラー率の簡易確認(手動で数回チャットを実行)
- [ ] MongoDB Atlas側でのデータ蓄積状況を確認し、必要ならTTLインデックス(セッション終了後の自動削除)の設定を検討

## Phase 7: ドキュメント整備

- [ ] `README.md`を実際のセットアップ手順(GCPデプロイ含む)に更新
- [ ] `AGENTS.md`の「決定事項」にデプロイ手順・実際に使用したGCPリソース構成を追記
- [ ] `.env.example`の内容が最新であることを再確認

## Phase 8: コードレビューで判明した実装ギャップ(2026-09-23時点)

現在のコード(`app/api/[[...route]]/route.ts`・`lib/mastra/agent.ts`・`lib/messages.ts`・`components/ChatApp.tsx`・`package.json`・`src/prisma/contract.prisma`等)を精査した結果、Phase 0〜7ではカバーされていない実装上のギャップが見つかった。重大度順に記載する。

### 重大(公開前に対応を検討すべき)

- [ ] **AI応答生成後のDB書き込み失敗で正常な応答が握りつぶされる**: `app/api/[[...route]]/route.ts`の`/chat`ハンドラーは`chatAgent.generate()`成功後に`appendMessage(sessionId, "assistant", reply)`を呼び、これが失敗(一時的なMongo書き込みエラー等)するとcatchブロックに落ち、既に生成・課金済みの`reply`を返さずエラーメッセージだけをユーザーに返してしまう。アシスタント発言の永続化失敗時もレスポンスとしては`reply`を返す(永続化失敗はログのみに留める)よう修正を検討する。
- [ ] **レート制限・乱用対策が皆無**: 「認証不要」「不特定多数の一般ユーザー」「予算・API利用料金の制限なし」という要件の組み合わせは、悪意あるユーザーによる連投・自動化された大量リクエストに対して無防備であることを意味する。IPベースのレート制限やCloud Armor等、最低限の乱用対策の要否を検討する。
- [x] **メッセージ本文の長さ上限が未設定** — 対応済み(2026-09-28): クライアント(`<input maxLength>`)・サーバー(`MAX_MESSAGE_LENGTH = 4000`、`route.ts`)の両方に上限を追加。画像添付機能(Issue #1)実装時にあわせて対応。
- [ ] **`max_tokens`(最大出力トークン数)が明示的に指定されていない**: `lib/mastra/agent.ts`のAgent定義にも、`route.ts`の`chatAgent.generate(conversation)`呼び出しにも生成オプションが一切渡されておらず、Mastra/AI SDK側の既定値に依存している。想定外の短い/長い応答や、将来のデフォルト値変更に影響されないよう明示的に設定する。
- [ ] **`providerOptions.anthropic.effort: "high"`が実際にAnthropic APIへ届いているか未検証**: この設定はOpenAIの`reasoningEffort`パターンからの類推で実装したものであり、Mastra公式ドキュメントで`effort`キーがAnthropic用providerOptionsとして明示的にサポートされていることを確認できていない。有効な`ANTHROPIC_API_KEY`が用意でき次第、実際のリクエストログ(Anthropic Consoleの使用量ログ等)で`output_config.effort`が意図通り反映されているか確認する。反映されていない場合は代替手段を検討する。

### 中程度

- [ ] **`<html lang="en">`のまま**(`app/layout.tsx`): UIも応答も全て日本語だが、scaffold時のデフォルトが残っており`lang="ja"`に修正されていない。アクセシビリティ・SEO上望ましくない。
- [ ] **会話が長くなるほどコスト・レイテンシが線形に増加する**: `lib/messages.ts`の`getHistory()`はセッションの全メッセージを無制限に取得し、`route.ts`は毎回その全履歴をClaudeに送信している(「1セッションあたりのメッセージ数に上限は設けない」という要件通りではあるが、要約・直近N件のみ送信・サーバー側コンパクション等の対策が無いため、長時間の会話でコストとレイテンシが際限なく増加する)。
- [ ] **Claudeのrefusal・max_tokens到達時のハンドリングが無い**: `route.ts`は`result.text`を無条件に使用しており、安全性による拒否(refusal)や出力トークン上限到達などの`stop_reason`を一切確認していない。該当時に空文字や不自然な応答がそのままユーザーに表示される可能性がある。
- [ ] **エラーメッセージをそのままクライアントに返している**: `route.ts`の catch節は`error.message`を`{ error: detail }`としてそのままレスポンスに含めており、MongoDB接続文字列や内部実装に関する情報が意図せず露出する可能性がある。ユーザー向けには汎用的なメッセージを返し、詳細はサーバーログにのみ出力する方式への変更を検討する。
- [ ] **`package.json`に`engines`指定が無い**: Prisma ORM 8のMongoDB機能はNode.js `^22.22.0 || >=24.12.0`を要求する(prisma-8.mdに記載)が、`package.json`にこの制約が明示されておらず、対応外のNodeバージョンで気づかずに実行してしまう恐れがある。
- [ ] **`@prisma/orm-mongo`・`prisma`がRC版(`8.0.0-rc.x`)に依存**: MongoDB向けのcontract方式は実装中に`@default(auto())`廃止など複数の破壊的変更が見つかったほど活発に変化している。GA版リリース時の追従・動作確認を行う計画が無い。

### 軽微

- [ ] セキュリティヘッダー(`X-Frame-Options`、CSP等)が未設定。
- [ ] `robots.txt`が無く、5〜10人規模想定にも関わらず検索エンジンにインデックスされ、想定外の第三者からアクセスされる可能性がある。
- [ ] 起動時に`ANTHROPIC_API_KEY`・`DATABASE_URL`の存在を検証するfail-fastの仕組みが無く、未設定のまま起動しても実際にリクエストが来るまでエラーに気づけない。
- [ ] クライアント側の`fetch`(`components/ChatApp.tsx`)にタイムアウト/中断(`AbortController`)が無く、サーバー側が応答不能になった場合「応答を生成しています...」の表示のまま止まり続ける。
- [ ] ユニットテスト・統合テストが一切無い。
- [ ] faviconや`public/`配下の画像がcreate-next-appデフォルトのままで、ブランディングされていない。
- [ ] Cloud Runの`min-instances`が`Makefile`の既定値で0のため、アイドル後の初回アクセスでコールドスタート遅延が発生する(予算制約が無い要件を踏まえ、1への引き上げを検討してもよい)。
