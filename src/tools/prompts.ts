/**
 * MCP プロンプト / MCP prompts.
 *
 * クライアント(Claude Desktop 等)のプロンプトメニューから選ぶだけで、
 * アーキテクトの定型作業がそのまま始められる定型プロンプトを公開する。
 * 各プロンプトは「どのツールをどの順で呼ぶか」を本文で明示し、
 * このサーバーの知識ベース・エンゲージメント状態を必ず参照させる。
 *
 * Exposes ready-to-run prompts so a practitioner can start a standard piece of
 * architecture work straight from the client's prompt menu. Every prompt names
 * the tools to call and in which order.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

/** ユーザーメッセージ 1 件のプロンプト結果を組み立てる */
function promptResult(body: string): GetPromptResult {
  return {
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: body.trim() },
      },
    ],
  };
}

/** 引数が空文字・未指定のときに代替文字列を返す */
function orElse(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : fallback;
}

/**
 * 全プロンプト共通の作法。
 * 出力言語・引用の禁止・不明点の扱いを毎回そろえるために末尾へ付ける。
 */
const HOUSE_RULES = `
## 共通ルール / Ground rules

- 回答はユーザーが使っている言語に合わせる。指定が無ければ日本語を主とし、重要な見出しと結論に英語を併記する。表はそのまま資料へ貼れる粒度にする。
- TOGAF 標準の原文を引用しない。事実(フェーズ名・成果物名など)と、あなた自身の言葉による解説だけで書く。
- 情報が足りない箇所は勝手に埋めず、「確認事項」として箇条書きで列挙し、誰に何を聞くかまで書く。
- 推測を書く場合は必ず「仮説」と明示し、検証方法を添える。
- 最後に「次の一手(所要時間の目安つき)」を 3〜5 件で締める。

- Match the user's language; when unspecified, answer in Japanese with English headings and conclusions. Keep tables paste-ready.
- Never quote the TOGAF standard verbatim: use factual names plus your own explanation.
- List unknowns as open questions with the owner to ask, instead of inventing content.
- Mark any assumption as a hypothesis and state how to validate it.
- Close with 3-5 concrete next actions, each with a rough time estimate.
`;

/**
 * ツールの呼び出し方の注記。
 * 具体的なツール名はサーバーの構成によって増減するため、ここでは名前を列挙せず
 * 「公開されている一覧を確認してから呼ぶ」ことだけを指示する(存在しない名前を
 * 書くと、そのツールを呼ぼうとして失敗するため)。
 */
const TOOL_NOTE = `
> 補足: 上の手順で名前を挙げていない作業でも、サーバー構成によっては専用ツールがある。
> **まず公開されているツール一覧を確認し、該当するものがあれば手作業より優先して使う**。
> 一覧に無い名前のツールは呼ばない(呼べば失敗する)。無い場合はその手順を自分で実施し、
> 結果を本文に書く。よくある対応:
> ギャップ分析→\`gap_analysis\` / リスク評価→\`risk_matrix\` / ステークホルダー分析→\`stakeholder_matrix\` /
> 成熟度→\`assess_maturity\` / 変革準備度→\`assess_readiness\` / ロードマップ→\`get_roadmap\`・\`prioritize_work_packages\` /
> レビュー観点→\`generate_review_checklist\` / 健全性チェック→\`check_engagement_health\` / 書き出し→\`export_report\`。
> Note: check the advertised tool list first and prefer a real tool over doing a step by hand -
> but never call a tool name that is not in that list; do that step yourself instead.
`;

export function registerPrompts(server: McpServer): void {
  // --- 1. フェーズ着手 -------------------------------------------------------
  server.registerPrompt(
    'phase_kickoff',
    {
      title: 'ADM フェーズ着手 / ADM phase kickoff',
      description:
        '指定した ADM フェーズを開始するための段取り・確認事項・作るべき成果物を整理する。 / Plan the kickoff of a given ADM phase: sequence, checkpoints, and deliverables to produce.',
      argsSchema: {
        phase: z
          .string()
          .describe(
            'フェーズ ID またはコード。例: preliminary, a, b, c, d, e, f, g, h, requirements-management / Phase id or code',
          ),
        focus: z
          .string()
          .optional()
          .describe('今回特に重点を置きたい論点(任意) / Optional focus for this kickoff'),
      },
    },
    ({ phase, focus }) =>
      promptResult(`
あなたはエンタープライズアーキテクトのコンサルタントです。ADM フェーズ **${phase}** の着手支援をしてください。
You are an enterprise architecture consultant. Help me kick off ADM phase **${phase}**.

重点論点 / Focus: ${orElse(focus, '指定なし(全体を均等に扱う) / not specified')}

## 手順 / Steps

1. \`get_adm_phase\` を \`phase="${phase}"\` で呼び、目的・入力・ステップ・成果物・実務のコツを取得する。
2. \`get_engagement\` で現在のエンゲージメント状態(進捗・リスク・決定・アクション・ステークホルダー)を取得する。
   未開始なら \`start_engagement\` の実行を提案し、必要な入力項目を先に質問する。
3. 手順 1 で得た関連技法・関連成果物を \`get_technique\` / \`get_deliverable\` で 2〜3 件だけ深掘りする
   (全部は読まない。このフェーズの成否を左右するものを選ぶ)。
4. 上記を突き合わせて、下記の構成でキックオフ資料を作る。

## 出力構成 / Output

1. **このフェーズのゴール** — 3 行以内。完了したと言える条件(Definition of Done)を明示する。
2. **前提として揃っているべき入力** — 表(入力 / 現状の有無 / 入手先 / 不足時の代替)。
3. **作業ブレークダウン** — 表(作業 / 目的 / 担当ロール / 所要 / 依存)。2 週間単位で区切る。
4. **作る成果物** — 表(成果物 / 目的 / レビュー者 / 完成度の目安)。ID は知識ベースのものを使う。
5. **意思決定が必要な論点** — 誰がいつまでに何を決めるか。決めないと止まるものを上に置く。
6. **リスクと初期対応** — 上位 5 件。発生確率・影響・初期対応を 1 行ずつ。
7. **キックオフ会議アジェンダ(60 分)** — 時間配分つき。

最後に、\`update_engagement\` でこのフェーズを \`in_progress\` にし、
洗い出したアクション・リスクを登録するための呼び出し内容を提案してください(実行前に確認を取る)。

${TOOL_NOTE}
${HOUSE_RULES}
`),
  );

  // --- 2. アーキテクチャレビュー ---------------------------------------------
  server.registerPrompt(
    'architecture_review',
    {
      title: 'アーキテクチャレビュー / Architecture review',
      description:
        '対象の設計をレビュー観点ごとに評価し、指摘と是正案を出す。 / Review a design against explicit criteria and produce findings with remediation.',
      argsSchema: {
        target: z
          .string()
          .describe('レビュー対象(システム名・設計書名・変更提案など) / What is being reviewed'),
        scope: z
          .string()
          .optional()
          .describe('レビュー範囲や制約(任意) / Optional scope or constraints'),
      },
    },
    ({ target, scope }) =>
      promptResult(`
あなたはアーキテクチャレビュー委員会の主査です。**${target}** をレビューしてください。
You are the chair of an architecture review board. Review **${target}**.

範囲 / Scope: ${orElse(scope, '明示なし。まず範囲を確認する質問から始める / not stated - start by clarifying scope')}

## 手順 / Steps

1. \`get_engagement\` で現在の原則・決定事項・制約を確認する(既存の決定と矛盾する設計は最優先の指摘)。
2. \`get_adm_phase\` を \`phase="g"\` で呼び、実装ガバナンスの観点を確認する。
   併せて \`get_technique\` を \`technique="architecture-principles-technique"\` と
   \`technique="architecture-governance"\` で呼び、原則の立て方と逸脱の扱い方をそろえる。
   既存の原則そのものを見たいときは \`get_deliverable\` を \`deliverable="architecture-principles"\` で呼ぶ
   (原則は成果物、その策定手順は技法として別 ID になっている)。
3. 対象資料が会話に無ければ、何を見せてほしいかを箇条書きで要求してから進める。

## レビュー観点 / Review criteria

各観点を **適合 / 条件付き適合 / 不適合 / 判定不能** の 4 段階で評価し、根拠を 1〜2 行で書く。

- ビジネス適合性(誰のどの課題を解くか、業務プロセスとの整合)
- 既存のアーキテクチャ原則・標準への適合(逸脱があれば例外申請の要否)
- データ(所有権、正本、品質、ライフサイクル、越境と保持期間)
- アプリケーション(責務分割、結合度、API 契約、後方互換)
- テクノロジ(可用性、性能、スケール、コスト、運用性、EOL)
- セキュリティとプライバシー(認証認可、機密区分、監査ログ、法規制)
- 移行と共存(現行との並走、切り戻し、データ移行、影響を受ける部署)
- ガバナンス(責任分界、監視指標、変更管理、技術負債の返済計画)

## 出力構成 / Output

1. **総合判定** — 承認 / 条件付き承認 / 差し戻し。理由を 3 行。
2. **観点別評価表** — 観点 / 判定 / 根拠 / 指摘 ID。
3. **指摘一覧** — 表(ID / 重大度 High-Medium-Low / 指摘 / 影響 / 是正案 / 担当 / 期限目安)。
   重大度が高いものから並べる。是正案は「代替案 A/B と推奨」の形にする。
4. **良い点** — 3 件。維持すべき設計判断を明示する(指摘だけの資料にしない)。
5. **再レビューの条件** — 何が満たされたら再提出可か。

最後に、High の指摘を \`update_engagement\` のリスク/アクションとして登録する案を提示してください。

${TOOL_NOTE}
${HOUSE_RULES}
`),
  );

  // --- 3. 経営層向けサマリ ---------------------------------------------------
  server.registerPrompt(
    'exec_summary',
    {
      title: '経営層向け 1 ページ要約 / Executive one-pager',
      description:
        '現在のエンゲージメントから経営層向けの 1 ページ要約を作る。 / Turn the current engagement state into a one-page executive summary.',
      argsSchema: {
        audience: z
          .string()
          .optional()
          .describe('想定読者(任意)。例: CIO, 役員会, 事業部長 / Optional audience'),
        decision: z
          .string()
          .optional()
          .describe('この資料で取りたい判断(任意) / Optional decision you want from them'),
      },
    },
    ({ audience, decision }) =>
      promptResult(`
現在のエンタープライズアーキテクチャ案件について、経営層が 3 分で読める 1 ページ要約を作ってください。
Produce a one-page executive summary of the current EA engagement.

想定読者 / Audience: ${orElse(audience, '経営会議(CIO・CFO・事業責任者) / executive committee')}
取りたい判断 / Decision sought: ${orElse(decision, '現状の追認と次フェーズの予算承認 / endorse status and approve next phase')}

## 手順 / Steps

1. まず \`get_dashboard\` を呼び(Markdown が返る)、進捗・リスク・決定・アクションの現状を取得する。
2. 補足が要れば \`get_engagement\` で明細を確認する。エンゲージメント未作成なら、その旨だけを短く報告して終える。
3. 数値(進捗率・リスク件数・期限超過アクション数)はダッシュボードの値をそのまま使い、創作しない。

## 出力構成 / Output(A4 1 枚、合計 600 字以内を目安)

1. **一言サマリ / Bottom line** — 2 文。良い知らせと悪い知らせを両方含める。
2. **信号機ステータス** — スコープ / スケジュール / コスト / リスク を 緑・黄・赤 で。各 1 行の理由つき。
3. **この 1 か月の成果** — 箇条書き 3 件。事業価値(コスト、リードタイム、リスク低減)に翻訳して書く。
4. **判断をお願いしたいこと** — 1〜3 件。選択肢・推奨・決めない場合の影響・期限を明記する。
5. **主要リスク トップ 3** — リスク / 影響(できれば金額や日数) / 対応 / 責任者。
6. **次の 30 日 / 60 日 / 90 日** — 各 2 行。

## 書き方の制約 / Style

- 専門用語を避ける。ADM のフェーズ名を出す場合は「何をしている期間か」を必ず添える。
- 技術的な詳細は書かない。読者が知りたいのは「金・時間・リスク・意思決定」だけ。
- 悪い数字を丸めない。遅延やリスクは先に書く。

${TOOL_NOTE}
${HOUSE_RULES}
`),
  );

  // --- 4. ステークホルダー説明 -----------------------------------------------
  server.registerPrompt(
    'stakeholder_briefing',
    {
      title: 'ステークホルダー説明資料 / Stakeholder briefing',
      description:
        '特定ステークホルダーの関心事に合わせた説明資料を組み立てる。 / Build a briefing tailored to one stakeholder concerns.',
      argsSchema: {
        stakeholder: z
          .string()
          .describe('対象ステークホルダー(氏名・役職・部門など) / The stakeholder to brief'),
        topic: z
          .string()
          .optional()
          .describe('説明したいテーマ(任意) / Optional topic to cover'),
      },
    },
    ({ stakeholder, topic }) =>
      promptResult(`
**${stakeholder}** 向けの説明資料を作ってください。相手の関心事に合わせて内容と粒度を変えるのが目的です。
Build a briefing for **${stakeholder}**, tailored to their concerns.

テーマ / Topic: ${orElse(topic, 'アーキテクチャ活動全体の現状と依頼事項 / overall status and asks')}

## 手順 / Steps

1. \`get_engagement\` を呼び、登録済みステークホルダー情報(影響力・関心・立場)を確認する。
   \`${stakeholder}\` が未登録なら、まず 5 つの質問で人物像(役割・評価指標・懸念・決裁権・情報の好み)を聞き出し、
   \`update_engagement\` で登録する案を出す。
2. \`get_technique\` で \`stakeholder-management\` を参照し、関心事の分類軸をそろえる。
3. \`get_dashboard\` で現状値を取得し、相手に関係する部分だけを抜き出す。

## 出力構成 / Output

1. **相手プロファイル** — 役割 / 評価される指標 / 想定される懸念 / 決裁範囲 / 好む説明の粒度。仮説は仮説と明記。
2. **この人に響くメッセージ 3 本** — それぞれ 1 文。相手の指標に紐づける。
3. **説明の流れ(15 分想定)** — 見出しと所要時間。冒頭 2 分で結論を出す構成にする。
4. **相手の関心事 × こちらの回答** — 表(関心事 / 想定質問 / 回答 / 裏付けとなる成果物やデータ)。
5. **依頼事項** — 何を、いつまでに、なぜこの人にお願いするのか。
6. **想定される反論と切り返し** — 3 件。感情的な反発も含めて現実的に書く。
7. **持ち帰り資料 1 枚のドラフト** — Markdown の見出しと箇条書きで。

## 書き方の制約 / Style

- 相手が経営層なら金額・期間・リスク、現場責任者なら手順・工数・影響範囲、
  技術責任者なら制約・移行・運用に寄せる。誰にでも同じ資料を出さない。

${TOOL_NOTE}
${HOUSE_RULES}
`),
  );

  // --- 5. リスクワークショップ -----------------------------------------------
  server.registerPrompt(
    'risk_workshop',
    {
      title: 'リスク洗い出しワークショップ / Risk workshop facilitation',
      description:
        'リスク洗い出しワークショップのファシリテーション台本と記録テンプレートを作る。 / Facilitate a risk identification workshop end to end.',
      argsSchema: {
        scope: z
          .string()
          .optional()
          .describe('対象範囲(任意)。例: 移行計画, 特定システム / Optional scope'),
        horizon: z
          .string()
          .optional()
          .describe('対象期間(任意)。例: 次の 6 か月 / Optional time horizon'),
      },
    },
    ({ scope, horizon }) =>
      promptResult(`
90 分のリスク洗い出しワークショップを設計し、ファシリテーターとして進行してください。
Design and facilitate a 90-minute risk identification workshop.

対象範囲 / Scope: ${orElse(scope, 'エンゲージメント全体 / the whole engagement')}
対象期間 / Horizon: ${orElse(horizon, '次の 6 か月 / next 6 months')}

## 手順 / Steps

1. \`get_engagement\` で登録済みリスク・決定・アクションを取得し、既出のリスクを重複させない。
2. \`get_technique\` で \`risk-management\` を参照し、評価軸(発生可能性・影響・残存リスク)をそろえる。
3. 下記のリスクカテゴリを使って、参加者に問いかける形で洗い出しを進める。

## リスクカテゴリと呼び水の問い / Categories and trigger questions

- **事業・スポンサー**: 予算が半分になったら何が最初に落ちるか。スポンサーが交代したら誰が守るか。
- **スコープ・要件**: 「後で決める」と言われたまま放置されている論点はどれか。
- **組織・人**: 1 人しか分からない領域はどこか。その人が抜けたら何日止まるか。
- **データ**: 正本がどれか誰も断言できないデータはあるか。移行時に壊れたら誰が気づくか。
- **技術・ベンダー**: EOL、ライセンス、ロックイン、性能の未検証部分はどこか。
- **移行・並走**: 切り戻しの手順を実際に試したか。並走期間の二重運用は誰が回すか。
- **セキュリティ・規制**: 監査で最初に聞かれる項目は何か。個人情報の越境はあるか。
- **運用**: 障害時の一次対応者は誰か。監視されていない経路はどこか。

## 出力構成 / Output

1. **ワークショップ台本** — 時間配分つき(導入 10 / 発散 30 / 収束 20 / 評価 20 / 合意 10)。
2. **参加者と役割** — 呼ぶべきロールと、その人にしか出せない情報。
3. **洗い出しリスク一覧** — 表(ID / カテゴリ / リスク記述 / 兆候 / 発生可能性 高中低 / 影響 高中低 / 初期評価)。
   リスク記述は「〜のため、〜が起き、〜という影響が出る」の形で因果を書く。
4. **リスクマトリクス** — 発生可能性 × 影響 の 3x3 表にリスク ID を配置する。
5. **対応方針** — 上位 8 件について 回避 / 低減 / 移転 / 受容 のいずれかと、具体アクション・責任者・期限。
6. **監視トリガー** — 「この数値がこうなったら再評価」を各リスクに 1 行。
7. **未合意事項** — 会場で決まらなかったもの。持ち帰り先を明記。

最後に、洗い出したリスクを \`update_engagement\` に登録するための呼び出し内容(risks 配列)を提示してください。

${TOOL_NOTE}
${HOUSE_RULES}
`),
  );

  // --- 6. ギャップ分析ワークショップ -----------------------------------------
  server.registerPrompt(
    'gap_workshop',
    {
      title: 'ギャップ分析ワークショップ / Gap analysis workshop',
      description:
        '指定ドメインのベースラインと目標のギャップを洗い出すワークショップを進行する。 / Run a baseline-to-target gap analysis workshop for one domain.',
      argsSchema: {
        domain: z
          .string()
          .describe(
            'ドメイン。business / data / application / technology のいずれか、または自由記述 / Architecture domain',
          ),
        scope: z
          .string()
          .optional()
          .describe('対象業務や対象システムの範囲(任意) / Optional scope'),
      },
    },
    ({ domain, scope }) =>
      promptResult(`
**${domain}** ドメインのギャップ分析ワークショップ(120 分)を設計し、進行してください。
Design and run a 120-minute gap analysis workshop for the **${domain}** domain.

対象範囲 / Scope: ${orElse(scope, '未指定。まず範囲を確定させる質問をする / not specified - start by fixing the scope')}

## 手順 / Steps

1. \`get_technique\` を \`technique="gap-analysis"\` で呼び、手順と落とし穴を確認する。
2. 対象ドメインに対応する ADM フェーズを \`get_adm_phase\` で確認する
   (business→\`b\`, data/application→\`c\`, technology→\`d\`)。目的と成果物をそろえる。
3. \`get_engagement\` で既存の成果物・決定事項を確認し、ベースライン情報の有無を把握する。
4. ベースラインか目標のどちらかが未定義なら、ギャップ表を作る前にその欠落を明示して埋め方を提案する。

## 出力構成 / Output

1. **前提の確認** — 何をベースラインとし、いつ時点の情報か。目標はどの決定に基づくか。
2. **対象要素の棚卸し** — ${domain} ドメインの構成要素を 10〜20 件、粒度をそろえて列挙する。
3. **ギャップ表** — 表(要素 / ベースライン(現状) / ターゲット(目標) / 差分の種類 / 影響 / 優先度)。
   差分の種類は **新規追加 / 変更 / 廃止 / 据え置き / 意図的な未対応** から選ぶ。
   「廃止」と「意図的な未対応」を必ず 1 件以上検討する(残すものを決めるのも分析の仕事)。
4. **見落としチェック** — ベースラインにあってターゲットに現れない要素を列挙し、
   それが「廃止」なのか「単なる書き漏れ」なのかを明示的に判定する。
5. **ギャップの束ね直し** — 個別ギャップを 3〜6 個の作業パッケージ候補にまとめる(依存関係つき)。
6. **優先順位** — 事業価値 × 実現容易性 の 2 軸で並べ、最初に着手する 2 件を推奨する。
7. **次のアクション** — 誰が何をいつまでに。

## ファシリテーションの注意 / Facilitation notes

- 「現状が分からない」が出たら、それ自体を発見事項として記録する(調査アクション化)。
- 目標の記述が手段(製品名)になっていたら、目的(達成したい状態)に言い換えさせる。
- 1 要素の議論が 5 分を超えたら「持ち帰り」に落として先へ進める。

最後に、確定したギャップと作業パッケージ候補を \`update_engagement\` に記録する案を提示してください。

${TOOL_NOTE}
${HOUSE_RULES}
`),
  );

  // --- 7. 成果物ドラフト -----------------------------------------------------
  server.registerPrompt(
    'deliverable_draft',
    {
      title: '成果物の初稿作成 / Draft a deliverable',
      description:
        '指定した成果物の初稿を、テンプレートとエンゲージメント状態から書き起こす。 / Draft a deliverable from its template and the current engagement state.',
      argsSchema: {
        deliverable: z
          .string()
          .describe(
            '成果物 ID または名称。例: architecture-vision, architecture-definition-document / Deliverable id or name',
          ),
        audience: z
          .string()
          .optional()
          .describe('主な読者(任意) / Optional primary audience'),
      },
    },
    ({ deliverable, audience }) =>
      promptResult(`
成果物 **${deliverable}** の初稿を書いてください。空欄だらけの雛形ではなく、レビューに掛けられる草案にします。
Draft the deliverable **${deliverable}** - a reviewable first draft, not an empty template.

主な読者 / Audience: ${orElse(audience, '未指定。想定読者を最初に確認する / not specified - confirm first')}

## 手順 / Steps

1. \`get_deliverable\` を \`deliverable="${deliverable}"\` で呼び、目的・記載項目・作成のコツを確認する。
   見つからなければ \`list_deliverables\` または \`search_togaf\` で近いものを 3 件提示し、選ばせる。
2. \`generate_deliverable_template\` で Markdown 雛形を取得し、章立てのベースにする。
3. \`get_engagement\` と \`get_dashboard\` で、埋められる実データ(決定事項・リスク・ステークホルダー・進捗)を集める。
4. 雛形の各節を、次の 3 状態のいずれかで埋める。
   - **確定** — エンゲージメント状態や会話に根拠がある内容。出典を括弧書きで添える。
   - **仮説** — もっともらしい草案。冒頭に「(仮説)」と付け、検証方法を 1 行添える。
   - **要入力** — 埋められないもの。「誰に何を聞けば埋まるか」を必ず書く。空白にはしない。

## 出力構成 / Output

1. **文書ヘッダ** — 版数 / 作成者 / 日付 / レビュー者 / 承認者 の表。
2. **本文** — 雛形の章立てに沿った Markdown。各節の冒頭に 1 行のねらいを書く。
3. **未確定事項の一覧** — 表(節 / 不足情報 / 確認先 / 期限目安)。
4. **レビュー依頼メモ** — 誰に何を見てほしいか 3 点。

## 品質基準 / Quality bar

- 図が要る箇所は、図を描く代わりに「何を軸に何を配置する図か」を文章で定義する。
- 数値・固有名詞をでっち上げない。無い場合は「要入力」に落とす。
- 1 節が 400 字を超えたら分割を検討する。読み手はレビュー会議で流し読みする前提で書く。

${TOOL_NOTE}
${HOUSE_RULES}
`),
  );

  // --- 8. 週次ステータス -----------------------------------------------------
  server.registerPrompt(
    'weekly_status',
    {
      title: '週次ステータス報告 / Weekly status report',
      description:
        'エンゲージメント状態から週次の進捗報告を組み立てる。 / Assemble a weekly status report from the engagement state.',
      argsSchema: {
        period: z
          .string()
          .optional()
          .describe('対象期間(任意)。例: 2026-08-04 〜 2026-08-08 / Optional reporting period'),
        audience: z
          .string()
          .optional()
          .describe('報告先(任意)。例: ステアリングコミッティ / Optional audience'),
      },
    },
    ({ period, audience }) =>
      promptResult(`
週次の進捗報告を作ってください。読み手が 2 分で状況を把握し、必要な判断だけを迫られる形にします。
Assemble the weekly status report so the reader grasps the situation in two minutes.

対象期間 / Period: ${orElse(period, '直近 1 週間 / the past week')}
報告先 / Audience: ${orElse(audience, 'プロジェクト運営会議 / steering meeting')}

## 手順 / Steps

1. \`get_dashboard\` を呼び(Markdown が返る)、フェーズ進捗・リスク・決定・アクションの現状を取得する。
2. \`get_engagement\` で、期限が近い/超過しているアクションと、未解決の決定事項を抽出する。
3. 前週分の報告が会話にあれば差分を取り、無ければ「初回のためベースライン」と明記する。

## 出力構成 / Output

1. **今週のヘッドライン** — 1 文。今週いちばん重要な事実だけ。
2. **ステータス** — 全体 緑/黄/赤 と、先週からの変化(↑ → ↓)。色が変わった場合は理由を 1 行。
3. **進捗** — 表(フェーズ / ステータス / 今週やったこと / 完了率)。ダッシュボードの値を使う。
4. **完了したこと** — 箇条書き 3〜5 件。成果物名と、それが何を可能にしたかをセットで。
5. **来週やること** — 箇条書き 3〜5 件。担当と完了条件つき。
6. **課題・リスクの変化** — 新規 / 悪化 / 解消 に分けて記載。各行に対応と責任者。
7. **期限超過アクション** — 表(アクション / 担当 / 当初期限 / 遅延日数 / 復旧見込み)。0 件なら「なし」と明記。
8. **判断・支援のお願い** — 1〜3 件。誰に何を、いつまでに。無ければ「今週はなし」と書く。

## 書き方の制約 / Style

- 「順調です」だけの行を書かない。順調なら、何がどこまで進んだかを数字で書く。
- 悪い情報を末尾に隠さない。悪化した項目は 2 番目のセクションまでに出す。
- 全体で 500 字以内を目安にし、詳細は付録として別セクションに分ける。

最後に、報告内容に合わせて \`update_engagement\` でアクションのステータスを更新する案を提示してください。

${TOOL_NOTE}
${HOUSE_RULES}
`),
  );
}
