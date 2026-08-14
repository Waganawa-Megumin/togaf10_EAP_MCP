# TOGAF 10 EAP MCP — 実装計画と進捗

> この計画は Claude Code(Web)セッションでユーザー承認済み。ローカル CLI で続きを実装する際は、下の進捗チェックリストの未完了項目から着手すること。

## 進捗チェックリスト

- [x] 1. プロジェクト雛形(package.json / tsconfig.json / .gitignore)
- [x] 2. LICENSE.md(個人利用のみ・AI 学習禁止、日英併記)
- [x] 3. README.md(日本語メイン+英語サマリ、セットアップ手順、ツール一覧)
- [x] 4. `src/knowledge/` — バイリンガル知識ベース
  - [x] `types.ts` — `{ ja, en }` 併記の共通型
  - [x] `adm-phases.ts` — Preliminary, A〜H, Requirements Management(計 10)。各: 目的 / 主な入力 / 主なステップ / 主な成果物 / 実務のコツ
  - [x] `techniques.ts` — ギャップ分析、ビジネスシナリオ、ステークホルダー管理、アーキテクチャ原則、リスク管理、ビジネス変革準備度評価、能力ベース計画 等 **11 件**
  - [x] `deliverables.ts` — Architecture Vision, Architecture Definition Document, Architecture Roadmap, 実装移行計画, Statement of Architecture Work 等 **21 件**(うち 7 件は雛形の節構成付き。残りは記載項目から雛形を自動生成)
  - [x] `glossary.ts` — EAP 頻出用語 **35 件**(日英)
  - [x] `consulting.ts` — 状況キーワード → 該当フェーズ / 技法 / 成果物 / 推奨アクション / 確認質問の対応ルール **14 ルール**(レガシー刷新、EA/DX 立ち上げ、クラウド移行、ステークホルダー対立、ガバナンス形骸化、要件変更、M&A、データサイロ、コスト削減、セキュリティ規制、パッケージ選定、炎上 PJ、AI 活用、人材不足)
  - [x] `index.ts` — 横断検索(日英・単語境界マッチ)とルールマッチングを追加
- [x] 5. `src/engagement/` — エンゲージメント状態
  - [x] `model.ts` — フェーズ進捗・リスク・決定事項・アクション・ステークホルダー・成果物ステータスの型
  - [x] `store.ts` — JSON 永続化(既定 `~/.togaf-eap/engagement.json`、`TOGAF_EAP_DATA_DIR` で変更可、atomic 書き込み + 変更イベント)
- [x] 6. `src/server.ts` + `src/tools/` — MCP ツール登録(計 15 ツール)
  - [x] 参照系: `list_adm_phases` / `get_adm_phase` / `list_techniques` / `get_technique` / `list_deliverables` / `get_deliverable` / `get_glossary_term` / `search_togaf` / `generate_deliverable_template`
  - [x] コンサル系: `consult` / `start_engagement` / `get_engagement` / `update_engagement`
  - [x] ダッシュボード系: `get_dashboard`(Markdown) / `open_dashboard`(ブラウザ)
- [x] 7. `src/dashboard/` — ダッシュボード
  - [x] `labels.ts` — 日英の表示ラベル(Markdown / HTML で共用)
  - [x] `markdown.ts` — コピペ・印刷向けの整形済み Markdown
  - [x] `html.ts` — 自己完結 HTML(ADM フェーズ進捗、リスク / 決定 / 成果物一覧、`@media print` の印刷用 CSS、ダークモード対応)
  - [x] `httpServer.ts` — node:http + SSE。状態ファイルを watch して変更を push、クライアントが再取得して再描画。xdg-open / open / start でブラウザ自動起動
- [x] 8. `src/index.ts` — stdio エントリポイント
- [x] 9. `tests/` — vitest 40 件(知識ベースの整合性・検索・consult ルール・store の読み書き・ダッシュボード HTTP/SSE)
- [x] 10. `scripts/smoke.mjs` — stdio JSON-RPC スモークテスト 57 チェック(initialize → tools/list → 全カテゴリの tools/call → HTTP/SSE ライブ更新)
- [x] 11. README のツール一覧と実装の最終整合チェック

## ツール仕様の要点

- すべての参照系ツールは `lang` パラメータ(`"ja" | "en" | "both"`、既定 `"both"`)を受け付け、日英併記で返す。
- `consult` の入力: `situation`(自由記述、必須)+ `currentPhase` / `industry`(任意)。出力: 関連 ADM フェーズ、推奨技法、作るべき成果物、推奨アクション、ステークホルダーへの確認質問。
- `update_engagement` は部分更新: フェーズステータス変更(`not_started / in_progress / completed / skipped`)、リスク / 決定 / アクション / ステークホルダー / 成果物ステータスの追加・更新。
- `open_dashboard` は既起動ならその URL を返すだけ(多重起動しない)。ポートは既定 0(空きポート自動)+ 環境変数 `TOGAF_EAP_DASHBOARD_PORT`。

## 検証方法と実施結果(2026-08-14)

1. `npm run build` が通ること → **OK**(`tsc --noEmit` も警告なし)
2. `npm run smoke` — initialize / tools/list / 代表ツール呼び出しが成功すること → **57 チェック全通過**
3. ダッシュボード: `open_dashboard` 起動後、HTML 取得・`/api/state` の JSON・`/events` の SSE 受信を確認し、`engagement.json` 更新でライブ反映されること → **OK**(スモークテストと vitest の両方で自動検証。実データを入れた画面をブラウザで目視確認し、印刷プレビューも確認済み)
4. `npm test` が緑であること → **40 件全通過**
5. `claude mcp add togaf-eap -- node <path>/dist/index.js` で Claude Code に登録し、実会話で動作確認 → **未実施**(利用者側で実施)

## v0.2 — UX 刷新と周辺フレームワークの取り込み(2026-08-14)

初版(ツール 15)を、並列エージェント 3 波 + 各実装への独立レビューで **ツール 84 + prompts 8 + resources 8** に拡張した。
テーマは **「イケてない TOGAF の UX 刷新」**: ①視覚優先 ②次の一手が常に明確 ③実務ツールに接続 ④手元の資料をそのまま入力に。

- [x] ガイド付き体験 — `start_here` / `next_best_action` / `tailor_adm` / `explain_for` / `whats_new_for_me`
- [x] Mermaid 図生成 8 種 — ADM サイクル / 能力マップ / バリューストリーム / アプリ連携 / ロードマップ Gantt / 4 象限 / リスク行列 / C4
- [x] ArchiMate — レイヤ・要素・関係の知識、ADM との対応、関係の妥当性判定、**Archi 取り込み用 CSV / Open Exchange XML 書き出し**
- [x] セキュリティ EA — SABSA 6 層 × 6 問いの ADM 対応、脅威モデルの出発点、要件チェックリスト、案件のセキュリティ点検
- [x] 既存ドキュメント取り込み — 報告書等から**出典行番号付き**で候補抽出し、案件へ取り込み
- [x] 周辺フレームワーク 22 — BIZBOK / Zachman / C4 / Wardley / IT4IT / DDD 等との棲み分けと併用方法
- [x] ビジネスアーキテクチャの**作り方** — 能力マップ手順、バリューストリーム、クロスマッピング、アンチパターン検出
- [x] 複数案件対応 — `index.json` + `engagements/<id>.json`、旧レイアウトからの自動移行
- [x] 分析・レビュー — ギャップ分析 / リスク行列 / 4 象限 / 成熟度・変革準備度 / レビューチェックリスト / 健全性監査
- [x] ロードマップ — 作業パッケージと移行アーキテクチャ、四半期タイムライン、価値 × 規模の優先順位付け
- [x] ダッシュボード v2 — ロードマップ図・ヒートマップ・4 象限・評価バー・目次・テーマ切替・印刷 CSS
- [x] Claude API 連携(任意・`fetch` ベース・キー未設定でも代替経路を返す)
- [x] 検証 — vitest(件数は `npm test` の出力)/ スモークテスト 103 チェック

### レビューで実際に捕まえた欠陥(記録)

並列実装したものを別エージェントが批判的にレビューし、**実際に動かして**検証した。主なもの:

| 深刻度 | 内容 |
| --- | --- |
| major | `read_document` がホーム配下の隠しディレクトリを許可しており、`~/.config/gcloud/...` 等の資格情報を出力できた |
| major | 残存リスク表の読み方が英文で逆(対角線の左右)。会議でそのまま読むと評価が正反対になる |
| major | `index.json` 破損時に旧 `engagement.json` を永久に取りこぼし、既存データが消えたように見える |
| major | API キー未設定時のフォールバックで、文書本文を固定の ``` フェンスに入れており、本文に ``` があると脱出してホスト LLM に指示として提示され得た |
| major | `claude-haiku-4-5` を選択肢に出していたが effort 非対応で全リクエストが 400 になる |
| major | 英語のシステム名抽出が「文頭が大文字なだけの語」に一致し `The` を抽出・永続化 |
| minor | 受容者の組織名判定が部分一致で、阿部・服部・渡部などの姓を誤検出 |

| critical | ArchiMate の realization(実現関係)の**向きが逆**に書かれていた。そのとおり描くと Archi に取り込めない/意味が反転したモデルになる |

これらは担当エージェント側で修正済み。ArchiMate のデータが 2 系統に分かれている点は、目的が違う(参照解説 / 関係判定の分類)ため統合せず、**`tests/archimate.test.ts` で要素 ID・英語名・層の一致と realization の向きを機械的に固定**した。回帰テストは `tests/engagements.test.ts` と `tests/knowledge-extended.test.ts`、およびスモークテストの新セクションで固定した。

## 制約(必読)

- TOGAF 原文の転載禁止(独自要約のみ)。ライセンスは個人利用のみ・AI 学習禁止のまま維持。
- 依存追加は原則不可(`@modelcontextprotocol/sdk` + `zod` のみ)。
- 開発ブランチ: `claude/togaf10-eap-mcp-qodih0`
