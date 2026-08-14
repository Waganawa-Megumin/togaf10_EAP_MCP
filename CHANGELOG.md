# 変更履歴 / Changelog

このファイルの書式は [Keep a Changelog 1.1.0](https://keepachangelog.com/ja/1.1.0/) に従い、
バージョン番号は [Semantic Versioning](https://semver.org/lang/ja/) に従います。
各項目は日本語 → 英語の順で併記します。

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the
versioning follows [Semantic Versioning](https://semver.org/). Every entry is written in
Japanese first, then English.

各バージョンの末尾に、そのバージョンで通した検証（`npm test` / `npm run smoke`）の件数を記録します。
Each version records the verification counts (`npm test` / `npm run smoke`) that passed for it.

---

## [Unreleased]

`0.2.0` の後に入った変更で、まだバージョン番号を付けていないものです。
`package.json` の `version` は `0.2.0` のままです。

Changes landed after `0.2.0` that have not been given a version number yet.
`package.json` still declares `version` `0.2.0`.

このまとまりの主題は「**出力が、利用者の書いた内容に実際に依存すること**」と
「**失敗を黙って飲み込まないこと**」です。レッドチーム的な通し確認で、
もっともらしく見えるのに入力を反映していない出力が複数のツールで見つかったため、そこを潰しました。

The theme here is that **output must actually depend on what the user wrote**, and that
**failures must not be swallowed silently**. A red-team pass found the same defect shape across
several tools: output that looked authoritative but did not vary with the input.

### 追加 / Added

- **業界別の能力セット 7 業界** — 銀行・保険・製造・医療・小売/EC・公共・通信。
  `draft_capability_map` が `industry` 指定（または説明文からの推定）に応じて、その業界の実務で通る
  能力名を汎用セットに足します。説明が特徴に乏しいときは推測せず、推定した旨を明示します。
  *Industry capability sets for seven industries (banking, insurance, manufacturing, healthcare,
  retail/e-commerce, public sector, telecom), applied by `draft_capability_map`; it refuses to guess
  when the description is not distinctive and states when a set was inferred.*
- **関係者間の対立検出** — `stakeholder_matrix` が、登録された関心事から対立しうる立場の組を、
  その根拠となった関心事つきで提示します。語の照合による**候補**であり確定ではない旨と、
  「検出ゼロ＝対立が無い証明ではない」旨を出力に明記します。
  *`stakeholder_matrix` detects opposing stakeholders from their recorded concerns and shows the
  concerns that evidence each pair, labelled as candidates rather than findings.*
- **知識の出所を返すツール 2 件** — `about_knowledge`（依拠している版・最終確認日・持っていない範囲）と
  `check_official_source`（話題ごとの一次情報 URL）。ツール数は 81 → **84** になりました。
  *Two tools that report where the knowledge came from: `about_knowledge` and
  `check_official_source`. Tool count 81 → **84**.*
- **`docs/GETTING-STARTED.md`** — 導入から最初の実用的な答えまでを通しで説明します（インストールを
  Claude に頼む手順を含む）。覚えるべきツール名ではなく、そのまま貼れる言い回しを載せています。
  *A zero-to-first-answer guide, including asking Claude to install the server; it gives phrases to
  copy rather than tool names to memorize.*
- **`docs/ARCHITECTURE.md`** — サーバーの構成と、そう作った理由の短い案内（依存 2 つ、
  ダッシュボードは `node:http` + SSE、JSON 永続化、原文転載ではなく独自解説）。
  *A short tour of how the server is built and why.*
- **`scripts/mcp-cli.mjs`** — stdio 経由でツール一覧・スキーマ・単発呼び出し・prompts・resources を
  確認する開発用 CLI。`npm run build` 済みの `dist/` に対して動きます。
  *A development CLI to list tools, inspect schemas, and make single calls over stdio.*
- **`pic/`** — アイコン・カバー・インフォグラフィック。README を軽く保つため `pic/web/` に縮小版を
  置いています。インフォグラフィックの統計帯は、ツール数が増減するたび古くなるため切り落としました
  （件数は README とツール一覧が持ちます）。
  *Project artwork with size-reduced derivatives under `pic/web/`; the infographic's statistics band
  was cropped because the tool count moves.*
- **コンサルルールを 1 件追加** — 24 → **25**。
  *One more consulting rule: 24 → **25**.*

### 変更 / Changed

- **`consult` が状況を読むようになりました** — キーワード一致だけで助言を組み立てるのをやめ、
  次を読み取ります。
  - **打ち消し** — 「基幹システムの刷新はやらないことに決まった」のように「やらない」と書かれた話題を
    見立てから外し、外した事実を明示する
  - **ヘッジ** — 「予算が無いわけではない」のような二重否定を、単純な否定と取り違えない
  - **条件** — 予算・期限・経営の関与・体制の規模などを読み、助言の中身を条件に合わせて変える
  - **業界** — `industry` を見出しに反射するだけでなく、業界別能力セットに接続する

  結果として、**正反対の状況に対して同一の出力が返ることがなくなりました。**
  *`consult` now reads negation, hedged phrasing, situational conditions (budget, deadline,
  executive intent, team size) and industry, so two opposite situations no longer produce
  byte-identical advice.*
- **未知の入力キーを中央で拒否** — 入力スキーマを一括で strict にしました。以前は SDK 既定で
  未知のキーが**黙って捨てられ**、`relations` を `relationships` と打ち間違えると「0 件」の空の結果が
  返るだけでした。現在は綴り違いがその場でエラーになります。
  *Unknown input keys are now rejected centrally instead of dropped, so a misspelled argument reports
  itself rather than returning an empty result.*
- **入力長の上限** — 上限を超えた文字列は**保存前に**拒否し、何も書き込まずに「上限・実測値・
  逃がし先のフィールド」を返します。黙って切り詰めません（切り詰めると、書いた内容が失われたことに
  利用者が気付けません）。
  *Oversized input is refused before it reaches storage, with the limit, the actual length, and where
  to put the overflow — never silently truncated.*
- **出力量の自動絞り込み** — 件数の多い案件でも 1 回の応答を無制限に伸ばしません。切ったときは
  「何件中の何件を出したか」と全部を見る方法を必ず添えます。**ファイル書き出しは従来どおり完全**です。
  *Long output is capped with the truncation stated and a way to see everything; file exports stay
  complete.*
- **`tailor_adm` の根拠が、選んだ扱いから導出されるようになりました** — 「軽くする」と判断した
  フェーズに「重点を置く理由」が付く、切ったフェーズに作業が割り当てられる、といった食い違いを解消。
  *`tailor_adm` derives its rationale from the treatment it chose, so a phase marked light is no
  longer explained as one to emphasise, and work is not handed to a phase that was cut.*
- **ArchiMate 書き出しの部分成功** — 解決できた要素・関係は書き出したうえで、書き出せなかったものを
  理由つきで列挙します（以前は全体が失敗）。関係の妥当性判定は、向きの逆を受け付けなくなりました。
  *The ArchiMate exporter emits what resolves and lists what did not, instead of failing whole;
  relationship validation no longer accepts both directions.*
- **ダッシュボードの favicon** をレタリングからプロジェクトマークに変更。
  *The dashboard favicon now carries the project mark rather than lettering.*
- **README** を更新（図版の掲載、導入手順、ツール一覧の刷新）。
  *README updated.*

### 修正 / Fixed

- **`gap_analysis`** — 現行と目標の両方に存在する要素を「廃止 (Eliminated)」に分類していたのを
  「維持 (Retained)」に修正。1 要素 = 1 分類で数えるため、同じ要素が維持と廃止に二重に現れません。
  *Elements present in both baseline and target are classified as retained, not eliminated.*
- **`stakeholder_matrix`** — 利用者が自分で書いたエンゲージメント方針を上書きしていた問題を修正。
  *No longer overwrites the engagement approach the user wrote.*
- **分類器の二重実装** — マトリクス系ツールと図生成ツールが別々の分類を持ち、同じ案件に対して
  食い違う象限を返すことがありました。分類器を 1 つに統合しました。
  *The matrix tool and the diagram tool now share one classifier so they cannot disagree.*

### 検証 / Verification

- `npm test` — vitest **168 件**（従来 76 件）
- `npm run smoke` — stdio JSON-RPC **103 チェック**（従来 90 チェック）

---

## [0.2.0] - 2026-08-14

テーマは「分厚くて抽象的な TOGAF を、視覚と次の一手で使えるようにする」。
ツールは 35 → **81** になりました。

The theme of this release: make a thick, abstract standard usable through pictures and a clear next
action. Tools went from 35 to **81**.

### 追加 / Added

- **導き手 (`src/tools/guide.ts`)** — `start_here` / `next_best_action` / `tailor_adm` /
  `explain_for` / `whats_new_for_me`。「第 7 章を読め」ではなく「今週これをやれ」を返します。
  *Guided entry points that answer with this week's action rather than a chapter reference.*
- **Mermaid 図 8 種 (`src/tools/diagrams.ts`)** — ADM サイクル / 能力マップ / バリューストリーム /
  アプリケーション連携 / ロードマップ Gantt / ステークホルダー 4 象限 / リスク行列 / C4。
  *Eight Mermaid diagram generators.*
- **ArchiMate** — 7 層・58 要素・11 関係、ADM フェーズとの対応、関係の妥当性判定、
  Archi 取り込み用の CSV と Open Exchange XML の書き出し。
  *ArchiMate layers, elements and relationships, their ADM mapping, relationship checks, and export
  to Archi via CSV and Open Exchange XML.*
- **セキュリティ EA (SABSA)** — 6 層 × 6 問いを ADM に対応付け、脅威モデルの出発点、
  セキュリティ要件チェックリスト、案件のセキュリティ点検。
  *SABSA's six layers by six questions mapped onto the ADM, plus threat-model starting points and
  security checklists.*
- **手元ドキュメントの取り込み (`src/tools/documents.ts`)** — 報告書・台帳・議事録から、
  リスク / ステークホルダー / システム / 要件 / アクションの候補を**出典行番号つき**で抽出し、案件に
  取り込みます。読み取りは許可ディレクトリ配下のみ、隠しディレクトリは読みません。
  *Extract candidates from local documents with source line numbers and ingest them into an
  engagement; reads are restricted to allowed roots and skip hidden directories.*
- **周辺フレームワーク 22 件とビジネスアーキテクチャ** — 棲み分けの説明と、能力マップ /
  バリューストリームの作り方。
  *22 neighbouring frameworks, how they divide up the territory, and how to build capability maps and
  value streams.*
- **任意の Claude API 連携 (`src/llm/claude.ts`)** — 依存を増やさないため `fetch` の直叩き。
  キー未設定でもエラーにせず、ホスト側 LLM にそのまま貼れるプロンプトを返します。
  *Optional Claude API access, hand-rolled on `fetch` to keep the dependency list at two; without a
  key it returns a ready-to-paste prompt instead of failing.*

### 修正 / Fixed

レビューで実機再現した欠陥のうち主なもの:

- `read_document` が、ホーム配下の**隠しディレクトリにある資格情報**を出力できてしまっていた。
  *`read_document` could dump credentials from hidden directories under the home directory.*
- ArchiMate の realization の**向きが逆**で、Archi に取り込めないモデルを書き出していた。
  *The direction of ArchiMate realization was reversed, producing models Archi could not import.*
- API キー未設定時のフォールバックで、**文書本文がコードフェンスを脱出**できた。
  *In the no-key fallback, document text could escape the code fence.*
- `claude-haiku-4-5` は `effort` 非対応で、指定すると全リクエストが 400 になっていた。
  *`claude-haiku-4-5` does not support `effort`; requesting it made every call fail with 400.*

### 検証 / Verification

- `npm test` — vitest **76 件**
- `npm run smoke` — stdio JSON-RPC **90 チェック**

---

## [0.1.0] - 2026-08-14

最初の実装。日英バイリンガルの知識ベース、コンサルティング、エンゲージメント管理、
デュアルダッシュボードを備えた MCP サーバー。ツールは 15 → 35 に増え、
MCP prompts 8 件と resources 8 件を追加しました。

The first implementation: a bilingual (JA/EN) knowledge base, consulting, engagement tracking and a
dual dashboard. Tools grew from 15 to 35, with 8 MCP prompts and 8 resources.

### 追加 / Added

- **知識ベース** — ADM 10 フェーズ、技法 11、成果物 21（全件テンプレートつき）、用語 35、
  コンサルルール 24、ビューポイント 16、業界別ガイダンス 10。すべて `{ ja, en }` 併記の**独自要約**で、
  TOGAF 原文の転載は含みません。横断検索は ASCII を単語境界、日本語を部分一致で照合します。
  *The knowledge base, written entirely as original summary material with no reproduction of the
  standard's text.*
- **エンゲージメント管理** — フェーズ進捗・リスク・決定・アクション・ステークホルダー・成果物
  ステータスを JSON に永続化（既定 `~/.togaf-eap`、atomic 書き込み）。**複数案件**に対応し、
  旧 `engagement.json` は初回アクセス時に自動移行します（旧ファイルは保険として残します）。
  *Engagement state persisted as JSON with atomic writes, multiple engagements, and automatic
  migration from the single-file layout.*
- **デュアルダッシュボード** — コピペ / 印刷向けの Markdown と、`node:http` + SSE の自己完結 HTML
  （外部 CDN 参照なし、印刷用 CSS、ダークモード対応）。状態ファイルを watch して更新をブラウザへ
  push します。
  *A Markdown dashboard for pasting and printing, plus a self-contained HTML dashboard on `node:http`
  with SSE live updates.*
- **分析・レビュー・ロードマップ** — `gap_analysis` / `risk_matrix` / `stakeholder_matrix` /
  `assess_maturity` / `assess_readiness` / `generate_review_checklist` / `check_engagement_health`、
  作業パッケージと移行アーキテクチャの管理・可視化・優先順位付け。
  *Analysis, review and roadmap tooling.*
- **書き出し** — ダッシュボードと成果物雛形のファイル書き出し（パス検証つき）。
  *File export for the dashboard and deliverable templates, with path validation.*
- **MCP prompts / resources** — prompts 8 件、resources 8 件（テンプレート 3 件を含む）。
  *8 prompts and 8 resources.*
- **ライセンス** — 個人利用のみ・AI / ML 学習禁止（`LICENSE.md`、日英併記）。
  *Personal use only, no AI/ML training.*
- **一次情報の確認結果を記録** — TOGAF 標準はオンライン閲覧と自組織での利用は自由である一方、
  複製・再配布には許諾が必要で、原本の著作権表記は LLM / 生成 AI への組み込みを明示的に禁じています。
  本プロジェクトは MCP サーバーとして AI から利用されるため、著作権の及ばない**事実情報**のみを使い、
  解説は**すべて独自に執筆**する方針としました。
  *Recorded why the knowledge base carries no source text: the standard's copyright notice forbids
  incorporation into LLMs, so this project uses only non-copyrightable factual structure and writes
  all commentary itself.*

### 修正 / Fixed

レビューで実機再現した欠陥のうち主なもの:

- 索引が壊れたときに旧データを取りこぼしていた。
  *A corrupted index could lose previously stored engagements.*
- 残存リスク表の読み方が英文で逆になっていた。
  *The residual risk table read backwards in English.*
- 複製されたファイルが幽霊エントリを生んでいた。
  *Duplicated files produced ghost entries.*

### 検証 / Verification

- `npm test` — vitest **53 件**（最初の実装時点では 40 件）
- `npm run smoke` — stdio JSON-RPC **57 チェック**

---

## 注記 / Note

まだ git タグも GitHub Release も作成していないため、バージョン間の比較リンクは張っていません。
各バージョンの範囲は `package.json` の `version` フィールドが変わったコミットで区切っています。

No git tags or GitHub releases exist yet, so this file carries no comparison links. The boundary
between versions is the commit where the `version` field in `package.json` changed.

日付はいずれもコミット日（`git log --date=short`）です。
All dates are commit dates (`git log --date=short`).
