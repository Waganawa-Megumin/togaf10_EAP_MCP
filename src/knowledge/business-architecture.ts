/**
 * ビジネスアーキテクチャ実務の知識ベース / Business architecture practice knowledge base.
 *
 * ADM フェーズ B は「ビジネスアーキテクチャを作れ」とは言うが、作り方の手順までは示さない。
 * ここでは能力(ケイパビリティ)マップ、バリューストリーム、クロスマッピングを
 * 「手を動かせる粒度」で扱うための独自手順・独自判断基準を収録する。
 *
 * 収録内容はすべて筆者の実務観点による独自記述。特定の標準・書籍の文章や定義は転載しない。
 * 参照能力セットは「多くの組織に共通して現れる型」を独自に整理したものであり、
 * 特定のリファレンスモデルの写しではない。
 *
 * Original practitioner-oriented method notes. No text from any standard or body of
 * knowledge is reproduced here; the reference capability set is an independently
 * assembled set of commonly recurring shapes, not a copy of any published model.
 */

import type { Bilingual } from './types.js';

// ---------------------------------------------------------------------------
// 型定義 / Types
// ---------------------------------------------------------------------------

/** 能力階層のレベル / A level in the capability hierarchy. */
export interface CapabilityLevelGuide {
  /** 'L1' | 'L2' | 'L3' */
  id: 'L1' | 'L2' | 'L3';
  name: Bilingual;
  /** 粒度の目安 */
  granularity: Bilingual;
  /** 件数の目安 */
  countHint: Bilingual;
  /** 命名の形 */
  naming: Bilingual;
  /** 例(同じ系統を L1→L3 で並べる) */
  examples: Bilingual[];
  /** 粗すぎの判定基準 */
  tooCoarse: Bilingual[];
  /** 切りすぎの判定基準 */
  tooFine: Bilingual[];
  /** このレベルの使い道 */
  usedFor: Bilingual[];
}

/** 手順の 1 ステップ / One step of a method. */
export interface MethodStep {
  no: number;
  name: Bilingual;
  /** このステップで何をするのか */
  what: Bilingual;
  /** 具体的な進め方 */
  how: Bilingual[];
  /** アウトプット(次のステップの入力になる形) */
  output: Bilingual;
  /** 失敗パターン */
  failure: Bilingual;
  /** 所要時間の目安 */
  effort: Bilingual;
}

/** 手順 / A method. */
export interface Method {
  id: string;
  name: Bilingual;
  /** この手順のゴール */
  goal: Bilingual;
  /** 始める前に揃えるもの */
  prerequisites: Bilingual[];
  steps: MethodStep[];
  /** 完了判定(これが言えたら終わり) */
  doneWhen: Bilingual[];
}

/** クロスマッピングの読み方 1 件 / One reading rule for a cross map. */
export interface CrossReading {
  /** 見えたパターン */
  pattern: Bilingual;
  /** 疑うこと */
  suspect: Bilingual;
  /** 次の一手 */
  action: Bilingual;
}

/** クロスマッピング / A cross map between two dimensions. */
export interface CrossMapping {
  id: 'capability-value-stream' | 'capability-organization' | 'capability-application';
  name: Bilingual;
  /** 何のために作るのか */
  purpose: Bilingual;
  rowsLabel: Bilingual;
  columnsLabel: Bilingual;
  /** セルに何を書くか */
  cellMeaning: Bilingual;
  /** 記号の凡例 */
  legend: Bilingual[];
  /** 埋めるときの注意 */
  fillingTips: Bilingual[];
  /** 埋めた後の読み方 */
  readings: CrossReading[];
}

/** 参照能力の分類 / Grouping of a reference capability. */
export type CapabilityGroup = 'core' | 'enabling' | 'governing';

/** 参照用のレベル 1 能力 / A reference level-1 capability. */
export interface ReferenceCapability {
  id: string;
  name: Bilingual;
  group: CapabilityGroup;
  /** ほぼどの組織にも存在する能力か */
  universal: boolean;
  /** 短い定義(独自表現) */
  definition: Bilingual;
  /** 代表的な L2 */
  typicalL2: Bilingual[];
  /** この能力が弱い組織で起きること */
  weakSigns: Bilingual[];
  /** 事業側に問うべき質問 */
  probes: Bilingual[];
  /** 事業説明にこの語が出たら重点候補、という手がかり(小文字) */
  triggers: string[];
}

/** アンチパターン / An anti-pattern. */
export interface BusinessArchitectureAntiPattern {
  id: string;
  name: Bilingual;
  /** 見た目の症状 */
  symptom: Bilingual;
  /** なぜ困るのか */
  consequence: Bilingual;
  /** 直し方 */
  fix: Bilingual;
}

/** 命名チェック用の語彙 / Lexicon used by the naming checker. */
export interface NamingLexicon {
  /** 日本語の動詞末尾 */
  verbSuffixJa: string[];
  /** 英語の動詞始まり */
  verbPrefixEn: string[];
  /** 組織・部署を示す語(名前のどこに出ても組織名とみなす) */
  orgWordsJa: string[];
  /**
   * 組織単位を示す「語尾」(名前の末尾に来たときだけ組織名とみなす)。
   * 「課」「部」などは 1 文字で、部分一致にすると「課金管理」「一部委託」まで拾ってしまうため分離する。
   */
  orgSuffixJa: string[];
  orgWordsEn: string[];
  /** IT 実装を示す語 */
  itWordsJa: string[];
  itWordsEn: string[];
  /** 2 つの能力が接続詞で繋がっている疑い */
  conjunctionsJa: string[];
  conjunctionsEn: string[];
  /** 能力名として意味を持たない語(単独で使うと粗すぎ) */
  vagueWordsJa: string[];
  vagueWordsEn: string[];
}

// ---------------------------------------------------------------------------
// 1. 能力の階層 / Capability levels
// ---------------------------------------------------------------------------

export const CAPABILITY_LEVELS: CapabilityLevelGuide[] = [
  {
    id: 'L1',
    name: { ja: 'レベル 1(経営が読む層)', en: 'Level 1 — the layer executives read' },
    granularity: {
      ja: '会社を「何ができる組織か」で言い切る層。事業を止めたら困るものが並ぶ。組織が変わっても、売り方が変わっても、名前が変わらない粒度。',
      en: 'The layer that states what the organisation is able to do at all. Everything here would hurt if it stopped. Names at this level survive reorganisations and changes of sales model.',
    },
    countHint: { ja: '15〜25 件。30 を超えたら束ね直す。10 を切ったら抽象的すぎる。', en: '15–25 items. Over 30, re-bundle. Under 10, it is too abstract to act on.' },
    naming: {
      ja: '名詞句。「〜管理」「〜提供」「〜創出」で終わる形が安定する。動詞・部署名・システム名は入れない。',
      en: 'A noun phrase. Forms ending in "management", "delivery", or "generation" are stable. No verbs, department names, or system names.',
    },
    examples: [
      { ja: '顧客管理 / 供給・物流 / 財務・経理', en: 'Customer Management / Supply & Logistics / Finance & Accounting' },
    ],
    tooCoarse: [
      { ja: '「営業」「管理」のように、社内の誰に聞いても違うものを想像する語で止まっている。', en: 'Stops at words like "sales" or "administration" where two colleagues would picture different things.' },
      { ja: '1 件の能力に部長が 5 人ぶら下がる。', en: 'A single capability has five different senior owners underneath it.' },
      { ja: '下に L2 を書こうとすると 20 件以上出てくる。', en: 'Trying to write the L2s underneath produces more than twenty items.' },
    ],
    tooFine: [
      { ja: '特定の商材・特定チャネルの名前が入っている(「法人向け新規開拓」)。', en: 'A specific product line or channel appears in the name ("new enterprise account hunting").' },
      { ja: '来年の組織変更で消える可能性がある。', en: 'It could disappear in next year\'s reorganisation.' },
      { ja: '同じ言葉が別の L1 の下にも現れる。', en: 'The same wording also appears under another L1.' },
    ],
    usedFor: [
      { ja: '投資配分の会話(どの能力に金を入れるか)', en: 'Investment allocation conversations — which capability gets funded' },
      { ja: 'ロードマップの束ね単位', en: 'The bundling unit for the roadmap' },
      { ja: '全社ヒートマップ(重要度 × 成熟度)の行', en: 'Rows of the enterprise heat map (importance × maturity)' },
    ],
  },
  {
    id: 'L2',
    name: { ja: 'レベル 2(投資判断が付く層)', en: 'Level 2 — the layer where funding decisions land' },
    granularity: {
      ja: 'L1 を「独立して強化できる塊」に割った層。ひとつの L2 に対して、担当役員が 1 人・予算が 1 本・改善施策が 1〜3 本、という対応が付く。',
      en: 'The split of an L1 into chunks that can be improved independently. Each L2 should map to one accountable executive, one budget line, and one to three improvement initiatives.',
    },
    countHint: { ja: '1 つの L1 につき 3〜7 件。全社で 80〜150 件が目安。', en: '3–7 per L1; 80–150 across the enterprise.' },
    naming: { ja: 'L1 の語を繰り返さない。「顧客管理 > 顧客管理企画」は情報量ゼロ。', en: 'Do not echo the L1 wording. "Customer Management > Customer Management Planning" carries no information.' },
    examples: [
      { ja: '顧客管理 > 顧客情報統合 / 顧客セグメンテーション / 顧客接点履歴管理', en: 'Customer Management > Customer Data Consolidation / Segmentation / Interaction History' },
    ],
    tooCoarse: [
      { ja: '評価(重要度・成熟度)を付けようとすると「部分によって違う」と言われる。', en: 'When you try to score importance or maturity, people answer "it depends which part".' },
      { ja: '改善施策を紐づけると 10 本以上ぶら下がる。', en: 'More than ten initiatives attach to it.' },
    ],
    tooFine: [
      { ja: '作業手順(承認する、入力する)になっている。それはプロセスであって能力ではない。', en: 'It has become a work step (approve, enter). That is a process, not a capability.' },
      { ja: '1 人の担当者の仕事そのものになっている。', en: 'It describes exactly one person\'s job.' },
    ],
    usedFor: [
      { ja: '重要度 × 成熟度の評価単位', en: 'The unit scored for importance × maturity' },
      { ja: '施策・作業パッケージの紐づけ先', en: 'The anchor for initiatives and work packages' },
      { ja: '能力 × 組織 / 能力 × アプリのクロスマッピングの行', en: 'Rows of the capability × organisation and capability × application cross maps' },
    ],
  },
  {
    id: 'L3',
    name: { ja: 'レベル 3(必要な枝だけ掘る層)', en: 'Level 3 — dig only the branches that need it' },
    granularity: {
      ja: '実際に設計・自動化・外注の判断をする直前まで下ろした層。全社を均等に L3 まで割ってはいけない。「今期投資する L2」の下だけ掘る。',
      en: 'Detailed enough to decide design, automation, or outsourcing. Never split the whole enterprise to L3 uniformly — dig only under the L2s you are funding this period.',
    },
    countHint: { ja: '掘った L2 につき 3〜8 件。全社の 8 割の L2 は L3 を持たなくてよい。', en: '3–8 under each L2 you dig. Eighty percent of L2s should have no L3 at all.' },
    naming: { ja: '扱う対象(何を)と成果(どうなる)が読み取れる名詞句にする。', en: 'A noun phrase from which both the object and the outcome can be read.' },
    examples: [
      { ja: '顧客情報統合 > 名寄せルール運用 / 重複検知 / 統合 ID 発番', en: 'Customer Data Consolidation > Matching Rule Operation / Duplicate Detection / Golden ID Issuance' },
    ],
    tooCoarse: [
      { ja: 'L2 と区別が付かず、名前を並べても議論が進まない。', en: 'Indistinguishable from the L2 — listing them moves no conversation forward.' },
    ],
    tooFine: [
      { ja: '画面名・帳票名・システム機能名になっている。', en: 'It has become a screen name, a form name, or a system function name.' },
      { ja: '担当者が変わると名前ごと変わる。', en: 'The name changes when the person doing it changes.' },
    ],
    usedFor: [
      { ja: '自動化 / 外注 / 内製の判断', en: 'Automate, outsource, or keep in-house decisions' },
      { ja: '要件定義の入口', en: 'The entry point to requirements definition' },
      { ja: '個別の作業パッケージのスコープ確定', en: 'Fixing the scope of an individual work package' },
    ],
  },
];

// ---------------------------------------------------------------------------
// 2. 能力マップの作り方 / Capability map method
// ---------------------------------------------------------------------------

export const CAPABILITY_METHOD: Method = {
  id: 'capability-map',
  name: { ja: '能力マップの作り方(8 ステップ)', en: 'Building a capability map — 8 steps' },
  goal: {
    ja: '「何に投資すべきか」を経営と同じ 1 枚で話せる状態にする。網羅した図を作ることではなく、投資判断が動くことがゴール。',
    en: 'Reach a state where you and the executives argue about investment on the same single page. The goal is a decision that moves, not a complete-looking diagram.',
  },
  prerequisites: [
    { ja: '使い道を 1 つに決める(投資判断 / 重複の可視化 / M&A 統合 / 組織再編のいずれか)。決めないと粒度が決まらない。', en: 'Pick exactly one use (investment decisions, duplication, M&A integration, or reorganisation). Granularity cannot be chosen without it.' },
    { ja: '意思決定者を 1 人特定する。この人が「これでよい」と言えば版が固まる。', en: 'Identify one decision maker whose "good enough" freezes the version.' },
    { ja: '直近の中期計画・事業説明資料・組織図・主要な業務一覧を手元に置く。', en: 'Have the mid-term plan, business overview decks, org chart, and a list of major operations at hand.' },
  ],
  steps: [
    {
      no: 1,
      name: { ja: '使い道と範囲を先に固定する', en: 'Fix the use and the scope first' },
      what: {
        ja: '何のために作るのか、どの事業・どの法人までを対象にするのかを 1 行で書き、意思決定者と合意する。',
        en: 'Write in one line why the map is being built and which businesses or legal entities are in scope, and agree it with the decision maker.',
      },
      how: [
        { ja: '「この map は◯◯の判断に使う」と紙に書く。使い道が 2 つ以上出たら分けて作る。', en: 'Write "this map will be used to decide X" on paper. If two uses appear, build two maps.' },
        { ja: '対象外(子会社・海外拠点など)を明示的に書く。書かないと後で「うちが入っていない」で揉める。', en: 'Explicitly list what is out of scope. Skipping this guarantees a later "we are missing" fight.' },
        { ja: 'いつまでに何回レビューするかを決める(推奨: 2 週間で 3 回)。', en: 'Decide the review cadence up front — three sessions over two weeks works well.' },
      ],
      output: { ja: '1 ページのスコープ合意メモ(使い道 / 対象 / 対象外 / 意思決定者 / レビュー日程)', en: 'A one-page scope memo: use, in scope, out of scope, decision maker, review dates' },
      failure: { ja: '「まず全体像を作ってから考える」で始めてしまい、粒度の基準が無いまま図が肥大化する。', en: 'Starting with "let us draw the whole picture first" — the diagram bloats with no granularity criterion.' },
      effort: { ja: '半日', en: 'Half a day' },
    },
    {
      no: 2,
      name: { ja: '価値の受け手と提供価値を書き出す', en: 'List who receives value and what they receive' },
      what: {
        ja: '対象範囲の中で、誰に何を提供して対価を得ているのかを 5 行以内で書く。能力はこの価値を生むために存在する。',
        en: 'In five lines or fewer, state who is given what, and in return for what. Capabilities exist to produce this value.',
      },
      how: [
        { ja: '受け手を具体名で書く(「顧客」ではなく「量販店のバイヤー」「現場の保守員」)。', en: 'Name receivers concretely — not "the customer" but "the buyer at a mass retailer".' },
        { ja: '各受け手について「これが無いと契約が切れる」ものを 1 つ書く。', en: 'For each receiver, write the one thing whose absence would end the contract.' },
        { ja: '社内向けの受け手(他部門)も 1 つは入れる。支援系能力の根拠になる。', en: 'Include at least one internal receiver — it justifies the enabling capabilities later.' },
      ],
      output: { ja: '受け手 × 提供価値の一覧(5 行以内)', en: 'A list of receivers and the value each receives (five lines max)' },
      failure: { ja: '自社の強みを書いてしまう。ここに書くのは「相手が受け取るもの」だけ。', en: 'Writing your own strengths. Only what the other side receives belongs here.' },
      effort: { ja: '半日', en: 'Half a day' },
    },
    {
      no: 3,
      name: { ja: '一次資料から能力候補を採取する', en: 'Harvest candidate capabilities from primary sources' },
      what: {
        ja: 'ゼロから発想せず、既にある文書から名詞を拾う。中期計画、業務分掌、業務一覧、監査指摘、システム一覧が原料。',
        en: 'Do not brainstorm from zero. Pull nouns out of what already exists: the mid-term plan, the delegation-of-authority document, operation lists, audit findings, and the system inventory.',
      },
      how: [
        { ja: '資料を読みながら、動詞句を見つけたら名詞句に変換して付箋に書く(「在庫を調整する」→「在庫管理」)。', en: 'While reading, convert every verb phrase into a noun phrase on a sticky note ("adjust inventory" → "inventory management").' },
        { ja: '出典を必ず残す。後で「なぜこれが入っているのか」に答えられなくなる。', en: 'Always record the source. Otherwise you cannot answer "why is this here" later.' },
        { ja: '150〜300 枚出るまで止めない。少なすぎると次の束ね方が恣意的になる。', en: 'Keep going until you have 150–300 notes; too few and the bundling that follows becomes arbitrary.' },
      ],
      output: { ja: '出典付きの能力候補リスト(150〜300 件、重複可)', en: 'A candidate list with sources (150–300 items, duplicates allowed)' },
      failure: { ja: 'ワークショップの発想だけで作る。参加者の担当領域が厚くなり、誰も出席しなかった領域が丸ごと消える。', en: 'Sourcing only from a workshop. Attendees\' own areas get thick and unattended areas vanish entirely.' },
      effort: { ja: '2〜3 日', en: '2–3 days' },
    },
    {
      no: 4,
      name: { ja: '名詞句に正規化して重複を潰す', en: 'Normalise to noun phrases and kill duplicates' },
      what: {
        ja: '候補を機械的に整形する。動詞を落とし、部署名・システム名を落とし、同義語をまとめる。ここは創造性を使わない工程。',
        en: 'Clean the candidates mechanically: drop verbs, drop department and system names, merge synonyms. This step needs no creativity.',
      },
      how: [
        { ja: '「〜する」で終わるものを全部名詞化する。', en: 'Turn every verb-form entry into a noun.' },
        { ja: '部署名・システム名が入っているものは、その中の業務内容だけを残す。', en: 'Where a department or system name appears, keep only the underlying work.' },
        { ja: '同義語辞書を作る(「引合」「見込案件」「リード」→ 1 語)。この辞書は後の資産になる。', en: 'Build a synonym table ("lead", "opportunity", "prospect" → one term). The table becomes an asset later.' },
      ],
      output: { ja: '正規化済み候補リスト(60〜120 件)+ 同義語辞書', en: 'A normalised candidate list (60–120 items) plus a synonym table' },
      failure: { ja: '同義語を「どちらも大事だから」と両方残す。以降のクロスマッピングが二重に埋まり、読めなくなる。', en: 'Keeping both synonyms because "both matter". Every later cross map is then double-filled and unreadable.' },
      effort: { ja: '1〜2 日', en: '1–2 days' },
    },
    {
      no: 5,
      name: { ja: 'L1 に束ねる(15〜25 件)', en: 'Bundle into L1s (15–25)' },
      what: {
        ja: '正規化済み候補を、価値の生み方が同じもの同士でまとめて L1 を作る。参考セットは「抜け漏れ確認」にだけ使い、最初から当てはめない。',
        en: 'Group the normalised candidates by how they create value to form L1s. Use a reference set only as a gap check afterwards, never as the starting template.',
      },
      how: [
        { ja: '「中核(価値を直接生む)/支援(中核を回す)/統制(方向と歯止め)」の 3 列に仕分ける。', en: 'Sort into three columns: core (creates value directly), enabling (keeps core running), governing (direction and brakes).' },
        { ja: '各 L1 に 1 行の定義を書く。書けないものは L1 ではない。', en: 'Write a one-line definition for each L1. If you cannot, it is not an L1.' },
        { ja: '最後に参考セットと突き合わせ、「無い」ものについて理由を説明できるか確認する。', en: 'Finally compare against a reference set and check you can explain every absence.' },
      ],
      output: { ja: '3 分類 × L1 一覧(15〜25 件、各 1 行定義付き)', en: 'L1 list in three groups (15–25 items, each with a one-line definition)' },
      failure: { ja: '参考モデルを先に置いて自社を当てはめる。稼ぎ方の独自性が消え、どの会社でも同じ図になる。', en: 'Laying a reference model down first and fitting the company to it. The way this company actually makes money disappears and the map becomes generic.' },
      effort: { ja: '2 日(レビュー 1 回含む)', en: '2 days including one review' },
    },
    {
      no: 6,
      name: { ja: '必要な枝だけ L2 / L3 に割る', en: 'Split only the branches that need it' },
      what: {
        ja: '全社を均等に割らない。使い道(ステップ 1)に効く L1 だけ L2 へ、投資する L2 だけ L3 へ下ろす。',
        en: 'Do not split uniformly. Take only the L1s that serve the agreed use down to L2, and only the funded L2s down to L3.',
      },
      how: [
        { ja: 'L2 は「独立して強化できるか」で切る。切った後、担当役員が 1 人に決まるか確認する。', en: 'Split L2s by "can this be strengthened independently?" then check that exactly one executive owns each.' },
        { ja: 'L1 の語を L2 で繰り返さない。繰り返しが出たら切り方が間違っている。', en: 'Never repeat the L1 wording in an L2. Repetition signals a bad split.' },
        { ja: '深さは 3 階層で止める。4 階層目が欲しくなったら、それはプロセス設計の仕事。', en: 'Stop at three levels. If you want a fourth, the work has become process design.' },
      ],
      output: { ja: '階層付き能力マップ(L1 全件 + 必要箇所の L2 / L3)', en: 'A tiered capability map: all L1s plus L2/L3 where needed' },
      failure: { ja: '全 L1 を機械的に L2 まで割り、300 件の一覧を作って誰も読まない。', en: 'Mechanically splitting every L1 into L2s, producing a 300-item list nobody reads.' },
      effort: { ja: '2〜4 日(範囲による)', en: '2–4 days depending on scope' },
    },
    {
      no: 7,
      name: { ja: '重要度 × 成熟度で評価する', en: 'Score importance × maturity' },
      what: {
        ja: '能力に色を付ける。色が付いて初めて「どこに投資するか」の会話になる。評価対象は L2(L2 が無い枝は L1)。',
        en: 'Colour the map. Only once it is coloured does the investment conversation start. Score at L2, or L1 where no L2 exists.',
      },
      how: [
        { ja: '重要度は「今後 3 年の戦略にどれだけ効くか」を 3 段階で。全部「高」にさせない(高は全体の 1/3 まで、と先に宣言する)。', en: 'Score importance in three levels by impact on the next three years of strategy. Cap "high" at one third of the items and announce the cap before scoring.' },
        { ja: '成熟度は主観で構わないが、根拠に事実を 1 つ添える(手作業の割合、リードタイム、エラー率など)。', en: 'Maturity may be subjective, but attach one fact to each score — manual ratio, lead time, error rate.' },
        { ja: '「重要度が高く成熟度が低い」ものを 5〜8 件に絞る。これが投資候補。', en: 'Narrow "high importance, low maturity" to 5–8 items. These are the investment candidates.' },
      ],
      output: { ja: 'ヒートマップ(重要度 × 成熟度)+ 投資候補 5〜8 件', en: 'A heat map plus 5–8 investment candidates' },
      failure: { ja: '全部が「重要かつ低成熟」になる。優先順位が付かず、資料が飾りになる。', en: 'Everything comes out "important and immature". Nothing is prioritised and the deck becomes decoration.' },
      effort: { ja: '2〜3 日(ヒアリング含む)', en: '2–3 days including interviews' },
    },
    {
      no: 8,
      name: { ja: '版を固めて置き場所と更新規約を決める', en: 'Freeze the version, decide where it lives and how it changes' },
      what: {
        ja: '合意した内容に版番号を付け、置き場所・所有者・更新契機を決める。ここを飛ばすと半年で腐る。',
        en: 'Version the agreed content and decide its home, its owner, and what triggers an update. Skip this and it rots within six months.',
      },
      how: [
        { ja: '能力ごとにオーナー(役職名)を 1 人書く。空欄を残さない。', en: 'Name one owner (by role, not person) per capability. Leave no blanks.' },
        { ja: '更新契機を決める(組織再編時 / 中期計画更新時 / 大型投資の起案時)。定期更新は形骸化しやすいので契機ベースにする。', en: 'Choose event-based triggers — reorganisation, plan refresh, major investment proposal. Calendar-based reviews decay into ritual.' },
        { ja: '次に作る成果物(バリューストリーム、クロスマッピング)への引き渡し方を書く。', en: 'Write how it hands over to the next artefacts — value streams and cross maps.' },
      ],
      output: { ja: '版番号付き能力マップ + オーナー一覧 + 更新規約', en: 'A versioned capability map with an owner list and change rules' },
      failure: { ja: '「合意した」だけで置き場所を決めず、各人のローカルに枝分かれした版が増える。', en: 'Declaring agreement without a home. Divergent local copies multiply.' },
      effort: { ja: '半日', en: 'Half a day' },
    },
  ],
  doneWhen: [
    { ja: '意思決定者が、投資候補 5〜8 件を指差して優先順位を言える。', en: 'The decision maker can point at 5–8 investment candidates and rank them.' },
    { ja: '任意の能力について、オーナーの役職名が即答できる。', en: 'For any capability, the owning role can be named immediately.' },
    { ja: '「この能力が無い理由」を説明できる(意図的に対象外にしたものが明示されている)。', en: 'You can explain every absence — deliberate exclusions are written down.' },
    { ja: '同じ図で 2 部門が別々の会議に使っている。', en: 'Two different departments are using the same picture in their own meetings.' },
  ],
};

// ---------------------------------------------------------------------------
// 3. バリューストリームの作り方 / Value stream method
// ---------------------------------------------------------------------------

export const VALUE_STREAM_METHOD: Method = {
  id: 'value-stream',
  name: { ja: 'バリューストリームの作り方(価値の受け手から遡る 7 ステップ)', en: 'Building a value stream — 7 steps, working backwards from the receiver' },
  goal: {
    ja: '「誰にとって、何が終われば価値なのか」を先に決め、そこから逆算して段を並べる。業務フローを写経するのではなく、価値が増える単位で切る。',
    en: 'Decide first for whom and at what moment value exists, then lay out the stages backwards from there. Not a transcription of the workflow — a split by increments of value.',
  },
  prerequisites: [
    { ja: '能力マップの L1 が仮でも存在する(後で紐づけるため)。', en: 'A draft L1 capability map exists, for later linking.' },
    { ja: '受け手側の生の声(インタビュー・問い合わせ・解約理由)が数件手元にある。', en: 'A handful of raw receiver-side inputs: interviews, inbound questions, churn reasons.' },
  ],
  steps: [
    {
      no: 1,
      name: { ja: '受け手を 1 人に絞る', en: 'Narrow to a single receiver' },
      what: {
        ja: '価値を受け取る相手を 1 種類に決める。複数を同時に扱うと段の切り方が混ざり、どの段も曖昧になる。',
        en: 'Choose exactly one kind of receiver. Handling several at once mixes the staging logic and blurs every stage.',
      },
      how: [
        { ja: '「新規の法人購買担当」「既存契約の現場管理者」のように、状態まで含めて書く。', en: 'Write the state as well as the role: "a first-time corporate buyer", "an on-site manager under an existing contract".' },
        { ja: '社内受け手(例: 営業部門)を選んでもよい。支援系の流れを描くときはむしろ自然。', en: 'An internal receiver (e.g. the sales function) is a legitimate choice, and natural when describing enabling flows.' },
        { ja: '受け手が 3 種類以上出たら、バリューストリームを 3 本作ると決める。', en: 'If three receivers appear, decide to build three separate streams.' },
      ],
      output: { ja: '受け手の定義 1 行', en: 'A one-line receiver definition' },
      failure: { ja: '「顧客」で始めてしまう。新規と既存では価値の順序が違うため、段が破綻する。', en: 'Starting with "the customer". New and existing receivers value things in different orders and the staging collapses.' },
      effort: { ja: '30 分', en: '30 minutes' },
    },
    {
      no: 2,
      name: { ja: '終了状態を先に書く', en: 'Write the end state first' },
      what: {
        ja: '受け手が「終わった、価値を得た」と言える瞬間を、観測可能な言葉で定義する。ここが決まらないと段は並べられない。',
        en: 'Define, in observable terms, the moment the receiver would say they got what they came for. Nothing can be staged until this is fixed.',
      },
      how: [
        { ja: '「導入した」ではなく「現場が使い始め、月次で成果を報告できている」のように状態で書く。', en: 'Write a state, not an act: not "it was installed" but "the site is using it and reporting monthly results".' },
        { ja: '受け手側が確認できる事実で書く。社内の完了ステータスは使わない。', en: 'Use facts the receiver can verify. Internal completion statuses do not count.' },
        { ja: '「これが起きたら失敗」も 1 行書く。段の設計時に効く。', en: 'Also write one line for "this means it failed" — it pays off when designing stages.' },
      ],
      output: { ja: '終了状態(1 行)+ 失敗状態(1 行)', en: 'One line for the end state and one for the failure state' },
      failure: { ja: '終了状態が自社都合(契約締結、検収)になる。以降の改善が全部「早く売る」方向に歪む。', en: 'An end state stated in the seller\'s terms (contract signed, acceptance passed). Every later improvement then bends toward "sell faster".' },
      effort: { ja: '1 時間', en: '1 hour' },
    },
    {
      no: 3,
      name: { ja: '終了状態から遡って段を並べる', en: 'Lay out the stages backwards from the end state' },
      what: {
        ja: '「その直前に何が成立していなければならないか」を繰り返し問い、段を後ろから前へ並べる。前から書くと現行フローの写しになる。',
        en: 'Repeatedly ask "what must already be true immediately before this?" and lay the stages back to front. Writing forwards produces a copy of the current workflow.',
      },
      how: [
        { ja: '段は 5〜8 個に収める。10 を超えたらプロセスを書いている。', en: 'Keep to 5–8 stages. Beyond ten you are writing a process.' },
        { ja: '段の名前は受け手の状態変化にする(「知る」「比べる」「決める」「使える」「効果が出る」)。', en: 'Name stages after changes in the receiver\'s state: aware, comparing, decided, using, benefiting.' },
        { ja: '社内の承認や部門移管を段にしない。それは価値ではなく待ち時間。', en: 'Never make an internal approval or handoff a stage. That is wait time, not value.' },
      ],
      output: { ja: '5〜8 段のバリューストリーム(名前だけ)', en: 'A 5–8 stage value stream (names only)' },
      failure: { ja: '既存の業務フロー図を段に置き換えるだけになり、部門の壁がそのまま図に残る。', en: 'Merely renaming an existing workflow diagram, so the departmental walls survive into the picture.' },
      effort: { ja: '半日', en: 'Half a day' },
    },
    {
      no: 4,
      name: { ja: '各段の入口・出口・価値の増分を書く', en: 'Define entry, exit, and the value added per stage' },
      what: {
        ja: '段ごとに「入ってくる条件」「出ていく条件」「ここで受け手にとって何が増えたか」を 1 行ずつ書く。増分が書けない段は削る。',
        en: 'For each stage write one line each for entry condition, exit condition, and what the receiver gained. Delete any stage whose gain cannot be written.',
      },
      how: [
        { ja: '出口条件は次の段の入口条件と一致させる。ずれていたら段が抜けている。', en: 'The exit of one stage must equal the entry of the next. A mismatch means a missing stage.' },
        { ja: '増分は受け手の言葉で書く(「選択肢が絞れた」「不安が消えた」)。', en: 'State the gain in the receiver\'s words: "options narrowed", "worry removed".' },
        { ja: '増分が社内効率(「入力が楽になった」)なら、それは段ではなく改善施策。', en: 'If the gain is internal efficiency, it is an improvement item, not a stage.' },
      ],
      output: { ja: '段 × (入口 / 出口 / 価値増分)の表', en: 'A table of stages against entry, exit, and value added' },
      failure: { ja: '増分が全段「情報が更新された」になる。段が価値ではなく処理で切られている証拠。', en: 'Every stage gains "information updated" — proof the stages were cut by processing, not by value.' },
      effort: { ja: '1 日', en: '1 day' },
    },
    {
      no: 5,
      name: { ja: '段に能力を紐づける', en: 'Link capabilities to stages' },
      what: {
        ja: '各段を成立させるために必要な能力(L1 または L2)を紐づける。ここで能力マップとバリューストリームが 1 枚に繋がる。',
        en: 'Attach the capabilities (L1 or L2) required to make each stage happen. This is where the capability map and the value stream become one picture.',
      },
      how: [
        { ja: '1 段につき 2〜5 能力。10 個ぶら下がる段は切り方が粗い。', en: 'Two to five capabilities per stage. A stage with ten attached is cut too coarsely.' },
        { ja: '主要(その段の成否を決める)と補助を区別する。後の投資判断で効く。', en: 'Distinguish the decisive capability from supporting ones — it matters at investment time.' },
        { ja: 'どの段からも参照されない能力に印を付ける。統制系以外なら存在理由を確認する。', en: 'Flag capabilities referenced by no stage. Unless they are governing ones, question why they exist.' },
      ],
      output: { ja: '能力 × バリューストリーム段のクロスマッピング(初版)', en: 'A first version of the capability × value-stream-stage cross map' },
      failure: { ja: '全能力を全段に紐づけて真っ黒な表になる。何も読めない。', en: 'Linking every capability to every stage. The matrix goes black and says nothing.' },
      effort: { ja: '半日', en: 'Half a day' },
    },
    {
      no: 6,
      name: { ja: '現状の詰まりを測る', en: 'Measure where it clogs today' },
      what: {
        ja: '段ごとに、所要時間・手戻り率・離脱率のいずれかを実測する。推測で色を塗らない。',
        en: 'Measure one of elapsed time, rework rate, or drop-off per stage. Do not colour the picture with guesses.',
      },
      how: [
        { ja: '完璧な計測を待たない。10 件のサンプル実測でも意思決定は動く。', en: 'Do not wait for perfect instrumentation. Ten sampled cases already move a decision.' },
        { ja: '実作業時間と待ち時間を分けて測る。多くの場合、待ちが 8 割を占める。', en: 'Separate hands-on time from wait time. Wait usually accounts for most of it.' },
        { ja: '手戻りが起きた段ではなく、原因が作られた段を記録する。', en: 'Record the stage where the cause was created, not the stage where the rework surfaced.' },
      ],
      output: { ja: '段別のリードタイム / 手戻り / 離脱の実測値', en: 'Measured lead time, rework, and drop-off per stage' },
      failure: { ja: '「感覚では 2 週間くらい」で進める。改善後の効果測定ができず、成果が主張できない。', en: 'Proceeding on "it feels like two weeks". You cannot measure the improvement afterwards and cannot claim the win.' },
      effort: { ja: '3〜5 日', en: '3–5 days' },
    },
    {
      no: 7,
      name: { ja: '改善対象の段を選び、能力の弱点に接続する', en: 'Pick the stage to fix and connect it to a capability weakness' },
      what: {
        ja: '最も詰まっている段を 1〜2 個選び、その段の主要能力の成熟度評価と突き合わせて、施策の対象を確定する。',
        en: 'Choose the one or two most clogged stages, cross-check the maturity of their decisive capabilities, and fix the target of the initiative.',
      },
      how: [
        { ja: '詰まりの原因が能力側にあるのか、単なる要員不足かを分ける。後者はアーキテクチャの仕事ではない。', en: 'Separate a capability weakness from plain understaffing. The latter is not architecture work.' },
        { ja: '選んだ段の改善目標を数値で書く(リードタイム 12 日 → 5 日)。', en: 'Write a numeric target for the chosen stage (lead time 12 days → 5).' },
        { ja: '施策を作業パッケージとしてロードマップに渡す。', en: 'Hand the initiative to the roadmap as a work package.' },
      ],
      output: { ja: '改善対象の段 1〜2 件 + 数値目標 + 紐づく能力', en: 'One or two target stages with numeric goals and the linked capabilities' },
      failure: { ja: '全段を同時に改善しようとして、どの段も中途半端に終わる。', en: 'Attacking every stage at once and finishing none of them.' },
      effort: { ja: '1 日', en: '1 day' },
    },
  ],
  doneWhen: [
    { ja: '受け手の言葉で「何が終われば価値か」を 1 行で言える。', en: 'You can state in one line, in the receiver\'s words, when value has been delivered.' },
    { ja: '各段に実測値が 1 つ以上入っている。', en: 'Every stage carries at least one measured number.' },
    { ja: '改善対象の段が 1〜2 件に絞られ、数値目標が付いている。', en: 'One or two target stages are chosen and carry numeric goals.' },
    { ja: 'どの段からも参照されない能力の扱いが決まっている。', en: 'Capabilities referenced by no stage have an agreed disposition.' },
  ],
};

// ---------------------------------------------------------------------------
// 4. クロスマッピング / Cross mappings
// ---------------------------------------------------------------------------

export const CROSS_MAPPING: CrossMapping[] = [
  {
    id: 'capability-value-stream',
    name: { ja: '能力 × バリューストリーム', en: 'Capability × Value stream' },
    purpose: {
      ja: '「その能力は誰の価値に効いているのか」を強制的に問う表。能力マップだけでは、存在意義の無い能力が残り続ける。',
      en: 'A matrix that forces the question "whose value does this capability serve?". A capability map alone lets purposeless capabilities survive.',
    },
    rowsLabel: { ja: '能力(L1 または L2)', en: 'Capability (L1 or L2)' },
    columnsLabel: { ja: 'バリューストリームの段', en: 'Value stream stage' },
    cellMeaning: { ja: 'その段の成否に、その能力がどれだけ効くか', en: 'How much this capability determines whether this stage succeeds' },
    legend: [
      { ja: '◎ = その段の成否を決める(この能力が弱いと段が止まる)', en: '◎ = decisive — if it is weak, the stage stalls' },
      { ja: '○ = 支援する(あると速くなるが、無くても段は成立する)', en: '○ = supporting — helps, but the stage can still complete' },
      { ja: '空欄 = 関与しない', en: 'blank = not involved' },
    ],
    fillingTips: [
      { ja: '◎ は 1 段につき 1〜2 個まで、と先に制約を置く。制約が無いと全部 ◎ になる。', en: 'Cap ◎ at one or two per stage before you start. Without the cap everything becomes ◎.' },
      { ja: '埋めるのは事業側と一緒に。EA チームだけで埋めた表は反証されない。', en: 'Fill it with the business, not alone. A matrix filled by the EA team alone never gets challenged.' },
      { ja: '迷ったセルには印ではなく「?」を入れて、後で聞く相手の名前を添える。', en: 'For uncertain cells write "?" plus the name of the person to ask, rather than a mark.' },
    ],
    readings: [
      {
        pattern: { ja: '行が全部空欄の能力がある', en: 'A row is entirely blank' },
        suspect: { ja: '価値に繋がらない能力(過去の名残)か、バリューストリームの本数が足りていない。', en: 'Either a legacy capability with no purpose, or you have not modelled enough value streams.' },
        action: { ja: 'まず別の受け手のバリューストリームを 1 本追加して再確認。それでも空欄なら、廃止・外注の候補として起案する。', en: 'Add one more value stream for a different receiver and recheck. If still blank, propose it for retirement or outsourcing.' },
      },
      {
        pattern: { ja: '列(段)に ◎ が 1 つも無い', en: 'A column (stage) has no ◎ at all' },
        suspect: { ja: 'その段は価値の増分が無く、実際は待ち時間・承認である。', en: 'That stage adds no value and is really wait time or an approval.' },
        action: { ja: '段の定義に戻り、価値増分が書けるか確認する。書けなければ段を統合する。', en: 'Return to the stage definition and try to write the value gain. If you cannot, merge the stage away.' },
      },
      {
        pattern: { ja: '1 つの能力に ◎ が 5 個以上並ぶ', en: 'One capability carries five or more ◎' },
        suspect: { ja: '能力の粒度が粗い。単一障害点になっている可能性も高い。', en: 'The capability is too coarse — and it is probably a single point of failure.' },
        action: { ja: 'その能力を L2 に割ってから再度マッピングする。同時に、その能力の成熟度評価を最優先で確認する。', en: 'Split it into L2s and remap. In parallel, make its maturity assessment the top priority.' },
      },
      {
        pattern: { ja: '成熟度が低い能力に ◎ が集中している', en: '◎ marks cluster on a low-maturity capability' },
        suspect: { ja: '事業の伸びが、そこで頭打ちになっている。', en: 'This is where growth is capped today.' },
        action: { ja: '最優先の投資候補として起案する。バリューストリームの実測リードタイムを根拠に添える。', en: 'Propose it as the top investment candidate, backed by the measured stage lead time.' },
      },
      {
        pattern: { ja: '表全体が印で埋まっている', en: 'The whole matrix is marked' },
        suspect: { ja: '判定基準が曖昧なまま埋めた。「関係がある」ではなく「成否を決めるか」で判定していない。', en: 'It was filled without criteria — "related to" instead of "determines the outcome".' },
        action: { ja: '◎ の定義を「この能力が今日止まったら、この段は今日止まるか」に言い換えて全セルを再判定する。', en: 'Restate ◎ as "if this capability stopped today, would this stage stop today?" and re-score every cell.' },
      },
    ],
  },
  {
    id: 'capability-organization',
    name: { ja: '能力 × 組織', en: 'Capability × Organisation' },
    purpose: {
      ja: '責任の空白と重複を炙り出す表。組織図を能力に写すのではなく、能力に対して誰が責任を持つかを問う。',
      en: 'A matrix that exposes gaps and overlaps in accountability. Not a projection of the org chart onto capabilities, but the question of who is answerable for each.',
    },
    rowsLabel: { ja: '能力(L2 推奨)', en: 'Capability (L2 recommended)' },
    columnsLabel: { ja: '組織単位(部門・機能)', en: 'Organisational unit' },
    cellMeaning: { ja: 'その組織がその能力に対して持つ役割', en: 'The role this unit plays for this capability' },
    legend: [
      { ja: 'A = 責任を持つ(結果を問われる。1 能力に 1 つだけ)', en: 'A = accountable — answers for the outcome; exactly one per capability' },
      { ja: 'R = 実行する(手を動かす。複数可)', en: 'R = performs the work; several allowed' },
      { ja: 'C = 相談を受ける(判断に関与)', en: 'C = consulted on decisions' },
      { ja: '空欄 = 関与しない', en: 'blank = not involved' },
    ],
    fillingTips: [
      { ja: 'A は必ず 1 つ。2 つ書きたくなったら、能力を割るか、責任分界を決める会議を設定する。', en: 'Exactly one A. If you want two, either split the capability or schedule the meeting that settles the boundary.' },
      { ja: '「兼務で実質 1 人」も正直に書く。属人化のリスクがそのまま見える。', en: 'Record "one person wearing three hats" honestly — key-person risk becomes visible for free.' },
      { ja: '組織名は正式名称ではなく機能名で書くと、組織再編後も使える。', en: 'Label columns by function rather than formal unit name so the matrix survives reorganisation.' },
    ],
    readings: [
      {
        pattern: { ja: 'A が空欄の行がある', en: 'A row has no A' },
        suspect: { ja: '誰も責任を持っていない能力。事故が起きるまで放置される典型。', en: 'A capability nobody answers for — the classic one that is ignored until an incident.' },
        action: { ja: '「今このまま障害が起きたら誰が呼ばれるか」を聞き、その人の役職を A に入れて合意を取る。', en: 'Ask "if this broke right now, who gets called?" and make that role the A, with agreement.' },
      },
      {
        pattern: { ja: '1 行に R が 4 つ以上', en: 'A row has four or more R' },
        suspect: { ja: '同じ能力を各部門が別々に実行している(重複投資・仕様の分岐)。', en: 'Each unit is doing the same thing separately — duplicated investment and diverging rules.' },
        action: { ja: '同じ能力を支えるアプリを能力 × アプリの表で確認し、統合可否を判断する。', en: 'Check the same capability in the capability × application matrix and judge whether consolidation is viable.' },
      },
      {
        pattern: { ja: '1 つの組織列に A が集中している', en: 'One column holds most of the A marks' },
        suspect: { ja: '権限集中。その部門が変革のボトルネックになる。', en: 'Concentrated authority — that unit will be the bottleneck of the transformation.' },
        action: { ja: 'その部門の負荷を前提に移行計画の順序を組み直す。並行実行できないことを計画に明示する。', en: 'Rebuild the migration sequence around that unit\'s capacity and state explicitly what cannot run in parallel.' },
      },
      {
        pattern: { ja: '中核能力の A が支援部門にある', en: 'A core capability is accountable to a support function' },
        suspect: { ja: '事業責任と能力責任がねじれている。改善提案が事業側に通らない。', en: 'Business accountability and capability accountability are twisted; improvement proposals will not land with the business.' },
        action: { ja: '事業側にオーナーを移すか、共同オーナー体制を明文化する。ガバナンス側の決定事項として記録する。', en: 'Move ownership to the business or write down a joint model, and record it as a governance decision.' },
      },
    ],
  },
  {
    id: 'capability-application',
    name: { ja: '能力 × アプリケーション', en: 'Capability × Application' },
    purpose: {
      ja: 'IT 投資と事業能力の対応を見る表。統廃合の議論を「システムの好き嫌い」から「どの能力を守るか」に引き上げる。',
      en: 'The matrix that ties IT spend to business capability, lifting consolidation debates from system preferences to which capabilities must be protected.',
    },
    rowsLabel: { ja: '能力(L2 推奨)', en: 'Capability (L2 recommended)' },
    columnsLabel: { ja: 'アプリケーション / システム', en: 'Application / system' },
    cellMeaning: { ja: 'そのアプリがその能力をどこまで支えているか', en: 'How far this application supports this capability' },
    legend: [
      { ja: '◎ = 主要な支援(このアプリが止まると能力が止まる)', en: '◎ = primary support — if the app stops, the capability stops' },
      { ja: '○ = 部分的な支援', en: '○ = partial support' },
      { ja: '△ = 表計算・手作業で埋めている', en: '△ = held together by spreadsheets and manual work' },
      { ja: '空欄 = 支援なし', en: 'blank = unsupported' },
    ],
    fillingTips: [
      { ja: '「導入したが使われていない」アプリは印を付けない。台帳ではなく実態を書く。', en: 'Do not mark applications that were bought but are unused. Record reality, not the inventory.' },
      { ja: '△ を正直に書くのがこの表の価値。表計算依存は最大の隠れコスト。', en: 'The value of this matrix is honest △ marks — spreadsheet dependency is the biggest hidden cost.' },
      { ja: '保守費・契約更改時期を列の下に添えておくと、そのまま投資判断に使える。', en: 'Add run cost and renewal date under each column and the matrix feeds the investment decision directly.' },
    ],
    readings: [
      {
        pattern: { ja: '1 つの能力に ◎ が複数ある', en: 'One capability carries several ◎' },
        suspect: { ja: '同じ能力を複数システムが重複して支えている。データの二重管理と不整合が起きている可能性が高い。', en: 'Several systems support the same capability. Duplicated data and inconsistency are likely.' },
        action: { ja: '重複の理由(事業別・地域別・買収由来)を確認し、統合対象か意図的な分離かを判定する。', en: 'Check why (per business, per region, acquired) and decide whether it is a consolidation target or a deliberate split.' },
      },
      {
        pattern: { ja: '重要度が高い能力が △ ばかり', en: 'A high-importance capability shows only △' },
        suspect: { ja: '事業の中核が個人の表計算で支えられている。担当者の退職が事業リスク。', en: 'The core of the business runs on somebody\'s spreadsheet. One resignation is a business risk.' },
        action: { ja: 'リスク登録簿に登録し、暫定対応(手順の文書化・バックアップ担当)と恒久対応を分けて計画する。', en: 'Log it in the risk register and plan interim mitigation (documented steps, a backup owner) separately from the permanent fix.' },
      },
      {
        pattern: { ja: '1 つのアプリ列が多数の能力に ◎ を持つ', en: 'One application column carries ◎ across many capabilities' },
        suspect: { ja: '巨大な単一システムへの依存。刷新時の影響範囲が全社に及び、段階移行が難しい。', en: 'Dependence on one monolith. Any replacement hits the whole enterprise and phased migration is hard.' },
        action: { ja: '能力単位で切り出せる境界を探す。移行はビッグバンではなく能力単位の段階移行として計画する。', en: 'Look for boundaries that can be carved out per capability, and plan capability-by-capability migration rather than a big bang.' },
      },
      {
        pattern: { ja: '空欄の行に高い重要度が付いている', en: 'A blank row has high importance' },
        suspect: { ja: 'IT 投資が届いていない中核能力。競合が自動化していれば差が開き続ける。', en: 'A core capability IT never reached. If competitors automated it, the gap widens every quarter.' },
        action: { ja: 'その能力を対象にした投資案を起案する。まずは小さく検証する範囲を切る。', en: 'Draft an investment proposal for it, starting with a small slice that can be validated quickly.' },
      },
      {
        pattern: { ja: '空欄の行に低い重要度が付いている', en: 'A blank row has low importance' },
        suspect: { ja: '正常。ここに投資しないことが正しい判断であると記録する。', en: 'Healthy. Record that not investing here is the deliberate answer.' },
        action: { ja: '「投資しない」を決定事項として明記する。書いておかないと毎年議論が蒸し返される。', en: 'Write "no investment" down as a decision. Unrecorded, it will be re-argued every year.' },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// 5. 参照能力セット / Reference level-1 capabilities
// ---------------------------------------------------------------------------

export const REFERENCE_CAPABILITIES: ReferenceCapability[] = [
  {
    id: 'customer-management',
    name: { ja: '顧客管理', en: 'Customer Management' },
    group: 'core',
    universal: true,
    definition: { ja: '取引相手が誰であるかを常に一意に把握し、関係の履歴と状態を維持する力。', en: 'Knowing unambiguously who the counterparty is, and keeping the history and state of the relationship intact.' },
    typicalL2: [
      { ja: '顧客情報の統合・名寄せ', en: 'Customer data consolidation and matching' },
      { ja: '顧客セグメンテーション', en: 'Customer segmentation' },
      { ja: '接点履歴の管理', en: 'Interaction history management' },
      { ja: '顧客与信・取引条件管理', en: 'Credit and terms management' },
    ],
    weakSigns: [
      { ja: '同じ会社が別 ID で複数登録され、売上の合計が部門ごとに違う。', en: 'The same company exists under several IDs and each department reports different revenue for it.' },
      { ja: '担当者が変わると過去の経緯が消え、顧客に同じ質問を繰り返す。', en: 'History dies when the account owner changes, and the customer is asked the same questions again.' },
    ],
    probes: [
      { ja: '「顧客数は何社ですか」に、部門をまたいで同じ数字が返ってきますか。', en: 'If you ask "how many customers do we have", do different departments give the same number?' },
      { ja: '1 社あたりの取引全体を 1 画面で見られますか。見られないなら誰が手作業で束ねていますか。', en: 'Can one screen show everything you do with one customer? If not, who assembles it manually?' },
    ],
    triggers: ['顧客', 'customer', 'crm', '会員', 'member', 'subscriber', 'b2b', 'b2c'],
  },
  {
    id: 'product-service-management',
    name: { ja: '商品・サービス管理', en: 'Product & Service Management' },
    group: 'core',
    universal: true,
    definition: { ja: '売り物を定義し、価格・構成・提供条件・廃止までの一生を管理する力。', en: 'Defining what is sold and governing its whole life: price, configuration, terms of supply, and retirement.' },
    typicalL2: [
      { ja: '商品企画・ポートフォリオ管理', en: 'Product planning and portfolio management' },
      { ja: '価格・料金体系管理', en: 'Pricing and rate structure' },
      { ja: '商品マスタ管理', en: 'Product master management' },
      { ja: '販売終了・移行管理', en: 'End-of-sale and migration management' },
    ],
    weakSigns: [
      { ja: '売り物の一覧が誰にも作れず、廃止したはずの商品が受注されている。', en: 'Nobody can produce the list of what is sold, and orders arrive for products meant to be discontinued.' },
      { ja: '価格が営業の裁量で決まり、値引きの実態が集計できない。', en: 'Prices are set at each rep\'s discretion and actual discounting cannot be aggregated.' },
    ],
    probes: [
      { ja: '現在販売中の商品・サービスは何件で、その一覧はどこにありますか。', en: 'How many products or services are on sale right now, and where is that list?' },
      { ja: '新しい売り物を出すまでに、いくつの部門の承認が要りますか。', en: 'How many departments must approve before something new can be sold?' },
    ],
    triggers: ['商品', '製品', 'サービス', 'product', 'service', 'カタログ', 'catalog', 'sku', 'プラン', 'plan'],
  },
  {
    id: 'demand-generation',
    name: { ja: '需要創出', en: 'Demand Generation' },
    group: 'core',
    universal: true,
    definition: { ja: '市場に自社の存在と価値を届け、引合いを作り出す力。', en: 'Reaching the market with what you are and what you offer, and creating inbound interest.' },
    typicalL2: [
      { ja: '市場・競合分析', en: 'Market and competitor analysis' },
      { ja: 'ブランド・コミュニケーション管理', en: 'Brand and communications' },
      { ja: 'キャンペーン運営', en: 'Campaign execution' },
      { ja: 'リード育成・評価', en: 'Lead nurturing and scoring' },
    ],
    weakSigns: [
      { ja: '案件が特定の営業個人の人脈からしか来ず、退職で売上が落ちる。', en: 'Deals arrive only through a few individuals\' networks, and revenue drops when they leave.' },
      { ja: '施策ごとの費用対効果が測れず、予算が前年踏襲で決まる。', en: 'Return per campaign cannot be measured, so the budget is simply last year\'s number.' },
    ],
    probes: [
      { ja: '今期の引合いは、どの経路から何件来ましたか。', en: 'Where did this period\'s leads come from, and how many from each route?' },
      { ja: '施策を止めたときに、何週間後に受注が落ちますか。', en: 'If you stopped a campaign, how many weeks later would bookings drop?' },
    ],
    triggers: ['マーケティング', 'marketing', '広告', 'campaign', 'キャンペーン', 'リード', 'lead', 'ブランド', 'brand', '集客'],
  },
  {
    id: 'sales-order',
    name: { ja: '販売・受注', en: 'Sales & Order Management' },
    group: 'core',
    universal: true,
    definition: { ja: '引合いを合意可能な条件に落とし、確定した注文として受け取る力。', en: 'Turning interest into agreeable terms and capturing it as a confirmed order.' },
    typicalL2: [
      { ja: '商談・パイプライン管理', en: 'Opportunity and pipeline management' },
      { ja: '見積・提案作成', en: 'Quotation and proposal' },
      { ja: '契約締結・条件管理', en: 'Contracting and terms' },
      { ja: '受注登録・変更管理', en: 'Order capture and change management' },
    ],
    weakSigns: [
      { ja: '見積作成に何日もかかり、その間に競合に決まる。', en: 'A quote takes days to produce, and the competitor closes in the meantime.' },
      { ja: '受注内容と請求内容が一致せず、月末に照合作業が発生する。', en: 'Orders and invoices disagree, creating a reconciliation scramble at month end.' },
    ],
    probes: [
      { ja: '引合いから受注確定までの実測日数は何日ですか。', en: 'Measured in days, how long from first interest to confirmed order?' },
      { ja: '受注後に条件が変わる案件は何割ありますか。', en: 'What share of orders have their terms changed after capture?' },
    ],
    triggers: ['営業', 'sales', '受注', 'order', '見積', 'quote', '契約', 'contract', '販売'],
  },
  {
    id: 'customer-support',
    name: { ja: '顧客サポート', en: 'Customer Service & Support' },
    group: 'core',
    universal: true,
    definition: { ja: '提供後に生じる問い合わせ・不具合・要望を受け止め、解決し、次に活かす力。', en: 'Absorbing questions, faults, and requests after delivery, resolving them, and feeding them back.' },
    typicalL2: [
      { ja: '問い合わせ受付・一次対応', en: 'Inbound handling and first response' },
      { ja: '障害・不具合対応', en: 'Incident and defect handling' },
      { ja: 'エスカレーション管理', en: 'Escalation management' },
      { ja: '顧客の声の集約・還元', en: 'Voice-of-customer aggregation and feedback' },
    ],
    weakSigns: [
      { ja: '同じ問い合わせが繰り返し来るのに、原因側が直らない。', en: 'The same question keeps arriving and the underlying cause is never fixed.' },
      { ja: 'サポートで得た情報が商品企画に届かない。', en: 'What support learns never reaches product planning.' },
    ],
    probes: [
      { ja: '問い合わせ上位 5 件の内容と件数を即答できますか。', en: 'Can you name the top five inbound topics and their volumes right now?' },
      { ja: '問い合わせの内容が商品改善に反映された例を、直近半年で挙げられますか。', en: 'Can you name a case in the last six months where inbound feedback changed the product?' },
    ],
    triggers: ['サポート', 'support', '問い合わせ', 'コールセンター', 'call center', 'ヘルプデスク', 'helpdesk', 'カスタマーサクセス', 'customer success'],
  },
  {
    id: 'service-delivery-production',
    name: { ja: '生産・サービス提供', en: 'Production & Service Delivery' },
    group: 'core',
    universal: false,
    definition: { ja: '約束したものを実際に作り出し、あるいは実施して、受け手に届く状態にする力。', en: 'Actually making or performing what was promised, until it exists for the receiver.' },
    typicalL2: [
      { ja: '生産・実施計画', en: 'Production or delivery planning' },
      { ja: '作業実行・工程管理', en: 'Execution and process control' },
      { ja: '設備・要員の稼働管理', en: 'Capacity and resource utilisation' },
      { ja: '納期・進捗管理', en: 'Schedule and progress control' },
    ],
    weakSigns: [
      { ja: '納期回答が経験と勘に依存し、遅延の予兆が事後にしか分からない。', en: 'Delivery dates come from intuition, and slippage is only visible after the fact.' },
      { ja: '繁忙期に品質が落ち、手戻りで実質的な生産量が下がる。', en: 'Quality falls in peak season and rework eats the throughput gained.' },
    ],
    probes: [
      { ja: '約束した納期を守れた割合は何 % ですか。守れなかった理由の内訳は取れていますか。', en: 'What percentage of promised dates were met, and do you have the breakdown of misses?' },
      { ja: '需要が 2 倍になったとき、最初に詰まるのはどこですか。', en: 'If demand doubled, what clogs first?' },
    ],
    triggers: ['製造', '生産', 'manufacturing', 'production', '工場', 'factory', '施工', '現場', 'サービス提供', 'delivery', '運用'],
  },
  {
    id: 'sourcing-procurement',
    name: { ja: '調達・仕入', en: 'Sourcing & Procurement' },
    group: 'core',
    universal: false,
    definition: { ja: '外部から必要なものを、必要な条件で手に入れ続ける力。', en: 'Continuously obtaining what is needed from outside, on the terms that are needed.' },
    typicalL2: [
      { ja: '調達方針・カテゴリ戦略', en: 'Sourcing policy and category strategy' },
      { ja: '仕入先評価・選定', en: 'Supplier evaluation and selection' },
      { ja: '購買実行・発注管理', en: 'Purchasing and order placement' },
      { ja: '仕入先リスク管理', en: 'Supplier risk management' },
    ],
    weakSigns: [
      { ja: '同じ品目を部門ごとに別条件で買っており、まとめれば下がる価格を払い続けている。', en: 'The same item is bought on different terms by each department, paying more than a consolidated deal would.' },
      { ja: '仕入先が 1 社に依存しており、代替の検討記録が無い。', en: 'A single supplier is depended on, with no record of alternatives ever being evaluated.' },
    ],
    probes: [
      { ja: '支出額上位 10 社は誰で、それぞれ代替先はありますか。', en: 'Who are your top ten suppliers by spend, and does each have an alternative?' },
      { ja: '同一品目を複数部門が別々に発注していませんか。', en: 'Are several departments ordering the same item separately?' },
    ],
    triggers: ['調達', '購買', 'procurement', 'sourcing', '仕入', 'supplier', 'サプライヤ', 'ベンダ', 'vendor', '外注'],
  },
  {
    id: 'supply-logistics',
    name: { ja: '供給・物流', en: 'Supply & Logistics' },
    group: 'core',
    universal: false,
    definition: { ja: '物や役務を、必要な場所と時刻に、必要な量だけ届ける力。在庫はこの力の副作用として現れる。', en: 'Getting goods or services to the right place, time, and quantity. Inventory is a side effect of how well this works.' },
    typicalL2: [
      { ja: '需給計画', en: 'Demand and supply planning' },
      { ja: '在庫管理', en: 'Inventory management' },
      { ja: '倉庫・配送管理', en: 'Warehousing and distribution' },
      { ja: 'トレーサビリティ管理', en: 'Traceability' },
    ],
    weakSigns: [
      { ja: '欠品と過剰在庫が同時に起きる(需給の見通しが部門ごとにばらばら)。', en: 'Stock-outs and excess stock coexist, because each department forecasts separately.' },
      { ja: '在庫の実数が棚卸まで分からない。', en: 'Real stock levels are unknown until a physical count.' },
    ],
    probes: [
      { ja: '在庫回転率と欠品率を、月次でどこまで把握していますか。', en: 'How far do you track turnover and stock-out rate month by month?' },
      { ja: '需要予測は誰が作り、実績とどれだけ乖離しますか。', en: 'Who builds the demand forecast and how far does it deviate from actuals?' },
    ],
    triggers: ['物流', 'logistics', '在庫', 'inventory', '配送', 'supply chain', 'サプライチェーン', '倉庫', 'warehouse', '需給'],
  },
  {
    id: 'quality-management',
    name: { ja: '品質管理', en: 'Quality Management' },
    group: 'enabling',
    universal: false,
    definition: { ja: '約束した水準を満たしていることを確かめ、外れたときに原因まで遡って止める力。', en: 'Verifying that the promised level is met, and when it is not, tracing back to the cause and stopping it.' },
    typicalL2: [
      { ja: '品質基準の設定', en: 'Setting quality standards' },
      { ja: '検査・試験', en: 'Inspection and testing' },
      { ja: '不適合・是正処置管理', en: 'Non-conformance and corrective action' },
      { ja: '品質データ分析', en: 'Quality data analysis' },
    ],
    weakSigns: [
      { ja: '不具合の原因分析が「担当者の注意不足」で終わり、同じ事象が繰り返す。', en: 'Root cause analysis ends at "someone was careless" and the same defect recurs.' },
      { ja: '検査記録が紙にあり、傾向分析ができない。', en: 'Inspection records live on paper and no trend analysis is possible.' },
    ],
    probes: [
      { ja: '不具合の再発率は測れていますか。', en: 'Do you measure the recurrence rate of defects?' },
      { ja: '品質基準は誰が決め、変更にはどんな承認が要りますか。', en: 'Who sets the standards, and what approval is needed to change them?' },
    ],
    triggers: ['品質', 'quality', '検査', 'inspection', '不具合', 'defect', '認証', 'iso', '安全', 'safety'],
  },
  {
    id: 'research-development',
    name: { ja: '研究開発', en: 'Research & Development' },
    group: 'core',
    universal: false,
    definition: { ja: 'まだ存在しない売り物や方法を試し、事業として成り立つ形に育てる力。', en: 'Trying out offerings and methods that do not exist yet, and growing the survivors into something the business can sell.' },
    typicalL2: [
      { ja: 'テーマ探索・評価', en: 'Idea exploration and screening' },
      { ja: '試作・検証', en: 'Prototyping and validation' },
      { ja: '知的財産管理', en: 'Intellectual property management' },
      { ja: '量産・提供への移管', en: 'Handover to production or delivery' },
    ],
    weakSigns: [
      { ja: '試作は多いが、事業化まで到達した件数が数えられない。', en: 'Plenty of prototypes, but nobody can count how many reached the market.' },
      { ja: '中止の判断基準が無く、成果の出ないテーマが延命される。', en: 'No stop criteria exist, so unproductive themes are kept alive indefinitely.' },
    ],
    probes: [
      { ja: '直近 3 年で、着手したテーマ数と事業化した件数はいくつですか。', en: 'Over the last three years, how many themes were started and how many reached the market?' },
      { ja: 'テーマを止める判断は誰が、どの基準で行いますか。', en: 'Who stops a theme, and against what criteria?' },
    ],
    triggers: ['研究', '開発', 'r&d', 'research', '新規事業', 'innovation', 'イノベーション', '試作', '特許', 'patent'],
  },
  {
    id: 'billing-collection',
    name: { ja: '請求・回収', en: 'Billing & Revenue Collection' },
    group: 'core',
    universal: true,
    definition: { ja: '提供した価値を正しい金額に変換し、期日までに現金として回収する力。', en: 'Converting delivered value into the correct amount and turning it into cash by the due date.' },
    typicalL2: [
      { ja: '課金・請求データ生成', en: 'Charge and invoice generation' },
      { ja: '請求書発行・送付', en: 'Invoice issuance and delivery' },
      { ja: '入金消込', en: 'Payment matching' },
      { ja: '債権管理・督促', en: 'Receivables and collections' },
    ],
    weakSigns: [
      { ja: '請求の修正・再発行が毎月一定数発生し、それが常態になっている。', en: 'A steady stream of corrections and reissues every month, treated as normal.' },
      { ja: '入金消込が手作業で、月初の数日が潰れる。', en: 'Payment matching is manual and eats the first days of every month.' },
    ],
    probes: [
      { ja: '請求誤りの件数と原因の内訳は取れていますか。', en: 'Do you have the count and cause breakdown of billing errors?' },
      { ja: '提供完了から入金までの実測日数は何日ですか。', en: 'Measured in days, how long from delivery to cash?' },
    ],
    triggers: ['請求', 'billing', '課金', 'invoice', '回収', '入金', '債権', 'subscription', 'サブスクリプション'],
  },
  {
    id: 'finance-accounting',
    name: { ja: '財務・経理', en: 'Finance & Accounting' },
    group: 'enabling',
    universal: true,
    definition: { ja: '事業活動を数字に変換し、資金を確保し、経営が意思決定できる形で示す力。', en: 'Turning activity into numbers, securing funds, and presenting both in a form the leadership can decide on.' },
    typicalL2: [
      { ja: '会計処理・決算', en: 'Accounting and financial close' },
      { ja: '予算策定・実績管理', en: 'Budgeting and variance management' },
      { ja: '資金管理', en: 'Treasury and cash management' },
      { ja: '原価管理', en: 'Cost accounting' },
    ],
    weakSigns: [
      { ja: '月次決算が締まるのが翌月下旬で、数字を見たときには手遅れ。', en: 'The monthly close lands in the second half of the following month — too late to act on.' },
      { ja: '製品別・顧客別の採算が出せず、値引き判断が勘で行われる。', en: 'Profitability per product or customer is unavailable, so discounting is decided by feel.' },
    ],
    probes: [
      { ja: '月次の数字は何営業日で見られますか。', en: 'How many working days until the monthly numbers are visible?' },
      { ja: '採算は何の単位まで分解できますか(事業別 / 商品別 / 顧客別)。', en: 'To what level can profitability be broken down — business, product, customer?' },
    ],
    triggers: ['財務', '経理', 'finance', 'accounting', '会計', '決算', '原価', 'cost', '予算', 'budget'],
  },
  {
    id: 'human-capital',
    name: { ja: '人材管理', en: 'Human Capital Management' },
    group: 'enabling',
    universal: true,
    definition: { ja: '必要な力を持つ人を集め、育て、力を発揮できる状態で保ち続ける力。', en: 'Bringing in the abilities the business needs, growing them, and keeping people in a state where those abilities are used.' },
    typicalL2: [
      { ja: '要員計画', en: 'Workforce planning' },
      { ja: '採用', en: 'Recruiting' },
      { ja: '育成・スキル管理', en: 'Development and skills management' },
      { ja: '評価・処遇', en: 'Performance and reward' },
    ],
    weakSigns: [
      { ja: '重要業務が特定個人に依存し、その人の休暇で業務が止まる。', en: 'Critical work depends on named individuals, and stops when they take leave.' },
      { ja: '必要なスキルの一覧が無く、採用が「欠員補充」でしか動かない。', en: 'No inventory of needed skills exists, so hiring only ever backfills departures.' },
    ],
    probes: [
      { ja: '今後 3 年で必要になるスキルと、現在の保有状況を並べた表はありますか。', en: 'Is there a table of skills needed over three years against what you hold today?' },
      { ja: '1 人しかできない業務は何件ありますか。', en: 'How many tasks can only one person perform?' },
    ],
    triggers: ['人材', '人事', 'hr', 'human resource', '採用', '育成', 'talent', 'スキル', 'skill', '要員'],
  },
  {
    id: 'it-service-delivery',
    name: { ja: 'IT サービス提供', en: 'IT Service Delivery' },
    group: 'enabling',
    universal: true,
    definition: { ja: '業務が依存する情報システムを、必要な水準で提供し続け、変更を安全に反映する力。', en: 'Keeping the information systems the business depends on running at the required level, and landing changes safely.' },
    typicalL2: [
      { ja: 'サービス運用・監視', en: 'Service operations and monitoring' },
      { ja: '変更・リリース管理', en: 'Change and release management' },
      { ja: 'システム開発・調達', en: 'System development and acquisition' },
      { ja: 'IT 資産・ライセンス管理', en: 'IT asset and licence management' },
    ],
    weakSigns: [
      { ja: '変更のたびに障害が起き、リリースを恐れて塩漬けのシステムが増える。', en: 'Every change causes an incident, so releases are feared and systems are frozen.' },
      { ja: '事業側の要望が「順番待ち」で数か月止まり、影の IT が育つ。', en: 'Business requests queue for months, and shadow IT grows in the gap.' },
    ],
    probes: [
      { ja: '直近 1 年の重大障害の件数と原因の内訳を出せますか。', en: 'Can you produce the count and causes of major incidents over the last year?' },
      { ja: '事業側の依頼が着手されるまでの待ち日数は何日ですか。', en: 'How many days does a business request wait before work starts?' },
    ],
    triggers: ['it', 'システム', 'system', '情報システム', '基幹', 'インフラ', 'infrastructure', 'クラウド', 'cloud', '運用'],
  },
  {
    id: 'information-data',
    name: { ja: '情報・データ管理', en: 'Information & Data Management' },
    group: 'enabling',
    universal: true,
    definition: { ja: '事業判断に使うデータの意味・品質・所在を定め、使える状態に保つ力。', en: 'Fixing the meaning, quality, and whereabouts of the data used for decisions, and keeping it usable.' },
    typicalL2: [
      { ja: 'データ定義・用語統一', en: 'Data definitions and shared vocabulary' },
      { ja: 'マスタデータ管理', en: 'Master data management' },
      { ja: 'データ品質管理', en: 'Data quality management' },
      { ja: '分析基盤・活用支援', en: 'Analytics platform and enablement' },
    ],
    weakSigns: [
      { ja: '会議で数字が食い違い、その場が「どちらの数字が正しいか」の議論に消える。', en: 'Numbers disagree in meetings and the session is spent arguing which number is right.' },
      { ja: '同じ指標の定義が部門ごとに違い、比較できない。', en: 'The same metric is defined differently per department and cannot be compared.' },
    ],
    probes: [
      { ja: '主要な経営指標について、定義が文書化され、1 つに決まっていますか。', en: 'For the key management metrics, is a single definition written down?' },
      { ja: 'データの品質に責任を持つのは誰ですか(システム部門ではなく業務側で)。', en: 'Who owns data quality — on the business side, not IT?' },
    ],
    triggers: ['データ', 'data', '分析', 'analytics', 'bi', 'マスタ', 'master', '指標', 'kpi', 'dwh', 'ai'],
  },
  {
    id: 'strategy-performance',
    name: { ja: '経営計画・業績管理', en: 'Strategic Planning & Performance Management' },
    group: 'governing',
    universal: true,
    definition: { ja: '進む方向を決め、資源を配り、実際にそちらへ動いているかを測り続ける力。', en: 'Choosing a direction, allocating resources to it, and continuously measuring whether the organisation is actually moving that way.' },
    typicalL2: [
      { ja: '戦略策定', en: 'Strategy formulation' },
      { ja: '投資ポートフォリオ管理', en: 'Investment portfolio management' },
      { ja: '目標設定・業績モニタリング', en: 'Target setting and performance monitoring' },
      { ja: '事業ポートフォリオ見直し', en: 'Business portfolio review' },
    ],
    weakSigns: [
      { ja: '中期計画が毎年作られるが、日常の意思決定で参照されない。', en: 'A mid-term plan is produced every year and never referenced in day-to-day decisions.' },
      { ja: '投資判断の基準が案件ごとに違い、声の大きい部門に資源が寄る。', en: 'Investment criteria differ per proposal, so resources follow whoever argues loudest.' },
    ],
    probes: [
      { ja: '今期の重点施策を 3 つ、経営層が同じ順番で挙げられますか。', en: 'Can the executives name this period\'s top three priorities in the same order?' },
      { ja: '投資判断に使う共通の評価軸はありますか。', en: 'Is there a shared set of criteria for investment decisions?' },
    ],
    triggers: ['戦略', 'strategy', '経営計画', '中期', 'kpi', '業績', 'performance', 'ポートフォリオ', 'portfolio', '投資'],
  },
  {
    id: 'risk-compliance',
    name: { ja: 'リスク・コンプライアンス管理', en: 'Risk & Compliance Management' },
    group: 'governing',
    universal: true,
    definition: { ja: '事業を止めうる事象と守るべき規律を先回りで把握し、許容水準の中に収める力。', en: 'Getting ahead of what could stop the business and what rules must be kept, and holding both inside an accepted level.' },
    typicalL2: [
      { ja: 'リスク特定・評価', en: 'Risk identification and assessment' },
      { ja: '法規制対応', en: 'Regulatory compliance' },
      { ja: '情報セキュリティ管理', en: 'Information security management' },
      { ja: '事業継続管理', en: 'Business continuity management' },
    ],
    weakSigns: [
      { ja: 'リスク一覧が監査の時期だけ更新され、日常の判断に使われない。', en: 'The risk register is refreshed only for audits and never used in daily decisions.' },
      { ja: '規制対応が個別プロジェクトごとの単発対応になり、毎回ゼロから調べ直す。', en: 'Regulatory work is handled per project from scratch every time.' },
    ],
    probes: [
      { ja: '事業を 1 週間止めうる事象を 3 つ挙げられますか。それぞれ対策の担当は誰ですか。', en: 'Can you name three events that could halt the business for a week, and who owns the response to each?' },
      { ja: '規制要件の一覧と、対応状況の紐づけはありますか。', en: 'Is there a list of regulatory requirements linked to your compliance status?' },
    ],
    triggers: ['リスク', 'risk', 'コンプライアンス', 'compliance', 'セキュリティ', 'security', '規制', 'regulation', '監査', 'audit', '個人情報', 'privacy'],
  },
  {
    id: 'legal-contract',
    name: { ja: '法務・契約管理', en: 'Legal & Contract Management' },
    group: 'governing',
    universal: false,
    definition: { ja: '外部との約束の内容を作り、守り、変更と終了を管理する力。', en: 'Shaping the promises made to outsiders, keeping them, and managing their change and termination.' },
    typicalL2: [
      { ja: '契約書作成・審査', en: 'Contract drafting and review' },
      { ja: '契約台帳管理', en: 'Contract register' },
      { ja: '紛争・クレーム対応', en: 'Dispute and claim handling' },
      { ja: '契約更新・終了管理', en: 'Renewal and termination management' },
    ],
    weakSigns: [
      { ja: '自動更新の契約が誰にも把握されず、不要な支払いが続く。', en: 'Auto-renewing contracts go unnoticed and unnecessary payments continue.' },
      { ja: '契約書の所在が担当者のフォルダ依存で、退職時に探索が発生する。', en: 'Contracts live in individuals\' folders and a hunt begins whenever someone leaves.' },
    ],
    probes: [
      { ja: '有効な契約は何件あり、次の 6 か月で更新期限が来るのは何件ですか。', en: 'How many contracts are live, and how many renew in the next six months?' },
      { ja: '契約審査に平均何日かかりますか。それが商談の律速になっていませんか。', en: 'How many days does contract review take on average, and is it the rate limiter on deals?' },
    ],
    triggers: ['法務', 'legal', '契約', 'contract', '知財', 'ip', '紛争', '規約'],
  },
  {
    id: 'partner-channel',
    name: { ja: 'パートナー・チャネル管理', en: 'Partner & Channel Management' },
    group: 'core',
    universal: false,
    definition: { ja: '自社だけでは届かない範囲を、他社との関係で埋め、その関係を健全に保つ力。', en: 'Covering the reach you cannot achieve alone through other organisations, and keeping those relationships healthy.' },
    typicalL2: [
      { ja: 'パートナー戦略・選定', en: 'Partner strategy and selection' },
      { ja: 'チャネル別条件・支援', en: 'Channel terms and enablement' },
      { ja: 'パートナー業績管理', en: 'Partner performance management' },
      { ja: '共同提案・共同開発', en: 'Joint proposals and co-development' },
    ],
    weakSigns: [
      { ja: 'パートナー経由の売上構成が把握できず、支援の優先順位が付けられない。', en: 'The revenue mix through partners is unknown, so support cannot be prioritised.' },
      { ja: '直販とチャネルが同じ顧客で衝突し、値引き合戦になる。', en: 'Direct sales and channels collide on the same customer and a discount war follows.' },
    ],
    probes: [
      { ja: 'パートナー別の売上と利益率を出せますか。', en: 'Can you produce revenue and margin per partner?' },
      { ja: '直販とチャネルの棲み分けルールは文書化されていますか。', en: 'Is the rule separating direct and channel written down?' },
    ],
    triggers: ['パートナー', 'partner', '代理店', 'チャネル', 'channel', '販社', 'アライアンス', 'alliance', 'ecosystem', 'エコシステム'],
  },
  {
    id: 'asset-facility',
    name: { ja: '資産・設備管理', en: 'Asset & Facility Management' },
    group: 'enabling',
    universal: false,
    definition: { ja: '事業に必要な物理的資産を、使える状態で保有し続ける力。', en: 'Holding the physical assets the business needs in a usable state over their life.' },
    typicalL2: [
      { ja: '設備投資計画', en: 'Capital investment planning' },
      { ja: '保守・点検', en: 'Maintenance and inspection' },
      { ja: '資産台帳管理', en: 'Asset register' },
      { ja: '更新・廃棄管理', en: 'Replacement and disposal' },
    ],
    weakSigns: [
      { ja: '故障してから直す運用になっており、停止が生産計画を壊す。', en: 'Everything is fixed after it breaks, and outages wreck the production plan.' },
      { ja: '資産台帳と現物が合わず、実地確認に人手がかかる。', en: 'The register and the physical assets disagree, and reconciliation eats labour.' },
    ],
    probes: [
      { ja: '計画保全と事後対応の比率はどれくらいですか。', en: 'What is the ratio of planned maintenance to reactive repair?' },
      { ja: '主要設備の更新時期は、いつ、いくらで来ますか。', en: 'When do the major assets come due for replacement, and at what cost?' },
    ],
    triggers: ['設備', 'facility', '資産', 'asset', '保全', 'maintenance', '工場', 'プラント', 'plant', '不動産'],
  },
];

// ---------------------------------------------------------------------------
// 6. アンチパターン / Anti-patterns
// ---------------------------------------------------------------------------

export const ANTI_PATTERNS: BusinessArchitectureAntiPattern[] = [
  {
    id: 'org-chart-copy',
    name: { ja: '組織図の写し', en: 'The org chart in disguise' },
    symptom: { ja: '能力の名前が部門名と一対一で対応している。「営業本部」「管理部」がそのまま並ぶ。', en: 'Capability names map one-to-one onto departments — "Sales Division", "Administration" straight down the list.' },
    consequence: { ja: '組織再編のたびに作り直しになる。さらに、部門をまたぐ能力(顧客管理など)が構造的に見えなくなる。', en: 'It must be rebuilt at every reorganisation, and cross-departmental capabilities such as customer management become structurally invisible.' },
    fix: { ja: '「その部門が明日消えても、会社がやめられない仕事は何か」を問い直し、その答えを名前にする。', en: 'Ask what work the company could not stop even if that department vanished tomorrow, and name that instead.' },
  },
  {
    id: 'verb-naming',
    name: { ja: '動詞で書く', en: 'Written as verbs' },
    symptom: { ja: '「受注を処理する」「在庫を調整する」のように動作で書かれている。', en: 'Entries read as actions: "process orders", "adjust inventory".' },
    consequence: { ja: '能力ではなくプロセスになる。プロセスは手順が変わるたびに変わるので、投資の単位として使えない。', en: 'They become processes. Processes change whenever the steps change, so they cannot serve as units of investment.' },
    fix: { ja: '名詞句に変換する(「受注管理」「在庫管理」)。変換できないものは、そもそも能力ではなく作業。', en: 'Convert to noun phrases ("order management", "inventory management"). What cannot be converted was a task, not a capability.' },
  },
  {
    id: 'too-deep',
    name: { ja: '4 階層以上に割る', en: 'Four levels or deeper' },
    symptom: { ja: 'L4、L5 まで展開され、末端が画面名や帳票名になっている。', en: 'The tree runs to L4 and L5, with leaves that are screen or form names.' },
    consequence: { ja: '維持できない。1 年後には現実と乖離し、誰も更新しない資料になる。', en: 'It cannot be maintained. A year later it disagrees with reality and nobody updates it.' },
    fix: { ja: '3 階層で止め、L3 は投資対象の枝だけに限定する。それ以上の詳細はプロセス設計・要件定義の成果物に置く。', en: 'Stop at three levels and keep L3 only under funded branches. Deeper detail belongs to process design and requirements artefacts.' },
  },
  {
    id: 'it-terms',
    name: { ja: 'IT 用語の混入', en: 'IT vocabulary leaking in' },
    symptom: { ja: '「基幹システム連携」「データ基盤」「API 管理」が能力として並んでいる。', en: '"Core system integration", "data platform", "API management" appear as capabilities.' },
    consequence: { ja: '事業側が読まなくなる。ビジネスアーキテクチャが IT の資料に格下げされ、経営との会話に使えなくなる。', en: 'The business stops reading it. The business architecture is demoted to an IT document and loses its seat in executive conversations.' },
    fix: { ja: '「その仕組みで何ができるようになるのか」に言い換える(データ基盤 → 情報・データ管理)。実装はアプリケーションアーキテクチャ側に置く。', en: 'Restate as what it makes possible ("data platform" → information and data management) and move the implementation to the application architecture.' },
  },
  {
    id: 'no-owner',
    name: { ja: '責任者不在', en: 'No owner' },
    symptom: { ja: '能力にオーナーが割り当てられておらず、「全社」「関係部門」と書かれている。', en: 'Owners are missing or recorded as "the enterprise" or "relevant departments".' },
    consequence: { ja: '改善提案の宛先が無い。評価も更新も誰の仕事にもならず、地図が凍る。', en: 'Improvement proposals have no addressee. Neither scoring nor updating is anyone\'s job, and the map freezes.' },
    fix: { ja: '役職名で 1 人を割り当てる(個人名ではなく役職名。異動で無効にならない)。空欄を残さない。', en: 'Assign exactly one role — a role, not a person, so transfers do not invalidate it. Leave no blanks.' },
  },
  {
    id: 'uniform-decomposition',
    name: { ja: '全枝を均等に割る', en: 'Uniform decomposition' },
    symptom: { ja: 'すべての L1 が同じ数の L2 を持ち、整った樹形図になっている。', en: 'Every L1 has the same number of L2s and the tree looks beautifully even.' },
    consequence: { ja: '整っているが情報が無い。重要な領域とそうでない領域の区別が図から消える。', en: 'It looks tidy and carries no information — the difference between what matters and what does not disappears.' },
    fix: { ja: '割る深さ自体を情報にする。深く割られている枝=今期の関心領域、と読ませる。', en: 'Make depth itself informative: a deeply split branch means "this is where we are looking this period".' },
  },
  {
    id: 'complaint-list',
    name: { ja: '課題リストになっている', en: 'A list of complaints' },
    symptom: { ja: '「属人化の解消」「データ連携の改善」など、現状の不満が能力として並んでいる。', en: 'Entries read as grievances: "reduce key-person dependency", "improve data integration".' },
    consequence: { ja: '課題が解決した瞬間に地図が空白になる。恒常的に存在する構造を表せていない。', en: 'The moment the problem is solved the map goes blank. It never described the permanent structure.' },
    fix: { ja: '「何ができる力か」に言い換え、不満は評価(成熟度が低い)として能力に添付する。', en: 'Restate as an ability, and attach the grievance to it as a low maturity score instead.' },
  },
  {
    id: 'reference-copy',
    name: { ja: '参考モデルの丸写し', en: 'Copying a reference model wholesale' },
    symptom: { ja: '業界標準の能力一覧をそのまま採用し、自社固有の稼ぎ方に対応する能力が無い。', en: 'An industry reference list is adopted verbatim and nothing in it reflects how this company actually makes money.' },
    consequence: { ja: '「どの会社でも同じ図」になり、差別化の議論ができない。経営層の関心も引かない。', en: 'The picture is identical to any competitor\'s, so differentiation cannot be discussed and executives lose interest.' },
    fix: { ja: '自社の一次資料から作った候補を先に束ね、参考セットは最後の抜け漏れ確認だけに使う。', en: 'Bundle candidates harvested from your own documents first, and use a reference set only as a final gap check.' },
  },
  {
    id: 'all-important',
    name: { ja: '全部が重要・全部が低成熟', en: 'Everything is critical and immature' },
    symptom: { ja: 'ヒートマップが真っ赤で、優先順位が読み取れない。', en: 'The heat map is entirely red and no priority can be read from it.' },
    consequence: { ja: '投資判断に使えない。結局、声の大きい部門の案件が通る。', en: 'It cannot inform investment, so the loudest department wins anyway.' },
    fix: { ja: '評価前に配分を宣言する(重要度「高」は全体の 1/3 まで)。相対評価に切り替える。', en: 'Declare a distribution before scoring — "high" is capped at one third — and switch to relative ranking.' },
  },
  {
    id: 'shelf-ware',
    name: { ja: '作って終わり', en: 'Built once, never used' },
    symptom: { ja: '完成した能力マップが共有フォルダに置かれ、以降どの会議資料にも現れない。', en: 'The finished map lands in a shared folder and never appears in another meeting deck.' },
    consequence: { ja: '半年で現実と乖離する。次に作り直すとき、前回の版が信用されずゼロからやり直しになる。', en: 'Within six months it disagrees with reality, and the next attempt starts from zero because nobody trusts the old version.' },
    fix: { ja: '作った直後に「使う会議」を 1 つ決める(投資審議・組織再編・年度計画のいずれか)。使われない地図は作らない。', en: 'Pick one recurring meeting that will use it — investment review, reorganisation, or annual planning — the day it is finished. Do not build maps nobody will use.' },
  },
];

// ---------------------------------------------------------------------------
// 7. 命名チェック用語彙 / Naming lexicon for the checker
// ---------------------------------------------------------------------------

export const NAMING_LEXICON: NamingLexicon = {
  verbSuffixJa: [
    'する', 'します', 'した', 'させる', 'を行う', 'を行なう', 'をする', 'できる', 'していく', 'すること',
  ],
  verbPrefixEn: [
    'manage', 'managing', 'create', 'creating', 'deliver', 'delivering', 'process', 'processing',
    'handle', 'handling', 'provide', 'providing', 'develop', 'developing', 'maintain', 'maintaining',
    'monitor', 'monitoring', 'track', 'tracking', 'analyze', 'analyse', 'analyzing', 'optimize',
    'optimise', 'execute', 'executing', 'perform', 'performing', 'plan', 'planning', 'build',
    'building', 'sell', 'selling', 'buy', 'buying', 'ship', 'shipping', 'support', 'supporting',
    'improve', 'improving', 'reduce', 'reducing', 'ensure', 'ensuring', 'enable', 'enabling',
  ],
  orgWordsJa: ['本部', '事業部', '事業所', '部門', '支店', '支社', '営業所', '出張所', 'センター', 'チーム', '委員会', '事務局'],
  orgSuffixJa: ['部', '課', '室', '局', '担当', 'グループ'],
  orgWordsEn: ['department', 'division', 'unit', 'team', 'office', 'bureau', 'headquarters', 'branch', 'committee', 'squad', 'center', 'centre'],
  itWordsJa: ['システム', 'サーバ', 'サーバー', 'データベース', 'ミドルウェア', 'ネットワーク', 'バッチ', '基盤', 'クラウド', '画面', '帳票', 'マイクロサービス', 'パッケージ', 'ツール', 'アプリ'],
  itWordsEn: ['system', 'server', 'database', 'middleware', 'network', 'batch', 'cloud', 'api', 'apis', 'erp', 'crm', 'saas', 'microservice', 'microservices', 'kubernetes', 'dwh', 'etl', 'sql', 'portal', 'dashboard', 'application'],
  conjunctionsJa: ['および', '及び', 'ならびに', '並びに', 'かつ'],
  conjunctionsEn: [' and ', ' & ', ' plus '],
  vagueWordsJa: ['管理', '業務', '対応', '推進', '企画', '運営', '全般', 'その他'],
  vagueWordsEn: ['management', 'operations', 'administration', 'general', 'others', 'misc'],
};

// ---------------------------------------------------------------------------
// 検索ヘルパ / Lookup helpers
// ---------------------------------------------------------------------------

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s　・･/／\-—–_,、]/g, '');
}

/** ID または名称(日英)で参照能力を引く */
export function findReferenceCapability(idOrName: string): ReferenceCapability | undefined {
  const key = normalizeKey(idOrName);
  if (key.length === 0) return undefined;
  return REFERENCE_CAPABILITIES.find(
    (c) => normalizeKey(c.id) === key || normalizeKey(c.name.ja) === key || normalizeKey(c.name.en) === key,
  );
}

/** ID または名称でアンチパターンを引く */
export function findAntiPattern(idOrName: string): BusinessArchitectureAntiPattern | undefined {
  const key = normalizeKey(idOrName);
  if (key.length === 0) return undefined;
  return ANTI_PATTERNS.find(
    (a) => normalizeKey(a.id) === key || normalizeKey(a.name.ja) === key || normalizeKey(a.name.en) === key,
  );
}

/** ID でクロスマッピングを引く */
export function findCrossMapping(id: string): CrossMapping | undefined {
  const key = normalizeKey(id);
  return CROSS_MAPPING.find((m) => normalizeKey(m.id) === key || normalizeKey(m.name.ja) === key || normalizeKey(m.name.en) === key);
}

/** 分類の表示ラベル */
export const CAPABILITY_GROUP_LABELS: Record<CapabilityGroup, Bilingual> = {
  core: { ja: '中核(価値を直接生む)', en: 'Core — creates value directly' },
  enabling: { ja: '支援(中核を回し続ける)', en: 'Enabling — keeps the core running' },
  governing: { ja: '統制(方向と歯止め)', en: 'Governing — direction and brakes' },
};
