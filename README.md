<p align="center">
  <img src="./pic/web/cover.jpg" alt="TOGAF 10 EAP MCP — unofficial. 積まれた資料が、MCP を経由してロードマップ・4 象限・レイヤ図・関連図に変わる図 / A stack of existing documents passing through MCP and coming out as a roadmap, a four-quadrant matrix, a layer diagram and a relationship map" width="100%">
</p>

<h1 align="center">
  <img src="./pic/web/icon-256.png" alt="" height="26">
  TOGAF 10 EAP MCP
</h1>
<p align="center">
  <a href="./docs/GETTING-STARTED.md">はじめかた / Getting Started</a> ·
  <a href="./docs/EXAMPLES.md">実際の出力例 / Examples</a> ·
  <a href="./docs/ARCHITECTURE.md">アーキテクチャ / Architecture</a> ·
  <a href="#ツール一覧--tools">ツール一覧 / Tools</a>
</p>

<p align="center">
  <a href="https://github.com/Waganawa-Megumin/togaf10_EAP_MCP/actions/workflows/ci.yml"><img src="https://github.com/Waganawa-Megumin/togaf10_EAP_MCP/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-3c873a" alt="Node >= 18">
  <img src="https://img.shields.io/badge/MCP-stdio-6b5bd6" alt="MCP over stdio">
  <img src="https://img.shields.io/badge/TypeScript-ESM_strict-3178c6" alt="TypeScript, ESM, strict">
  <a href="./LICENSE.md"><img src="https://img.shields.io/badge/license-personal_use_only-8a5a44" alt="License: personal use only"></a>
  <a href="./LICENSE.md"><img src="https://img.shields.io/badge/AI_training-prohibited-a33b32" alt="AI training prohibited"></a>
</p>

TOGAF® Standard, 10th Edition(Enterprise Architecture Practitioner 体系)をベースにした、**アーキテクト支援・コンサルティング MCP サーバー**です(非公式)。

Claude Code / Claude Desktop などの MCP クライアントから、ADM フェーズの参照、状況に応じたコンサルティング、エンゲージメント(アーキテクチャ案件)の進捗管理、そして **Markdown / ブラウザ両対応のライブダッシュボード** を利用できます。

> **An unofficial, bilingual (JA/EN) MCP server** that acts as a TOGAF-based EA consultant: ADM phase reference, situation-driven consulting, engagement tracking, and a live-updating browser dashboard alongside copy/print-friendly Markdown.

---

## 📖 はじめての方へ / Start here

| これを読む | こんな人向け |
| --- | --- |
| 🍵 **[はじめかた / Getting Started](./docs/GETTING-STARTED.md)** | **TOGAF を知らない人。**入れ方(Claude に頼むだけの方法つき)と、最初に何と言えばいいかの例文集 |
| 📄 **[実際の出力例 / Examples](./docs/EXAMPLES.md)** | 「で、実際どんなものが返るの?」に答えるページ。**加工していない実出力**をそのまま貼ってあります |
| 🖥 **[Start 画面 / Start screen](./docs/START-SCREEN.md)** | **PDF や画像を渡すのが面倒な人。**ブラウザに投げて Claude に読ませる、任意の入口(使わなくても全機能が使えます) |
| 🏗 **[アーキテクチャ / Architecture](./docs/ARCHITECTURE.md)** | 中身が気になる人。全体像の図、各層の責務、設計判断とその理由 |
| 📋 [ツール一覧](#ツール一覧--tools) | 何ができるか具体的に知りたい人 |

**とりあえず動かしたい人は [はじめかた](./docs/GETTING-STARTED.md) だけ読めば十分です。** ツール名を覚える必要はありません。

> New here? Read **[Getting Started](./docs/GETTING-STARTED.md)** — it covers installation (including "just ask Claude to install it") and gives you phrases to copy-paste. You never need to memorize tool names.

---

## 1. 何ができるか / What it does

TOGAF の実務上の問題は「分厚い・抽象的・文書中心で、結局いま何をすればいいか分からない」ことです。このサーバーはそこを次の 4 点で解きます。

1. **視覚優先** — 文章の壁ではなく、図・表・マトリクスで返す(Mermaid 図を生成)
2. **次の一手が常に明確** — 「第 7 章を読め」ではなく「今週これをやれ」を返す
3. **実務ツールに接続** — ArchiMate / Archi、C4、BIZBOK、SABSA など現場が実際に使うものに繋ぐ
4. **手元の資料をそのまま入力に** — 情報セキュリティ報告書や指摘一覧を読み込んで、案件の素材に変換する

> The problem with TOGAF in practice is that it is long, abstract, and document-centric — you finish reading and still don't know what to do today. This server answers that with visual-first output, an always-explicit next action, connections to the tools practitioners actually use (ArchiMate/Archi, C4, BIZBOK, SABSA), and document intake so your existing reports become input instead of retyping.

<p align="center">
  <img src="./pic/web/infograph.jpg" alt="TOGAF 10 EAP MCP の 6 つの柱: ガイダンス(start_here / next_best_action)、知識(ADM 10 フェーズ・成果物 21・SABSA・C4)、図表(Mermaid・ArchiMate 書き出し)、セキュリティ(SABSA を ADM に対応付け)、取り込み(既存の報告書から出典付きで抽出)、ダッシュボード(ブラウザでライブ更新) / The six pillars of TOGAF 10 EAP MCP: guidance (start_here, next_best_action), knowledge (10 ADM phases, 21 deliverables, SABSA, C4), visuals (Mermaid diagrams, ArchiMate export), security (SABSA mapped onto the ADM), intake (extraction from your existing reports, with sources), and a live browser dashboard" width="100%">
</p>

### 主な機能 / Features

- 🧭 **迷ったら `start_here`** — 状況に応じて「次にやるべき 3 つ」を根拠付きで返す。`next_best_action` / `tailor_adm`(自社版 ADM の設計)
- 📚 **バイリンガル知識ベース** — ADM 全 10 フェーズ、技法 11、成果物 21(全件テンプレート付き)、用語 35、周辺フレームワーク 22、ArchiMate 全 7 層・要素 58・関係 11、SABSA 6 層。すべて日英併記の独自要約
- 🏭 **業界別の能力セット 7** — 銀行 / 保険 / 製造 / 医療 / 小売・EC / 公共 / 通信。事業の説明文から業界を推定し、業界固有の能力を汎用能力に混ぜた**レベル 1 能力マップの草案**を返す(`draft_capability_map`)
- 📊 **図を返す** — 能力マップ、バリューストリーム、アプリ連携図、ADM サイクル、ロードマップのガント、C4 コンテキスト図を Mermaid で生成([実物を見る](#図はそのまま貼れば絵になる--diagrams-paste-straight-into-github))
- 🔐 **セキュリティ EA** — SABSA の 6 層 × 6 問いを ADM に対応付け。脅威モデルの出発点、セキュリティ要件チェックリスト、案件のセキュリティ点検
- 📥 **既存ドキュメントの取り込み** — 報告書・台帳・指摘一覧(txt/md/csv/json/html)からリスク・ステークホルダー・要件・アクションを**出典行番号付き**で抽出し、案件に取り込む。ファイルパス(`path`)でも、**本文の貼り付け(`text`)でも**受け取る
- 🏗 **ArchiMate 連携** — ADM フェーズ ↔ ArchiMate 要素の対応、関係の妥当性判定、**Archi 取り込み用の CSV / Open Exchange XML 書き出し**。名前を解決できない関係が混じっていても書き出しは止まらず、**解決できた分を出力して落ちた関係を警告に列挙**する
- 📋 **複数案件の管理** — フェーズ進捗・リスク・決定・アクション・ステークホルダー・成果物・ロードマップ・評価を JSON で永続化。案件の切替に対応
- 🔎 **分析とレビュー** — ギャップ分析、リスク行列、ステークホルダー 4 象限、成熟度/変革準備度評価、適合性レビュー用チェックリスト、案件の健全性監査
- 📈 **デュアルダッシュボード** — 会話内で使える Markdown 版と、SSE でライブ更新されるブラウザ版(四半期ロードマップ図・ヒートマップ・印刷用 CSS・ダークモード)([画面を見る](#ダッシュボードはブラウザでライブ更新--live-browser-dashboard))
- 🧾 **知識の鮮度を明示** — 依拠している版と最終確認日を返し、正確な原文が要る場面は一次情報へ送る(`about_knowledge` / `check_official_source`)
- 🤖 **Claude API は任意** — このサーバーはすでに LLM の中で動くため通常は不要。大量文書用に `ANTHROPIC_API_KEY` がある場合だけ有効化される

> Highlights: a bilingual knowledge base (10 ADM phases, 11 techniques, 21 deliverables with templates, 35 glossary terms, 22 adjacent frameworks, the full ArchiMate layer/element/relationship set, SABSA); 7 industry capability sets (banking, insurance, manufacturing, healthcare, retail/e-commerce, public sector, telecom) behind `draft_capability_map`; Mermaid diagrams; security-EA lenses; document intake that takes a file path **or** pasted `text`; ArchiMate exports that emit what resolves and warn about what does not; multi-engagement persistence; and a dual Markdown/browser dashboard.

---

## 2. 実際に返ってくるもの / What it actually returns

以下はすべて**加工していない実出力**です(コマンドを添えてあるので手元で再現できます)。

> Everything below is unedited real output; the commands are included so you can reproduce it.

### 同じ相談でも、状況が違えば返るものが違う / Same topic, different answer

`consult` に**同じトピック**(基幹システムの刷新)を、**違う制約**で渡した 2 回の実出力から、各節の先頭項目だけを並べたものです。

```bash
node scripts/mcp-cli.mjs call consult '{"situation":"基幹システムの刷新をやりたい。予算は潤沢で経営も本気。18か月の期限がある","lang":"ja"}' --quiet
node scripts/mcp-cli.mjs call consult '{"situation":"基幹システムの刷新をやりたい。予算はゼロ、経営は無関心、担当は自分ひとり","lang":"ja"}' --quiet
```

| 観点 | 予算も支持もある | 予算も支持も無い |
| --- | --- | --- |
| 見立ての枕 | 金はあるが時間が無い | 金も人も無い |
| 推奨技法の 1 位 | 移行計画技法 | ビジネス変革準備度評価 |
| **「状況の条件に対して」の 1 位** | 並行できる作業(現状調査、データの棚卸し、移行方式の比較検証)に先に人を投入する。ただし決定そのものは外に出さない。… | 対象を 1 業務・1 データに固定し、そこだけを「現状 / あるべき / 差分」の 3 段で 1 枚にまとめる。全社を描こうとした時点で予算も時間も足りなくなる。 |
| **最初の確認質問** | この予算はいつまで有効で、使い切れなかった分は翌期に繰り越せますか? | 次に予算を検討する場はいつで、そこに載せるには何がいつまでに要りますか? |

**推奨技法の順位が入れ替わり、推奨アクションの筆頭と最初に聞く質問が別物になります。** キーワードに反応して同じ一般論を返すのではなく、制約を読んで結論を変えます(「やらない」と書けばその話題を外します)。

> Same topic, different constraints: the top-ranked technique changes, and so do the first action and the first question to ask.

### 図はそのまま貼れば絵になる / Diagrams paste straight into GitHub

図を返すツールは **Mermaid のコード**を返します。GitHub は ```` ```mermaid ```` フェンスをそのまま描画するので、返ってきたコードを README や Issue に貼るだけで図になります。下は `diagram_capability_map` の実出力を貼っただけの状態です。

```mermaid
flowchart LR
  subgraph c1["引合い・見積"]
    direction TB
    c2["引合い受付"]
    c3["概算見積作成"]
    c4["原価積算"]
  end
  subgraph c5["受注管理"]
    direction TB
    c6["受注登録"]
    c7["納期回答"]
  end
  subgraph c8["生産計画"]
    direction TB
    c9["負荷山積み"]
  end
  classDef heatLow fill:#d4efdf,stroke:#1e8449,color:#145a32;
  classDef heatMid fill:#fdebd0,stroke:#ca6f1e,color:#7e5109;
  classDef heatHigh fill:#fadbd8,stroke:#c0392b,color:#7b241c;
  class c6 heatLow;
  class c2,c9 heatMid;
  class c3,c4,c7 heatHigh;
  style c1 fill:#fadbd8,stroke:#c0392b,color:#7b241c;
  style c5 fill:#fdebd0,stroke:#ca6f1e,color:#7e5109;
  style c8 fill:#fdebd0,stroke:#ca6f1e,color:#7e5109;
```

凡例は 高(投資の焦点)/ 中(改善余地あり)/ 低(現状で足りている)。**赤が投資すべき能力**です。図で終わらず、「次はこの能力を支えるアプリケーションとデータを洗い出せ」まで一緒に返ります。

### ダッシュボードはブラウザでライブ更新 / Live browser dashboard

`open_dashboard` が `127.0.0.1` にローカル HTTP サーバーを立て、案件を更新するたびに **SSE で画面が更新されます**。表示言語は `lang` 引数(`ja` / `en` / `both`、既定は `both`)で切り替えられます。

下は**ダッシュボードの上半分**(ページ先頭からロードマップのタイムライン直下まで)です。ヘッダーの「ライブ更新中 / Live」表示、目次、進捗サマリ(ADM 55% = 4/10 完了、リスク 9・アクション 10 など)、概要 / スコープ、ADM 10 フェーズの進捗、四半期ロードマップが写っています。**中身はデモ用の架空案件**(架空の製造業の基幹刷新。企業名・人名はすべて架空)です。

<p align="center">
  <img src="./pic/screenshots/dashboard-overview.png" alt="ダッシュボード上半分: ライブ更新中の表示、目次、進捗サマリ、ADM 10 フェーズ進捗、四半期ロードマップ / Dashboard, top half" width="900">
</p>

四半期ロードマップの拡大(この 1 枚だけ `lang=ja` で撮影)。横棒が作業パッケージ、縦線が移行アーキテクチャで、**単独では事業が回らない移行状態(T2)は赤**で出ます。

<p align="center">
  <img src="./pic/screenshots/dashboard-roadmap.png" alt="四半期ロードマップ: 作業パッケージのバーと移行アーキテクチャの縦線、単独稼働できない T2 は赤 / Quarterly roadmap" width="900">
</p>

ダークモードにも追従します(`prefers-color-scheme` + 手動切替)。印刷用 CSS 付きで、外部 CDN は参照しません。

<p align="center">
  <img src="./pic/screenshots/dashboard-dark.png" alt="同じ範囲のダークモード表示 / The same view in dark mode" width="900">
</p>

<details>
<summary>もう 2 枚(リスクマトリクス / ステークホルダー 4 象限)</summary>

ページの下のほうにある 2 つのマトリクスです。上の 1 枚目には入りきらないため単独で切り出しています。

<p align="center">
  <img src="./pic/screenshots/dashboard-risk-matrix.png" alt="リスクマトリクス: レベル × 対応状況 / Risk matrix" width="900">
</p>

<p align="center">
  <img src="./pic/screenshots/dashboard-stakeholder-matrix.png" alt="ステークホルダー 4 象限: 影響力 × 関心度 / Stakeholder quadrants" width="900">
</p>

</details>

撮影条件と撮り直しの手順は [pic/screenshots/README.md](./pic/screenshots/README.md) にあります。すべて headless chromium で実際の `open_dashboard` と同じサーバーから撮ったもので、合成やモックは含みません。

**→ 続きは [実際の出力例 / Real Output Examples](./docs/EXAMPLES.md)。**`stakeholder_matrix` が**根拠の語まで示して利害の対立を検出する**ところ、`ingest_document` が**出典行番号付きで**報告書を案件の素材に変えるところ、Archi に取り込める XML の中身まで、実出力を貼ってあります。

---

## 3. まず試す / Try it

### インストール

```bash
git clone https://github.com/Waganawa-Megumin/togaf10_EAP_MCP.git
cd togaf10_EAP_MCP
npm install
npm run build
```

**Claude Code に登録:**

```bash
claude mcp add togaf-eap -- node /path/to/togaf10_EAP_MCP/dist/index.js
```

**Claude Desktop に登録** — `claude_desktop_config.json` に追加:

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

> 💡 コマンドを打ちたくない場合は、Claude Code に「`/path/to/togaf10_EAP_MCP` にある MCP サーバーを使えるようにして」と頼むだけでも入ります。詳しくは [はじめかた](./docs/GETTING-STARTED.md#2-入れる)。

### 最初に言ってみること

ツール名を覚える必要はありません。**普通の日本語で言えば Claude が道具を選びます。**

- `何から始めればいいか分からない。とりあえず案内して。`
- `基幹システムの刷新を任されたんだけど、何から手を付ければいい?`
- `この報告書からリスクを拾って、案件に登録して。`(ファイルを添付／パスを伝える)
- `関係者の利害を整理したい。営業と生産が対立してる。`
- `うち、過去に 2 回失敗してるんだけど、今度は大丈夫か見てほしい。`
- `経営会議で 1 枚で説明したい。`
- `ダッシュボードをブラウザで開いて。`

> These work the same way in English — say `Answer in English only from now on.` once and it sticks. English openers to copy:
> `I don't know where to start — walk me through it.` /
> `I've been handed a core-system replacement. There is no budget, the executives are indifferent, and I am the only person on it. Where do I start?` /
> `Pull the risks out of this report and record them on the engagement.` /
> `Sort out the stakeholders — sales and production are pulling against each other.` /
> `Open the dashboard in my browser.`
> The more constraints you state — an amount, a date, a headcount — the more the answer changes.

**→ 例文はもっとあります: [はじめかた / 最初の一言](./docs/GETTING-STARTED.md#3-最初の一言)**

**→ 実際に返ってきた出力をそのまま貼ったページがあります: [実際の出力例 / Real Output Examples](./docs/EXAMPLES.md)**

---

## 4. 詳しく / Reference

### ツール一覧 / Tools

**ツール 87 件 + MCP prompts 8 + resources 8。** 下の表で全 87 件を網羅しています(`node scripts/mcp-cli.mjs tools` で実物を確認できます)。

> **87 tools, 8 MCP prompts, 8 resources.** The catalog below is complete, but its descriptions are in Japanese only. Every tool description shipped by the server itself is bilingual, so `node scripts/mcp-cli.mjs tools --quiet` prints the same 87 tools with an English description for each — that listing is the English reader's reference, and it is also what your MCP client shows you.

> **引数の綴りは厳密です。** 全ツールの入力スキーマは `.strict()`(JSON Schema の `additionalProperties: false`)で、**未知のキーは黙って無視されずエラーになります**。`{"phaseId": "B"}` のように綴りが違えば `Unrecognized key(s) in object: 'phaseId'` が返るので、間違ったまま「効いていない」状態に気付かないことはありません。引数名に迷ったら `node scripts/mcp-cli.mjs schema <tool>` で確認してください。
>
> Every tool's input schema is `.strict()` (`additionalProperties: false`), so a misspelled argument is rejected with `Unrecognized key(s) in object: …` instead of being silently ignored.

#### 入口 / Start here

| ツール | 説明 |
| --- | --- |
| `start_here` | 迷ったらここから。状況に応じて最初の一歩、または「今週やるべき 3 つ」を返す |
| `consult` | 状況を自由記述で渡すと、見立て・着目すべきフェーズ・推奨技法・作る成果物・関係者への確認質問を返す(反応したキーワードも開示) |
| `next_best_action` | 案件の状態を分析し、優先度順の具体的な行動を「なぜ今それか」「完了条件」「使うツール」付きで返す |
| `tailor_adm` | 規模・目的・期間から**自社版 ADM** を設計(使うフェーズ / 省くフェーズと理由 / 作る成果物) |
| `explain_for` | 同じ内容を経営層・業務・エンジニア・PMO 向けに言い換える指針とテンプレ |
| `whats_new_for_me` | 直近で動いたもの・**止まっているもの**を要約 |

#### 知識・参照 / Knowledge

| ツール | 説明 |
| --- | --- |
| `list_adm_phases` / `get_adm_phase` | ADM フェーズの目的・入力・ステップ・成果物・実務のコツ |
| `list_techniques` / `get_technique` | ギャップ分析・ビジネスシナリオ等の技法 |
| `list_deliverables` / `get_deliverable` / `generate_deliverable_template` | 成果物の説明と Markdown 雛形(全 21 件) |
| `get_glossary_term` / `search_togaf` | 用語集と知識ベース横断検索(日英) |
| `list_frameworks` / `get_framework` / `recommend_frameworks` / `compare_with_togaf` | BIZBOK・Zachman・C4・Wardley・IT4IT・DDD 等との棲み分けと併用方法 |
| `capability_method` / `check_capability_map` / `value_stream_method` / `cross_map` / `business_architecture_antipatterns` | ビジネスアーキテクチャの**作り方**(能力マップの手順、バリューストリーム、クロスマッピング、アンチパターン検出) |
| `draft_capability_map` | 事業の説明(`businessDescription`)からレベル 1 能力マップの草案を Mermaid で返す。**業界別の能力セット 7 件**(`banking` / `insurance` / `manufacturing` / `healthcare` / `retail-ecommerce` / `public-sector` / `telecommunications`)に対応し、`industry` を省略すると説明文から業界を推定して業界固有の能力を混ぜる(「金融」「地方銀行」のような日本語表記でも指定可) |
| `about_knowledge` / `check_official_source` | この知識ベースの**版と最終確認日**、持っている範囲と持っていない範囲、一次情報の当たり先 |

#### ArchiMate 連携

| ツール | 説明 |
| --- | --- |
| `list_archimate_layers` / `list_archimate_elements` / `get_archimate_element` | 7 層と全要素。要素ごとに「何を表すか」「実務での使い方」「**混同されやすい要素との違い**」 |
| `list_archimate_relationships` / `list_archimate_types` | 関係の種類と、使いどころ・間違えやすい点 |
| `map_togaf_to_archimate` | ADM フェーズごとに「どの層のどの要素で描くか」 |
| `validate_archimate_relationship` | 関係の妥当性を意味論から判定し、不適切なら代替案を返す |
| `suggest_archimate_view` | 関心事から「何を描き、何を描かないか」を提案 |
| `archimate_vs_togaf` | 手法(TOGAF)と記述言語(ArchiMate)の役割分担と、最小限の組み合わせ |
| `export_archimate_csv` / `export_archimate_open_exchange` | **Archi に取り込める** CSV / Open Exchange XML を書き出す。`relations` の `source` / `target` は要素名で指定する。**名前が解決できない関係やタイプ不明の関係があっても全体エラーにはならず**、解決できた分をファイルに出力したうえで、落ちた関係を理由付きで警告に列挙する |

#### セキュリティ EA(SABSA 参照)

| ツール | 説明 |
| --- | --- |
| `list_sabsa_layers` / `map_security_to_adm` | SABSA 6 層 × 6 問いと ADM の対応、フェーズごとに答えるべき問い |
| `threat_model_starter` | 脅威モデリングの出発点(信頼境界、資産 × 6 観点、問うべき質問) |
| `security_requirements_checklist` | 非機能要件として ID 管理すべきセキュリティ要件 |
| `review_security_posture` | 案件のセキュリティ観点の抜けを点検 |

#### 図の生成 / Diagrams(Mermaid)

| ツール | 説明 |
| --- | --- |
| `diagram_adm_cycle` | 現在地を強調した ADM 循環図 |
| `diagram_capability_map` / `diagram_value_stream` | 能力マップ(ヒート付き)、バリューストリーム |
| `diagram_application_landscape` | アプリ連携図(連携が多すぎる場合は警告) |
| `diagram_roadmap_gantt` | ロードマップのガントチャート(移行状態はマイルストーン) |
| `diagram_stakeholder_matrix` / `diagram_risk_matrix` / `diagram_c4_context` | 4 象限、リスク行列、C4 コンテキスト図 |

#### ドキュメント取り込み / Document intake

| ツール | 説明 |
| --- | --- |
| `read_document` | 手元の txt/md/csv/tsv/json/html/xml を正規化して読む(`path` のみ。パス検証・サイズ上限付き) |
| `extract_from_document` | 報告書からリスク・ステークホルダー・システム・要件・アクションを**出典行番号付き**で抽出 |
| `ingest_document` | 抽出候補を案件に取り込む(既定はプレビューのみ。`apply=true` で反映) |
| `summarize_document_for_architecture` | アーキテクチャ観点での読み取り方と該当箇所 |

`extract_from_document` / `ingest_document` / `summarize_document_for_architecture` は **`path`(ファイルパス)と `text`(本文の貼り付け)のどちらでも**受け取ります。`source` に元ファイル名を添えると出典表示に使われます。

**PDF / Word / Excel は `path` で渡さず、Claude Code に読ませて本文を `text` で渡すのが本筋です。**サーバー側にパーサを持たせるとバイナリ形式の数だけ依存が増え、レイアウト崩れの責任も抱え込むことになります。ホスト(Claude Code)はすでにこれらを読めるので、読解はホストに任せ、サーバーは**抽出と案件への反映**に専念します。`text` で渡した場合、出典の行番号は「渡された本文内の行」であり元ファイルのページ・行とは一致しないことがあるので、その旨は出力にも明記されます。

> Pass `path` for plain-text formats. For PDF/Word/Excel, let Claude Code read the file and hand the body to these tools as `text` — the server deliberately ships no binary parsers. Line numbers then refer to the pasted body, which the output states explicitly.

#### 分析・レビュー / Analysis

| ツール | 説明 |
| --- | --- |
| `gap_analysis` | 現行 × 目標のマトリクスとギャップ一覧(**廃止側も必ず出す**) |
| `risk_matrix` / `stakeholder_matrix` | リスク行列、影響力 × 関心度の 4 象限と関与方針 |
| `assess_maturity` / `assess_readiness` | EA 成熟度・変革準備度の評価(案件に保存) |
| `generate_review_checklist` | 適合性レビュー用チェックリスト(1 ページに収まる分量) |
| `check_engagement_health` | 案件の危険信号を自動検出(スポンサー不在、期限超過、owner なし critical リスク等) |

#### 案件・ロードマップ・出力 / Engagement

| ツール | 説明 |
| --- | --- |
| `start_engagement` / `get_engagement` / `update_engagement` | 案件の作成・参照・部分更新 |
| `list_engagements` / `create_engagement` / `switch_engagement` / `archive_engagement` / `delete_engagement` | 複数案件の管理 |
| `review_all_engagements` | 全案件を 1 つの表に並べ、**危ない順**に「止まっている / 要注意 / 動いている」を判定(止まっている案件は件名まで出す) |
| `add_transition_state` / `add_work_package` / `get_roadmap` / `prioritize_work_packages` / `remove_roadmap_item` | 移行アーキテクチャと作業パッケージ(価値 × 規模で 4 象限に分類) |
| `get_dashboard` / `open_dashboard` | Markdown ダッシュボード / ブラウザのライブダッシュボード(`TOGAF_EAP_NO_BROWSER` を設定するとブラウザを起動せず URL だけ返す) |
| `export_report` / `export_deliverable` / `list_exports` | 配布・印刷用のファイル書き出し |
| `open_start` / `check_intake` / `mark_intake_done` | **[Start 画面](./docs/START-SCREEN.md)** — 相談と資料(PDF・画像・Office・テキスト)をブラウザから預け、Claude が受け取る。画面は預かるだけで、読むのは Claude 側 |

#### 任意: Claude API

| ツール | 説明 |
| --- | --- |
| `llm_status` | API キーの有無と設定方法(**キーの値は表示しない**) |
| `analyze_text_with_claude` | 大量文書の解析。キーが無い場合はエラーにせず、ホスト側 LLM 用のプロンプトを整形して返す |
| `estimate_tokens` | トークン数(API があれば正確に、無ければ概算と明示) |

#### MCP prompts / resources

`phase_kickoff`, `architecture_review`, `exec_summary`, `stakeholder_briefing`, `risk_workshop`, `gap_workshop`, `deliverable_draft`, `weekly_status` の 8 プロンプトと、`togaf://phases`, `togaf://phase/{id}`, `togaf://technique/{id}`, `togaf://deliverable/{id}`, `togaf://glossary`, `togaf://engagement/current` などのリソースを公開します。

### 設定 / Configuration

| 環境変数 / Variable | 既定値 / Default | 説明 / What it does |
| --- | --- | --- |
| `TOGAF_EAP_DATA_DIR` | `~/.togaf-eap` | エンゲージメント状態の保存先ディレクトリ<br>*Directory the engagement state is written to* |
| `TOGAF_EAP_DASHBOARD_PORT` | `0`(空きポート自動割当) | `open_dashboard` が listen するポート<br>*Port `open_dashboard` listens on; `0` picks a free one* |
| `TOGAF_EAP_NO_BROWSER` | (未設定) | 値を入れる(`0` / `false` / 空文字は無効)と `open_dashboard` がブラウザを自動起動せず、URL だけ返す。CI・ヘッドレス環境向け<br>*Set to any value other than `0`, `false` or an empty string and `open_dashboard` returns the URL without launching a browser — for CI and headless machines* |
| `ANTHROPIC_API_KEY` | (未設定) | **任意**。設定時のみ `analyze_text_with_claude` が Claude API を使う。未設定でもエラーにはならず、ホスト側 LLM 用のプロンプトを返す<br>*Optional. Only when it is set does `analyze_text_with_claude` call the Claude API; unset is not an error — you get a prompt to run on the host LLM instead* |
| `TOGAF_EAP_CLAUDE_MODEL` | `claude-opus-5` | **任意**。Claude API を使う場合のモデル<br>*Optional. The model used when the Claude API path is active* |

保存レイアウトは次のとおりです。複数案件を並行して持てます。

```
~/.togaf-eap/
├── index.json              # 索引(選択中の ID + 一覧)
├── engagements/<id>.json   # 各案件の本体
├── reports/                # export_report の出力先
├── deliverables/           # export_deliverable の出力先
└── archimate/              # Archi 取り込み用ファイルの出力先
```

旧レイアウト(`~/.togaf-eap/engagement.json` に 1 件)のデータは初回アクセス時に自動移行します(旧ファイルは保険として残します)。書き込みは一時ファイル + rename の atomic 書き込みなので、ダッシュボードが書きかけの JSON を読むことはありません。詳しくは [アーキテクチャ / 状態の持ち方](./docs/ARCHITECTURE.md#5-状態の持ち方)。

Engagements live in `~/.togaf-eap/` (override with `TOGAF_EAP_DATA_DIR`): an `index.json` plus one file per engagement under `engagements/`. A pre-existing single-file `engagement.json` is migrated automatically on first access and kept as a backup. Writes are atomic (temp file + rename), so the dashboard never reads a half-written file.

#### ファイル読み書きの制約 / File access limits

`read_document` などのドキュメント取り込みは、**カレント作業ディレクトリ配下・データディレクトリ配下・ホーム配下**に限定され、隠しディレクトリ(`.` 始まり)は読みません(資格情報ファイルの誤読を避けるため)。書き出し系はデータディレクトリ配下かカレント配下のみで、既存ファイルは `overwrite=true` がなければ上書きしません。

PDF / Word / Excel など、テキストでない形式は**クライアント側(Claude Code)に読ませて本文を渡します**。`extract_from_document` / `ingest_document` / `summarize_document_for_architecture` は `path` の代わりに `text` を受け取れます(`read_document` は `path` のみ)。理由は [アーキテクチャ / ホストにできることはホストにやらせる](./docs/ARCHITECTURE.md#31-ホストにできることはホストにやらせる) を参照。

#### ダッシュボードのエンドポイント / Dashboard endpoints

`open_dashboard` は `127.0.0.1` のみに bind します(外部公開しません)。
*`open_dashboard` binds to `127.0.0.1` only and is never exposed off the machine.*

| パス / Path | 内容 / Serves |
| --- | --- |
| `/` | ダッシュボード HTML(自己完結・外部 CDN 参照なし・印刷用 CSS 付き)<br>*The dashboard HTML — self-contained, no external CDN, print CSS included* |
| `/api/state` | 現在のエンゲージメント JSON<br>*The current engagement as JSON* |
| `/events` | SSE。状態ファイルの変更を push<br>*Server-sent events; pushes every change to the state file* |
| `/health` | 死活確認<br>*Liveness check* |

### 開発 / Development

```bash
npm run build   # TypeScript ビルド
npm test        # vitest ユニットテスト(件数は実行結果に出ます)
npm run smoke   # stdio JSON-RPC スモークテスト(103 チェック)
```

GitHub Actions([`.github/workflows/ci.yml`](./.github/workflows/ci.yml))が push / PR ごとに **Node 20 と 22** で ビルド → `npx tsc --noEmit` → vitest → スモークテストを回します(`engines` は `>=18`)。シークレットは使いません。

> CI runs build → type check → unit tests → stdio smoke test on Node 20 and 22, with no secrets.

手でツールを叩いて出力を確認するには、同梱の CLI を使います。

```bash
node scripts/mcp-cli.mjs tools --quiet                    # ツール一覧
node scripts/mcp-cli.mjs schema <tool>                    # 入力スキーマ
node scripts/mcp-cli.mjs call <tool> '<JSON>' --data-dir /tmp/scratch --quiet
```

設計判断・層の責務・拡張のしかたは [アーキテクチャ](./docs/ARCHITECTURE.md) にまとめてあります。

---

## 5. 報告・変更履歴・セキュリティ / Reporting, changelog, security

| 用件 | 行き先 |
| --- | --- |
| 動かない・出力がおかしい | [バグ報告](https://github.com/Waganawa-Megumin/togaf10_EAP_MCP/issues/new?template=bug_report.yml) |
| 使い方が分からない | [使い方の質問](https://github.com/Waganawa-Megumin/togaf10_EAP_MCP/issues/new?template=question.yml) |
| 何が変わったか知りたい | [変更履歴 / Changelog](./CHANGELOG.md) |
| 何がディスクに残るのか・脆弱性の報告 | [セキュリティ / Security](./SECURITY.md) |

Issue に**ツールの出力を貼るときは、案件名・社名・実在の関係者名を伏せてください**(テンプレート側にも確認欄があります)。このサーバーは案件情報を暗号化せずに `~/.togaf-eap/` へ JSON で保存し(`TOGAF_EAP_DATA_DIR` で変更可)、**既定ではネットワークに一切出ません**(`ANTHROPIC_API_KEY` を設定したときだけ Claude API を使います)。詳細は [SECURITY.md](./SECURITY.md)。

> Bug reports and usage questions go through the issue templates; please mask engagement, company, and stakeholder names before pasting tool output. Engagement state is stored unencrypted as JSON under `~/.togaf-eap/`, and the server makes no network calls unless `ANTHROPIC_API_KEY` is set.

---

## ライセンス / License

**個人利用のみ・AI 学習禁止** のカスタムライセンスです。詳細は [LICENSE.md](./LICENSE.md) を参照してください。

Personal use only; AI/ML training on this repository is prohibited. See [LICENSE.md](./LICENSE.md).

## 商標に関する注記 / Trademark Notice

TOGAF® および ArchiMate® は The Open Group の登録商標です。SABSA® は The SABSA Institute の登録商標です。BIZBOK® は Business Architecture Guild の登録商標です。本プロジェクトは非公式であり、これらの団体とは一切関係がありません。

収録している知識ベースは、**名称・レイヤ構成・マトリクスの軸といった事実情報**と、**完全に独自の要約・解説**のみで構成されています。いずれの規格・ガイドについても、原文の複製や逐語的な言い換えは含みません。

### なぜ原文を収録しないのか / Why no source text is included

TOGAF 標準は**オンラインでの閲覧は無料**で、**自組織のアーキテクチャ策定に自由に使える**一方、**複製・再配布は許諾なく認められていません**(TOGAF Standard 10th Edition, §1.3.1 Conditions of Use)。さらに原本の著作権表記は、書面の許諾なく本文を **LLM / 生成 AI の学習・開発、およびそれらのツールと関連してデータやコンテンツを生成する目的で利用・組み込むこと**を明示的に禁じています。

本プロジェクトは MCP サーバーとして AI から利用されるものであるため、この条項に抵触しないよう、著作権の及ばない**事実情報**(フェーズ名・成果物名などの構造)のみを用い、解説は**すべて独自に執筆**しています。正確な原文が必要な場面では `about_knowledge` / `check_official_source` が一次情報の当たり先を返します。

The TOGAF Standard is free to view online and free to use for developing your own organization's architecture, but it may not be reproduced or redistributed without permission, and its copyright notice explicitly prohibits incorporating the text into LLM/generative-AI systems or using it in connection with such tools to generate content. Since this project is consumed by an AI assistant, it carries only non-copyrightable factual structure plus wholly original commentary.

TOGAF® and ArchiMate® are registered trademarks of The Open Group; SABSA® of The SABSA Institute; BIZBOK® of the Business Architecture Guild. This project is unofficial and not affiliated with any of them. The knowledge base carries only factual structure (names, layers, matrix axes) plus wholly original commentary — it reproduces no source text, verbatim or closely paraphrased.

---

<sub>☕ このツールでステークホルダー表を作る午後が浮いたなら、[Ko-fi](https://ko-fi.com/shonanboyeah) で開発を応援できます(もちろん任意です)。<br>
If this saved you an afternoon of stakeholder spreadsheets, you can support development on [Ko-fi](https://ko-fi.com/shonanboyeah) — entirely optional.</sub>
