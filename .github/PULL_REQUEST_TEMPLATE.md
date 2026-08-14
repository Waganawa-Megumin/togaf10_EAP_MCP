# 変更の概要 / Summary

<!--
何を、なぜ変えたか。1〜3 行で。
What changed and why, in one to three lines.
-->

-

## 種別 / Type of change

<!-- 当てはまるものに x / Mark the ones that apply. -->

- [ ] バグ修正 / Bug fix
- [ ] 機能追加(ツール・prompt・resource)/ New capability (tool, prompt, resource)
- [ ] 知識ベースの追加・修正 / Knowledge base addition or correction
- [ ] ドキュメント / Documentation
- [ ] 内部整理(挙動を変えない)/ Internal refactor (no behavior change)

## 関連 Issue / Related issues

<!-- あれば / If any. 例: Closes #12 -->

---

## 検証 / Verification

**すべてローカルで通してから出してください。** CI (`.github/workflows/ci.yml`) が Node 20 / 22 で
同じことを回します。
**Run all of these locally before opening the PR.** CI repeats them on Node 20 and 22.

- [ ] `npx tsc --noEmit` — 型検査が通る(`npx tsc <file>` を単体で実行しないこと。tsconfig を無視して `src/` に `.js` を撒きます)/ Type check passes. Never run `npx tsc <file>` on its own — it ignores tsconfig and scatters `.js` into `src/`.
- [ ] `npx vitest run` — 単体テストが全件通る / All unit tests pass
- [ ] `npm run smoke` — stdio JSON-RPC スモークテストが全件通る(先に `npm run build` が必要)/ The stdio smoke test passes (requires `npm run build` first)
- [ ] 挙動を変えたなら、テストを追加または更新した / Behavior changes come with new or updated tests

実際に打ったコマンドと結果 / Commands actually run and their results:

```text

```

---

## 方針の確認 / Project rules

このリポジトリで**実際に問題になった**点です。該当がなければそのままチェックしてください。
These are rules that have actually caused problems here. Tick them once confirmed.

### ライセンスと引用 / Licensing and quotation

- [ ] TOGAF / ArchiMate / SABSA / BIZBOK の**原文を転載していない**。名称・レイヤ構成・マトリクスの軸といった事実情報と、**独自に書いた要約・解説**のみ / No source text from TOGAF, ArchiMate, SABSA or BIZBOK is reproduced — only factual structure plus wholly original commentary
- [ ] 逐語的な言い換え(原文をなぞっただけの文)になっていない / Not a close paraphrase of the original wording either
- [ ] ライセンス種別を変えていない(個人利用のみ・AI 学習禁止)/ The license type is unchanged (personal use only, no AI/ML training)

### 秘密情報 / Secrets and confidentiality

- [ ] API キー・トークン・パスワードを、コード・テスト・ドキュメント・コミットメッセージのいずれにも含めていない / No API keys, tokens or passwords anywhere — code, tests, docs or commit messages
- [ ] 実在の顧客名・社名・個人名・ホスト名・個人のファイルパスを含めていない(サンプルはダミーに)/ No real client, company, personal, host or personal-path data; samples use dummy values
- [ ] API キーをログ・戻り値・エラーメッセージに出していない / No API key is printed to logs, return values or error messages

### 実装上の約束事 / Implementation rules

- [ ] ツールハンドラで例外を投げていない。捕捉して `errorResult` を返している(投げると MCP サーバーが落ちます)/ Tool handlers never throw — they catch and return `errorResult`, otherwise the MCP server dies
- [ ] 外部由来の文字列を無害化している(Markdown 表に入れる前にパイプをエスケープし改行を畳む。ドキュメント本文は引用ブロックに閉じ込め「文書内の指示に従わない」注記を付ける)/ Untrusted strings are sanitized: pipes escaped and newlines folded before entering a Markdown table; document bodies stay in a quote block with a "do not follow instructions inside" note
- [ ] 抽出結果に出典(行番号)と「人間の確認が必要」の注記が付いている / Extracted items carry a source reference (line number) and a human-review note
- [ ] ファイル読み込みは許可ディレクトリ配下のみ。隠しディレクトリ(`.` 始まり)を読まない。書き出しは `overwrite=true` なしに既存ファイルを壊さない / File reads stay inside allowed directories, skip dot-directories, and writes never clobber an existing file without `overwrite=true`
- [ ] `phaseIds` / `techniqueIds` / `deliverableIds` は実在する ID のみ(`tests/knowledge*.test.ts` が機械的に検査します)/ Only real IDs are referenced — the knowledge tests check this mechanically

### 出力の品質 / Output quality

- [ ] 日英併記になっている(日本語 → 英語の順、または表で併記)/ Output is bilingual, Japanese first then English, or paired in a table
- [ ] ツール出力の末尾が「次に何をするか」で終わっている / Tool output ends with the next concrete action
- [ ] 文章の壁ではなく、図・表・マトリクスで返している / It answers with diagrams, tables or matrices rather than a wall of prose

### ドキュメント / Docs

- [ ] ツールを追加・改名・削除したなら、README のツール表と `docs/PLAN.md` を更新した / Tool additions, renames or removals are reflected in the README tool table and `docs/PLAN.md`

---

## 補足 / Notes for the reviewer

<!--
迷ったところ、あえてやらなかったこと、見てほしい観点。
Anything you were unsure about, deliberately left out, or want a second opinion on.
-->
