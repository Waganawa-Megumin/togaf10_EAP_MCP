# TOGAF 10 EAP MCP

TOGAF® Standard, 10th Edition(Enterprise Architecture Practitioner 体系)をベースにした、**アーキテクト支援・コンサルティング MCP サーバー**です(非公式)。

Claude Code / Claude Desktop などの MCP クライアントから、ADM フェーズの参照、状況に応じたコンサルティング、エンゲージメント(アーキテクチャ案件)の進捗管理、そして **Markdown / ブラウザ両対応のライブダッシュボード** を利用できます。

> **An unofficial, bilingual (JA/EN) MCP server** that acts as a TOGAF-based EA consultant: ADM phase reference, situation-driven consulting, engagement tracking, and a live-updating browser dashboard alongside copy/print-friendly Markdown.

## 設計思想 / Design

TOGAF の実務上の問題は「分厚い・抽象的・文書中心で、結局いま何をすればいいか分からない」ことです。このサーバーはそこを次の 4 点で解きます。

1. **視覚優先** — 文章の壁ではなく、図・表・マトリクスで返す(Mermaid 図を生成)
2. **次の一手が常に明確** — 「第 7 章を読め」ではなく「今週これをやれ」を返す
3. **実務ツールに接続** — ArchiMate / Archi、C4、BIZBOK、SABSA など現場が実際に使うものに繋ぐ
4. **手元の資料をそのまま入力に** — 情報セキュリティ報告書や指摘一覧を読み込んで、案件の素材に変換する

> The problem with TOGAF in practice is that it is long, abstract, and document-centric — you finish reading and still don't know what to do today. This server answers that with visual-first output, an always-explicit next action, connections to the tools practitioners actually use (ArchiMate/Archi, C4, BIZBOK, SABSA), and document intake so your existing reports become input instead of retyping.

## 特徴 / Features

- 🧭 **迷ったら `start_here`** — 状況に応じて「次にやるべき 3 つ」を根拠付きで返す。`next_best_action` / `tailor_adm`(自社版 ADM の設計)
- 📚 **バイリンガル知識ベース** — ADM 全 10 フェーズ、技法 11、成果物 21、用語 35、ビューポイント 16、業界別 10、周辺フレームワーク 18+、ArchiMate 全レイヤ、SABSA。すべて日英併記の独自要約
- 📊 **図を返す** — 能力マップ、バリューストリーム、アプリ連携図、ADM サイクル、ロードマップのガント、C4 コンテキスト図を Mermaid で生成
- 🔐 **セキュリティ EA** — SABSA の 6 層 × 6 問いを ADM に対応付け。脅威モデルの出発点、セキュリティ要件チェックリスト、案件のセキュリティ点検
- 📥 **既存ドキュメントの取り込み** — 報告書・台帳・指摘一覧(txt/md/csv/json/html)からリスク・ステークホルダー・要件・アクションを**出典行番号付き**で抽出し、案件に取り込む
- 🏗 **ArchiMate 連携** — ADM フェーズ ↔ ArchiMate 要素の対応、関係の妥当性判定、**Archi 取り込み用の CSV / Open Exchange XML 書き出し**
- 📋 **複数案件の管理** — フェーズ進捗・リスク・決定・アクション・ステークホルダー・成果物・ロードマップ・評価を JSON で永続化。案件の切替に対応
- 🔎 **分析とレビュー** — ギャップ分析、リスク行列、ステークホルダー 4 象限、成熟度/変革準備度評価、適合性レビュー用チェックリスト、案件の健全性監査
- 📈 **デュアルダッシュボード** — 会話内で使える Markdown 版と、SSE でライブ更新されるブラウザ版(四半期ロードマップ図・ヒートマップ・印刷用 CSS・ダークモード)
- 🤖 **Claude API は任意** — このサーバーはすでに LLM の中で動くため通常は不要。大量文書用に `ANTHROPIC_API_KEY` がある場合だけ有効化される

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

**81 ツール + MCP prompts 8 + resources 8。** カテゴリ別の主なもの:

### 入口 / Start here

| ツール | 説明 |
| --- | --- |
| `start_here` | 迷ったらここから。状況に応じて最初の一歩、または「今週やるべき 3 つ」を返す |
| `next_best_action` | 案件の状態を分析し、優先度順の具体的な行動を「なぜ今それか」「完了条件」「使うツール」付きで返す |
| `tailor_adm` | 規模・目的・期間から**自社版 ADM** を設計(使うフェーズ / 省くフェーズと理由 / 作る成果物) |
| `explain_for` | 同じ内容を経営層・業務・エンジニア・PMO 向けに言い換える指針とテンプレ |
| `whats_new_for_me` | 直近で動いたもの・**止まっているもの**を要約 |

### 知識・参照 / Knowledge

| ツール | 説明 |
| --- | --- |
| `list_adm_phases` / `get_adm_phase` | ADM フェーズの目的・入力・ステップ・成果物・実務のコツ |
| `list_techniques` / `get_technique` | ギャップ分析・ビジネスシナリオ等の技法 |
| `list_deliverables` / `get_deliverable` / `generate_deliverable_template` | 成果物の説明と Markdown 雛形(全 21 件) |
| `get_glossary_term` / `search_togaf` | 用語集と知識ベース横断検索(日英) |
| `list_frameworks` / `get_framework` / `recommend_frameworks` / `compare_with_togaf` | BIZBOK・Zachman・C4・Wardley・IT4IT・DDD 等との棲み分けと併用方法 |
| `capability_method` / `draft_capability_map` / `check_capability_map` / `value_stream_method` / `cross_map` | ビジネスアーキテクチャの**作り方**(能力マップ、バリューストリーム、クロスマッピング、アンチパターン検出) |

### ArchiMate 連携

| ツール | 説明 |
| --- | --- |
| `list_archimate_layers` / `list_archimate_elements` / `get_archimate_element` | 7 層と全要素。要素ごとに「何を表すか」「実務での使い方」「**混同されやすい要素との違い**」 |
| `list_archimate_relationships` | 関係の種類と、使いどころ・間違えやすい点 |
| `map_togaf_to_archimate` | ADM フェーズごとに「どの層のどの要素で描くか」 |
| `validate_archimate_relationship` | 関係の妥当性を意味論から判定し、不適切なら代替案を返す |
| `suggest_archimate_view` | 関心事から「何を描き、何を描かないか」を提案 |
| `export_archimate_csv` / `export_archimate_open_exchange` | **Archi に取り込める** CSV / Open Exchange XML を書き出す |

### セキュリティ EA(SABSA 参照)

| ツール | 説明 |
| --- | --- |
| `list_sabsa_layers` / `map_security_to_adm` | SABSA 6 層 × 6 問いと ADM の対応、フェーズごとに答えるべき問い |
| `threat_model_starter` | 脅威モデリングの出発点(信頼境界、資産 × 6 観点、問うべき質問) |
| `security_requirements_checklist` | 非機能要件として ID 管理すべきセキュリティ要件 |
| `review_security_posture` | 案件のセキュリティ観点の抜けを点検 |

### 図の生成 / Diagrams(Mermaid)

| ツール | 説明 |
| --- | --- |
| `diagram_adm_cycle` | 現在地を強調した ADM 循環図 |
| `diagram_capability_map` / `diagram_value_stream` | 能力マップ(ヒート付き)、バリューストリーム |
| `diagram_application_landscape` | アプリ連携図(連携が多すぎる場合は警告) |
| `diagram_roadmap_gantt` | ロードマップのガントチャート(移行状態はマイルストーン) |
| `diagram_stakeholder_matrix` / `diagram_risk_matrix` / `diagram_c4_context` | 4 象限、リスク行列、C4 コンテキスト図 |

### ドキュメント取り込み / Document intake

| ツール | 説明 |
| --- | --- |
| `read_document` | 手元の txt/md/csv/tsv/json/html/xml を正規化して読む(パス検証・サイズ上限付き) |
| `extract_from_document` | 報告書からリスク・ステークホルダー・システム・要件・アクションを**出典行番号付き**で抽出 |
| `ingest_document` | 抽出候補を案件に取り込む(既定はプレビューのみ。`apply=true` で反映) |
| `summarize_document_for_architecture` | アーキテクチャ観点での読み取り方と該当箇所 |

### 分析・レビュー / Analysis

| ツール | 説明 |
| --- | --- |
| `gap_analysis` | 現行 × 目標のマトリクスとギャップ一覧(**廃止側も必ず出す**) |
| `risk_matrix` / `stakeholder_matrix` | リスク行列、影響力 × 関心度の 4 象限と関与方針 |
| `assess_maturity` / `assess_readiness` | EA 成熟度・変革準備度の評価(案件に保存) |
| `generate_review_checklist` | 適合性レビュー用チェックリスト(1 ページに収まる分量) |
| `check_engagement_health` | 案件の危険信号を自動検出(スポンサー不在、期限超過、owner なし critical リスク等) |

### 案件・ロードマップ・出力 / Engagement

| ツール | 説明 |
| --- | --- |
| `start_engagement` / `get_engagement` / `update_engagement` | 案件の作成・参照・部分更新 |
| `list_engagements` / `create_engagement` / `switch_engagement` / `archive_engagement` / `delete_engagement` | 複数案件の管理 |
| `add_transition_state` / `add_work_package` / `get_roadmap` / `prioritize_work_packages` | 移行アーキテクチャと作業パッケージ(価値 × 規模で 4 象限に分類) |
| `get_dashboard` / `open_dashboard` | Markdown ダッシュボード / ブラウザのライブダッシュボード |
| `export_report` / `export_deliverable` / `list_exports` | 配布・印刷用のファイル書き出し |

### 任意: Claude API

| ツール | 説明 |
| --- | --- |
| `llm_status` | API キーの有無と設定方法(**キーの値は表示しない**) |
| `analyze_text_with_claude` | 大量文書の解析。キーが無い場合はエラーにせず、ホスト側 LLM 用のプロンプトを整形して返す |
| `estimate_tokens` | トークン数(API があれば正確に、無ければ概算と明示) |

### MCP prompts / resources

`phase_kickoff`, `architecture_review`, `exec_summary`, `stakeholder_briefing`, `risk_workshop`, `gap_workshop`, `deliverable_draft`, `weekly_status` の 8 プロンプトと、`togaf://phases`, `togaf://phase/{id}`, `togaf://technique/{id}`, `togaf://deliverable/{id}`, `togaf://glossary`, `togaf://engagement/current` などのリソースを公開します。

## 使い方の例 / Example Prompts

- 「何から始めればいい?」→ `start_here`
- 「レガシー基幹システムの刷新を任された。TOGAF 的に何から始めるべき?」→ `consult`
- 「今週やるべきことを教えて」→ `next_best_action`
- 「3 か月・小規模の案件なんだけど、ADM のどこを省いていい?」→ `tailor_adm`
- 「この情報セキュリティ報告書からリスクを拾って案件に登録して」→ `extract_from_document` → `ingest_document`
- 「能力マップを図にして」→ `diagram_capability_map`
- 「フェーズ B は ArchiMate だと何をどう描くの?」→ `map_togaf_to_archimate`
- 「この案件、セキュリティ観点で抜けはない?」→ `review_security_posture`
- 「BPMN と TOGAF はどう使い分ける?」→ `compare_with_togaf`
- 「Archi に取り込みたい」→ `export_archimate_csv`
- 「ダッシュボードをブラウザで開いて」→ `open_dashboard`(作業を進めると自動でライブ更新されます)

## 設定 / Configuration

| 環境変数 | 既定値 | 説明 |
| --- | --- | --- |
| `TOGAF_EAP_DATA_DIR` | `~/.togaf-eap` | エンゲージメント状態(`engagement.json`)の保存先ディレクトリ |
| `TOGAF_EAP_DASHBOARD_PORT` | `0`(空きポート自動割当) | `open_dashboard` が listen するポート |
| `ANTHROPIC_API_KEY` | (未設定) | **任意**。設定時のみ `analyze_text_with_claude` が Claude API を使う。未設定でもエラーにはならず、ホスト側 LLM 用のプロンプトを返す |
| `TOGAF_EAP_CLAUDE_MODEL` | `claude-opus-5` | **任意**。Claude API を使う場合のモデル |

保存レイアウトは次のとおりです。複数案件を並行して持てます。

```
~/.togaf-eap/
├── index.json              # 索引(選択中の ID + 一覧)
├── engagements/<id>.json   # 各案件の本体
├── reports/                # export_report の出力先
├── deliverables/           # export_deliverable の出力先
└── archimate/              # Archi 取り込み用ファイルの出力先
```

旧レイアウト(`~/.togaf-eap/engagement.json` に 1 件)のデータは初回アクセス時に自動移行します(旧ファイルは保険として残します)。書き込みは一時ファイル + rename の atomic 書き込みなので、ダッシュボードが書きかけの JSON を読むことはありません。

Engagements live in `~/.togaf-eap/` (override with `TOGAF_EAP_DATA_DIR`): an `index.json` plus one file per engagement under `engagements/`. A pre-existing single-file `engagement.json` is migrated automatically on first access and kept as a backup. Writes are atomic (temp file + rename), so the dashboard never reads a half-written file.

### ファイル読み書きの制約 / File access limits

`read_document` などのドキュメント取り込みは、**カレント作業ディレクトリ配下・データディレクトリ配下・ホーム配下**に限定され、隠しディレクトリ(`.` 始まり)は読みません(資格情報ファイルの誤読を避けるため)。書き出し系はデータディレクトリ配下かカレント配下のみで、既存ファイルは `overwrite=true` がなければ上書きしません。

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

TOGAF® および ArchiMate® は The Open Group の登録商標です。SABSA® は The SABSA Institute の登録商標です。BIZBOK® は Business Architecture Guild の登録商標です。本プロジェクトは非公式であり、これらの団体とは一切関係がありません。

収録している知識ベースは、**名称・レイヤ構成・マトリクスの軸といった事実情報**と、**完全に独自の要約・解説**のみで構成されています。いずれの規格・ガイドについても、原文の複製や逐語的な言い換えは含みません。

### なぜ原文を収録しないのか / Why no source text is included

TOGAF 標準は**オンラインでの閲覧は無料**で、**自組織のアーキテクチャ策定に自由に使える**一方、**複製・再配布は許諾なく認められていません**(TOGAF Standard 10th Edition, §1.3.1 Conditions of Use)。さらに原本の著作権表記は、書面の許諾なく本文を **LLM / 生成 AI の学習・開発、およびそれらのツールと関連してデータやコンテンツを生成する目的で利用・組み込むこと**を明示的に禁じています。

本プロジェクトは MCP サーバーとして AI から利用されるものであるため、この条項に抵触しないよう、著作権の及ばない**事実情報**(フェーズ名・成果物名などの構造)のみを用い、解説は**すべて独自に執筆**しています。

The TOGAF Standard is free to view online and free to use for developing your own organization's architecture, but it may not be reproduced or redistributed without permission, and its copyright notice explicitly prohibits incorporating the text into LLM/generative-AI systems or using it in connection with such tools to generate content. Since this project is consumed by an AI assistant, it therefore carries only non-copyrightable factual structure plus wholly original commentary.

TOGAF® and ArchiMate® are registered trademarks of The Open Group; SABSA® of The SABSA Institute; BIZBOK® of the Business Architecture Guild. This project is unofficial and not affiliated with any of them. The knowledge base carries only factual structure (names, layers, matrix axes) plus wholly original commentary — it reproduces no source text, verbatim or closely paraphrased.
