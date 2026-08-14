# CLAUDE.md

このリポジトリは **TOGAF 10 EAP MCP** — TOGAF® Standard, 10th Edition(EA Practitioner 体系)をベースにした非公式のコンサルティング MCP サーバー(TypeScript + 公式 `@modelcontextprotocol/sdk`、stdio トランスポート)。

## 現在の状態と進め方

- 実装計画と進捗チェックリストは **`docs/PLAN.md`** にある。**必ず最初に読むこと。** 項目を完了したらチェックを更新する。
- 初版(v0.1.0)は実装済み。ツール 15 件、知識ベース(ADM 10 フェーズ / 技法 11 / 成果物 21 / 用語 35 / コンサルルール 14)、エンゲージメント永続化、Markdown + HTML(SSE ライブ更新)ダッシュボードが動作する。
- 検証は `npm test`(vitest 40 件)と `npm run smoke`(stdio JSON-RPC 57 チェック)。**変更したら両方を通すこと。**

## コマンド

```bash
npm install     # 依存インストール
npm run build   # tsc ビルド → dist/
npm test        # vitest
npm run smoke   # stdio JSON-RPC スモークテスト (scripts/smoke.mjs)
```

## 設計上の決定事項(変更しない)

- **ESM** (`"type": "module"`) + TypeScript strict、module は Node16。
- 依存は最小限: `@modelcontextprotocol/sdk` と `zod` のみ。HTTP ダッシュボードは **node:http 標準モジュール + SSE**(express 等は追加しない)。
- 知識ベースは**日英バイリンガル**(`{ ja, en }` 併記の型)で、TOGAF 原文の転載は**禁止**。フェーズ名・成果物名などの事実情報+**独自の要約・解説**のみを書く。
- エンゲージメント状態は JSON 永続化。既定 `~/.togaf-eap/engagement.json`、環境変数 `TOGAF_EAP_DATA_DIR` で変更可。
- ダッシュボードは Markdown(会話内・コピペ・印刷用)と HTML(ローカル HTTP + SSE ライブ更新、印刷用 CSS)の両方。
- ライセンスは **個人利用のみ・AI 学習禁止**(LICENSE.md)。ライセンス種別を変えない。

## ディレクトリ構成(目標)

```
src/
├── index.ts          # エントリ: stdio MCP サーバー起動
├── server.ts         # McpServer 生成・全ツール登録
├── knowledge/        # types.ts, adm-phases.ts, techniques.ts, deliverables.ts, glossary.ts, consulting.ts
├── engagement/       # model.ts, store.ts
├── dashboard/        # markdown.ts, html.ts, httpServer.ts
└── tools/            # ツール実装
tests/                # vitest
scripts/smoke.mjs     # スモークテスト
```

ツールの一覧と仕様は `docs/PLAN.md` と README.md の表を参照。
