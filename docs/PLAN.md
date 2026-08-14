# TOGAF 10 EAP MCP — 実装計画と進捗

> この計画は Claude Code(Web)セッションでユーザー承認済み。ローカル CLI で続きを実装する際は、下の進捗チェックリストの未完了項目から着手すること。

## 進捗チェックリスト

- [x] 1. プロジェクト雛形(package.json / tsconfig.json / .gitignore)
- [x] 2. LICENSE.md(個人利用のみ・AI 学習禁止、日英併記)
- [x] 3. README.md(日本語メイン+英語サマリ、セットアップ手順、ツール一覧)
- [ ] 4. `src/knowledge/` — バイリンガル知識ベース
  - [ ] `types.ts` — `{ ja, en }` 併記の共通型
  - [ ] `adm-phases.ts` — Preliminary, A〜H, Requirements Management(計 10)。各: 目的 / 主な入力 / 主なステップ / 主な成果物 / 実務のコツ
  - [ ] `techniques.ts` — ギャップ分析、ビジネスシナリオ、ステークホルダー管理、アーキテクチャ原則、リスク管理、ビジネス変革準備度評価、能力ベース計画 等 約 10 件
  - [ ] `deliverables.ts` — Architecture Vision, Architecture Definition Document, Architecture Roadmap, 実装移行計画, Statement of Architecture Work 等 約 15 件
  - [ ] `glossary.ts` — EAP 頻出用語 約 30 件(日英)
  - [ ] `consulting.ts` — 状況キーワード → 該当フェーズ / 技法 / 成果物 / 推奨アクション / 確認質問の対応ルール(レガシー刷新、DX 立ち上げ、クラウド移行、ステークホルダー対立、ガバナンス、要件変更 等 約 10〜12 ルール)
- [ ] 5. `src/engagement/` — エンゲージメント状態
  - [ ] `model.ts` — フェーズ進捗・リスク・決定事項・アクション・ステークホルダー・成果物ステータスの型
  - [ ] `store.ts` — JSON 永続化(既定 `~/.togaf-eap/engagement.json`、`TOGAF_EAP_DATA_DIR` で変更可)
- [ ] 6. `src/server.ts` + `src/tools/` — MCP ツール登録
  - [ ] 参照系: `list_adm_phases` / `get_adm_phase` / `list_techniques` / `get_technique` / `list_deliverables` / `get_deliverable` / `search_togaf` / `generate_deliverable_template`
  - [ ] コンサル系: `consult` / `start_engagement` / `get_engagement` / `update_engagement`
  - [ ] ダッシュボード系: `get_dashboard`(Markdown) / `open_dashboard`(ブラウザ)
- [ ] 7. `src/dashboard/` — ダッシュボード
  - [ ] `markdown.ts` — コピペ・印刷向けの整形済み Markdown
  - [ ] `html.ts` — 自己完結 HTML(ADM フェーズ進捗、リスク / 決定 / 成果物一覧、`@media print` の印刷用 CSS)
  - [ ] `httpServer.ts` — node:http + SSE。状態ファイルを watch して変更を push、クライアントが再取得して再描画。xdg-open / open / start でブラウザ自動起動
- [ ] 8. `src/index.ts` — stdio エントリポイント
- [ ] 9. `tests/` — vitest(store の読み書き、検索、consult ルールのマッチング)
- [ ] 10. `scripts/smoke.mjs` — stdio JSON-RPC スモークテスト(initialize → tools/list → 代表ツールの tools/call)
- [ ] 11. README のツール一覧と実装の最終整合チェック

## ツール仕様の要点

- すべての参照系ツールは `lang` パラメータ(`"ja" | "en" | "both"`、既定 `"both"`)を受け付け、日英併記で返す。
- `consult` の入力: `situation`(自由記述、必須)+ `currentPhase` / `industry`(任意)。出力: 関連 ADM フェーズ、推奨技法、作るべき成果物、推奨アクション、ステークホルダーへの確認質問。
- `update_engagement` は部分更新: フェーズステータス変更(`not_started / in_progress / completed / skipped`)、リスク / 決定 / アクション / ステークホルダー / 成果物ステータスの追加・更新。
- `open_dashboard` は既起動ならその URL を返すだけ(多重起動しない)。ポートは既定 0(空きポート自動)+ 環境変数 `TOGAF_EAP_DASHBOARD_PORT`。

## 検証方法

1. `npm run build` が通ること
2. `npm run smoke` — initialize / tools/list / 代表ツール呼び出しが成功すること
3. ダッシュボード: `open_dashboard` 起動後、`curl` で HTML 取得・`/api/state` の JSON・`/events` の SSE 受信を確認し、`engagement.json` 更新でライブ反映されること
4. `npm test` が緑であること
5. `claude mcp add togaf-eap -- node <path>/dist/index.js` で Claude Code に登録し、実会話で動作確認

## 制約(必読)

- TOGAF 原文の転載禁止(独自要約のみ)。ライセンスは個人利用のみ・AI 学習禁止のまま維持。
- 依存追加は原則不可(`@modelcontextprotocol/sdk` + `zod` のみ)。
- 開発ブランチ: `claude/togaf10-eap-mcp-qodih0`
