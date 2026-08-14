# TOGAF 10 EAP MCP

TOGAF® Standard, 10th Edition(Enterprise Architecture Practitioner 体系)をベースにした、**アーキテクト支援・コンサルティング MCP サーバー**です(非公式)。

Claude Code / Claude Desktop などの MCP クライアントから、ADM フェーズの参照、状況に応じたコンサルティング、エンゲージメント(アーキテクチャ案件)の進捗管理、そして **Markdown / ブラウザ両対応のライブダッシュボード** を利用できます。

> **An unofficial, bilingual (JA/EN) MCP server** that acts as a TOGAF-based EA consultant: ADM phase reference, situation-driven consulting, engagement tracking, and a live-updating browser dashboard alongside copy/print-friendly Markdown.

## 特徴 / Features

- 📚 **バイリンガル知識ベース** — ADM 全 10 フェーズ、主要技法、主要成果物、用語集を日英併記の独自要約で収録
- 🧭 **コンサルティング** — 状況を自由記述で渡すと、関連フェーズ・推奨技法・作るべき成果物・確認質問を提案
- 📋 **エンゲージメント管理** — フェーズ進捗・リスク・決定事項・アクション・成果物ステータスを JSON で永続化
- 📊 **デュアルダッシュボード** — 会話内で使える Markdown 版と、SSE でライブ更新されるブラウザ版(印刷用 CSS 付き)
- 📝 **成果物テンプレート生成** — Architecture Vision などの Markdown 雛形を生成

## セットアップ / Setup

```bash
git clone https://github.com/Waganawa-Megumin/togaf10_EAP_MCP.git
cd togaf10_EAP_MCP
npm install
npm run build
```

### Claude Code に登録 / Register with Claude Code

```bash
claude mcp add togaf-eap -- node /path/to/togaf10_EAP_MCP/dist/index.js
```

### Claude Desktop に登録 / Register with Claude Desktop

`claude_desktop_config.json` に追加:

```json
{
  "mcpServers": {
    "togaf-eap": {
      "command": "node",
      "args": ["/path/to/togaf10_EAP_MCP/dist/index.js"]
    }
  }
}
```

## ツール一覧 / Tools

| ツール | 説明 |
| --- | --- |
| `list_adm_phases` / `get_adm_phase` | ADM フェーズ(Preliminary〜H, Requirements Management)の目的・入力・ステップ・成果物・実務のコツ |
| `list_techniques` / `get_technique` | ギャップ分析・ビジネスシナリオ等の ADM 技法の解説と適用場面 |
| `list_deliverables` / `get_deliverable` | Architecture Vision 等の成果物の説明・作成タイミング・記載項目 |
| `get_glossary_term` | EA / TOGAF 頻出用語の日英定義(引数なしで全件一覧) |
| `search_togaf` | 知識ベース全体の日英キーワード検索 |
| `generate_deliverable_template` | 成果物の Markdown 雛形を生成 |
| `consult` | 状況の自由記述から、関連フェーズ・技法・成果物・アクション・確認質問を提案 |
| `start_engagement` / `get_engagement` / `update_engagement` | エンゲージメント(案件)の作成・参照・更新 |
| `get_dashboard` | エンゲージメント状態を整形済み Markdown で出力(コピペ・印刷向け) |
| `open_dashboard` | ローカル HTTP サーバーを起動しブラウザでライブダッシュボードを表示 |

## 使い方の例 / Example Prompts

- 「レガシー基幹システムの刷新を任された。TOGAF 的に何から始めるべき?」→ `consult`
- 「フェーズ A の成果物を教えて」→ `get_adm_phase`
- 「この案件のエンゲージメントを開始して、リスクを登録して」→ `start_engagement` / `update_engagement`
- 「ダッシュボードをブラウザで開いて」→ `open_dashboard`(作業を進めると自動でライブ更新されます)

## 設定 / Configuration

| 環境変数 | 既定値 | 説明 |
| --- | --- | --- |
| `TOGAF_EAP_DATA_DIR` | `~/.togaf-eap` | エンゲージメント状態(`engagement.json`)の保存先ディレクトリ |
| `TOGAF_EAP_DASHBOARD_PORT` | `0`(空きポート自動割当) | `open_dashboard` が listen するポート |

エンゲージメント状態は既定で `~/.togaf-eap/engagement.json` に保存されます。書き込みは一時ファイル + rename の atomic 書き込みなので、ダッシュボードが書きかけの JSON を読むことはありません。

The engagement state is persisted to `~/.togaf-eap/engagement.json` by default; override with `TOGAF_EAP_DATA_DIR`. Writes are atomic (temp file + rename), so the dashboard never reads a half-written file.

### ダッシュボードのエンドポイント / Dashboard endpoints

`open_dashboard` は `127.0.0.1` のみに bind します(外部公開しません)。

| パス | 内容 |
| --- | --- |
| `/` | ダッシュボード HTML(自己完結・外部 CDN 参照なし・印刷用 CSS 付き) |
| `/api/state` | 現在のエンゲージメント JSON |
| `/events` | SSE。状態ファイルの変更を push |
| `/health` | 死活確認 |

## 開発 / Development

```bash
npm run build   # TypeScript ビルド
npm test        # vitest ユニットテスト
npm run smoke   # stdio JSON-RPC スモークテスト
```

## ライセンス / License

**個人利用のみ・AI 学習禁止** のカスタムライセンスです。詳細は [LICENSE.md](./LICENSE.md) を参照してください。

Personal use only; AI/ML training on this repository is prohibited. See [LICENSE.md](./LICENSE.md).

## 商標に関する注記 / Trademark Notice

TOGAF® は The Open Group の登録商標です。本プロジェクトは非公式であり、The Open Group とは無関係です。収録している知識ベースは独自の要約・解説であり、TOGAF 標準の原文の複製を含みません。

### なぜ原文を収録しないのか / Why no source text is included

TOGAF 標準は**オンラインでの閲覧は無料**で、**自組織のアーキテクチャ策定に自由に使える**一方、**複製・再配布は許諾なく認められていません**(TOGAF Standard 10th Edition, §1.3.1 Conditions of Use)。さらに原本の著作権表記は、書面の許諾なく本文を **LLM / 生成 AI の学習・開発、およびそれらのツールと関連してデータやコンテンツを生成する目的で利用・組み込むこと**を明示的に禁じています。

本プロジェクトは MCP サーバーとして AI から利用されるものであるため、この条項に抵触しないよう、著作権の及ばない**事実情報**(フェーズ名・成果物名などの構造)のみを用い、解説は**すべて独自に執筆**しています。

The TOGAF Standard is free to view online and free to use for developing your own organization's architecture, but it may not be reproduced or redistributed without permission, and its copyright notice explicitly prohibits incorporating the text into LLM/generative-AI systems or using it in connection with such tools to generate content. Since this project is consumed by an AI assistant, it therefore carries only non-copyrightable factual structure plus wholly original commentary.

TOGAF® is a registered trademark of The Open Group. This project is unofficial and not affiliated with The Open Group. The knowledge base consists of original summaries and does not reproduce the official TOGAF text.
