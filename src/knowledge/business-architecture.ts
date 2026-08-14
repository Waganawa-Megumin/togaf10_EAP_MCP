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

/**
 * 業界固有の参照能力 / A reference capability that only makes sense in one industry.
 *
 * 形は汎用の `ReferenceCapability` と同じにして、描画側が区別せず扱えるようにする。
 * `universal` は「この業界の組織ならほぼ必ず持つか」の意味で使う(汎用セットとは基準が違う)。
 */
export interface IndustryReferenceCapability extends ReferenceCapability {
  /**
   * この能力が汎用セットの能力を業界の言葉で置き換える場合、その汎用能力 ID。
   * 例: 銀行の「チャネル運営」は汎用の「販売・受注」より現場で通る。
   * 置き換えた事実は出力に明記し、勝手に消えたように見せない。
   */
  supersedes?: string[];
}

/** 業界別の参照能力セット / An industry-specific reference capability set. */
export interface IndustryCapabilitySet {
  id: string;
  name: Bilingual;
  /** この業界を一言で言うと何を売って対価を得ているか */
  essence: Bilingual;
  /** `industry` 引数の照合語(日英・表記ゆれを含む。小文字で書く) */
  aliases: string[];
  /**
   * 事業説明からこの業界を推定するための業務語(小文字)。
   * 「その業界でしか使わない語」だけを入れる。「顧客」「販売」のような汎用語は入れない。
   */
  detectors: string[];
  /** 業界固有の能力 */
  capabilities: IndustryReferenceCapability[];
  /** 草案に添える業界固有の注意 */
  notes: Bilingual[];
}

/** 業界推定の結果 1 件 / One industry detection result. */
export interface IndustryDetection {
  set: IndustryCapabilitySet;
  /** 一致した語(重複なし) */
  matched: string[];
  /** 一致の強さ(業務語の一致数 + 能力トリガの一致数) */
  score: number;
  /**
   * 業界の推定に使ってよい強さか。
   * 業界名そのもの(aliases)が説明文に出ているか、業界固有の語が 3 つ以上の能力に
   * またがって出ている場合だけ true。1 つの能力の語彙にしか当たっていないときは
   * 素点が高くても false にする(物流会社が製造業の「在庫・物流運営」の語だけに
   * 当たって「製造業」と判定される、という種類の誤判定を防ぐ)。
   * 呼び出し側は false の候補を推定に使ってはならない。
   */
  confident: boolean;
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
// 5.1 業界別の参照能力セット / Industry-specific reference capability sets
//
// 汎用セット(上)だけで草案を作ると、銀行でも工場でも同じ図になる。
// 事業側が最初に見るのは「自分たちの言葉で書かれているか」なので、
// 業界の実務で通る名前の能力をここに用意し、汎用セットに足して使う。
//
// 収録は筆者の実務観点による独自整理。特定の業界参照モデルの写しではない。
// ---------------------------------------------------------------------------

export const INDUSTRY_CAPABILITY_SETS: IndustryCapabilitySet[] = [
  // -------------------------------------------------------------------------
  // 金融(銀行・信用金庫)
  // -------------------------------------------------------------------------
  {
    id: 'banking',
    name: { ja: '金融(銀行・信用金庫)', en: 'Banking' },
    essence: {
      ja: '他人の資金を預かって貸し、決済を動かして対価を得る。記録の正しさと当局の信認が商売の前提になる。',
      en: 'Taking deposits, lending them out, and moving payments. Correct records and supervisory trust are preconditions for trading at all.',
    },
    aliases: ['banking', 'bank', '銀行', '金融', '金融機関', '信用金庫', '信金', '地銀', '地方銀行', 'メガバンク', '信用組合', 'financial services', 'financial-services', 'fintech', 'ネット銀行'],
    detectors: ['預金', '融資', '貸出', '与信', '審査', '口座', '為替', '振込', '住宅ローン', 'マネロン', 'aml', 'kyc', '勘定系', '支店', 'atm', 'インターネットバンキング', '投資信託', '金利', '自己資本', 'deposit', 'lending', 'underwriting', 'branch', 'settlement'],
    capabilities: [
      {
        id: 'banking-deposit-account',
        name: { ja: '預金・口座管理', en: 'Deposit & Account Management' },
        group: 'core',
        universal: true,
        definition: {
          ja: '資金を預かり、口座の開設から解約・相続までの状態と残高の正しさを、1 円の狂いもなく保ち続ける力。',
          en: 'Holding funds and keeping account state and balances exactly right, from opening through closure and inheritance.',
        },
        typicalL2: [
          { ja: '口座開設・本人確認', en: 'Account opening and identity verification' },
          { ja: '残高・入出金記録の維持', en: 'Balance and transaction record keeping' },
          { ja: '休眠・異動口座の管理', en: 'Dormant and flagged account handling' },
          { ja: '解約・相続手続', en: 'Closure and inheritance procedures' },
        ],
        weakSigns: [
          { ja: '口座開設に来店と紙が必須で、完了まで日数がかかる。若年層の新規獲得が止まる。', en: 'Opening an account still needs a branch visit and paper, takes days, and new younger customers stop arriving.' },
          { ja: '相続・名義変更の手順が支店ごとに違い、処理期間と顧客の不満がばらつく。', en: 'Inheritance and name-change procedures differ by branch, so turnaround time and complaints vary wildly.' },
        ],
        probes: [
          { ja: '口座開設からカード到着まで、中央値で何営業日ですか。最も時間を食う工程はどこですか。', en: 'From application to card in hand, what is the median number of business days, and which step eats the most?' },
          { ja: '休眠口座と相続手続中の口座は今それぞれ何件ありますか。その一覧はどこで見られますか。', en: 'How many dormant accounts and how many mid-inheritance accounts exist right now, and where can that list be seen?' },
        ],
        triggers: ['預金', '口座', '普通預金', '定期預金', '残高', '入出金', '通帳', '休眠', 'deposit', 'account', 'passbook'],
      },
      {
        id: 'banking-credit-underwriting',
        name: { ja: '与信・審査', en: 'Credit Assessment & Underwriting' },
        group: 'core',
        universal: true,
        definition: {
          ja: '貸してよい相手か、いくらまでか、どの条件でかを、後から再現できる根拠を残して判断する力。',
          en: 'Deciding whether to lend, how much, and on what terms, leaving evidence that can be reconstructed later.',
        },
        typicalL2: [
          { ja: '信用格付・スコアリング', en: 'Credit rating and scoring' },
          { ja: '担保・保証の評価', en: 'Collateral and guarantee valuation' },
          { ja: '審査基準の維持・改定', en: 'Maintenance of credit policy and criteria' },
          { ja: '稟議・決裁記録の管理', en: 'Approval trail and decision records' },
        ],
        weakSigns: [
          { ja: '判断根拠が担当者の経験に依存し、否決理由を後から本人にも当局にも説明できない。', en: 'Decisions rest on individual experience, and the reason for a decline cannot be explained afterwards to the applicant or the supervisor.' },
          { ja: '同じ取引先の与信枠が部署ごとに別管理で、グループ全体の総与信額が即答できない。', en: 'Limits for the same counterparty sit in different departments, and nobody can state total group exposure on the spot.' },
        ],
        probes: [
          { ja: '融資の申込から回答まで、中央値で何日ですか。そのうち待ち時間はどこで発生していますか。', en: 'From application to answer, what is the median in days, and where inside that is the waiting?' },
          { ja: 'モデルやスコアの結果を人が覆した件数と、その理由は記録されていますか。', en: 'How often does a human override the model or score, and is the reason recorded?' },
        ],
        triggers: ['融資', '与信', '審査', '貸出', 'ローン', '信用', '格付', '担保', '保証', '稟議', 'credit', 'underwriting', 'lending', 'scoring', 'collateral'],
      },
      {
        id: 'banking-loan-servicing',
        name: { ja: '融資実行・債権管理', en: 'Loan Servicing & Portfolio Management' },
        group: 'core',
        universal: true,
        definition: {
          ja: '実行した貸出を、返済・条件変更・延滞・回収まで期日どおりに動かし、資産の質を把握し続ける力。',
          en: 'Running a loan after drawdown — repayment, restructuring, delinquency, recovery — on schedule, and always knowing asset quality.',
        },
        typicalL2: [
          { ja: '実行・条件設定', en: 'Drawdown and terms setup' },
          { ja: '返済・利息計算', en: 'Repayment and interest calculation' },
          { ja: '条件変更・リスケジュール対応', en: 'Restructuring and rescheduling' },
          { ja: '延滞管理・回収・償却', en: 'Delinquency, recovery, and write-off' },
        ],
        weakSigns: [
          { ja: '延滞の把握が月次で、兆候をつかんだときには打てる手が残っていない。', en: 'Delinquency is visible only monthly, and by the time the signal appears no useful option is left.' },
          { ja: '債務者の実態(業況・資金繰り)の情報が担当者の頭の中にしかなく、異動で消える。', en: 'What is really happening at the borrower lives only in the officer’s head and disappears when they move desk.' },
        ],
        probes: [
          { ja: '延滞の一次アラートは何日目に、誰の画面に届きますか。', en: 'On what day does the first delinquency alert fire, and on whose screen?' },
          { ja: '業種別・地域別の与信集中は、今どの粒度で見えていますか。', en: 'At what granularity can you currently see credit concentration by sector and by region?' },
        ],
        triggers: ['返済', '延滞', '債権', '回収', 'リスケ', '条件変更', '不良債権', '償却', 'servicing', 'delinquency', 'repayment'],
      },
      {
        id: 'banking-payments-settlement',
        name: { ja: '資金決済・為替', en: 'Payments & Settlement' },
        group: 'core',
        universal: true,
        definition: {
          ja: '振込・口座振替・送金を、外部の決済ネットワークと接続しながら、期日どおり正確に動かす力。',
          en: 'Moving money on time and correctly — transfers, direct debits, remittances — while staying connected to external settlement networks.',
        },
        typicalL2: [
          { ja: '内国為替・振込', en: 'Domestic transfers' },
          { ja: '口座振替・収納代行', en: 'Direct debit and collection services' },
          { ja: '外国為替・海外送金', en: 'Foreign exchange and cross-border remittance' },
          { ja: '決済ネットワーク接続・照合', en: 'Network connectivity and reconciliation' },
        ],
        weakSigns: [
          { ja: '締め後の訂正が手作業で、手順を知っているのが数名しかいない。', en: 'Post-cutoff corrections are manual and only a handful of people know the steps.' },
          { ja: '決済系が止まったときの代替手順が文書のままで、訓練されていない。', en: 'The fallback procedure for a payments outage exists as a document nobody has ever rehearsed.' },
        ],
        probes: [
          { ja: '決済が 1 時間止まると、何件・いくらの取引が滞留しますか。数字は出せますか。', en: 'If payments stopped for an hour, how many transactions and how much value would queue up? Can you produce the number?' },
          { ja: '組戻し・訂正は月に何件で、原因の内訳は取れていますか。', en: 'How many recalls and corrections happen per month, and do you have the cause breakdown?' },
        ],
        triggers: ['為替', '決済', '振込', '送金', '引落', '口座振替', '収納', 'payment', 'settlement', 'remittance', 'clearing'],
      },
      {
        id: 'banking-financial-crime',
        name: { ja: 'AML / 金融犯罪対策', en: 'Financial Crime & AML' },
        group: 'governing',
        universal: true,
        definition: {
          ja: '顧客と取引を継続的に監視し、犯罪利用の疑いを検知・確認・報告し、その判断過程を保存する力。',
          en: 'Continuously monitoring customers and transactions, detecting, reviewing, and reporting suspicion, and preserving how each judgement was reached.',
        },
        typicalL2: [
          { ja: '顧客管理(KYC)・実質的支配者の把握', en: 'KYC and beneficial ownership' },
          { ja: '制裁リスト・反社情報の照合', en: 'Sanctions and adverse-party screening' },
          { ja: '取引モニタリング・アラート検証', en: 'Transaction monitoring and alert review' },
          { ja: '疑わしい取引の届出・記録保存', en: 'Suspicious activity reporting and record retention' },
        ],
        weakSigns: [
          { ja: 'アラートの大半が誤検知で、検証が追いつかず滞留する。滞留件数自体が当局指摘の材料になる。', en: 'Most alerts are false positives, review falls behind, and the backlog itself becomes a supervisory finding.' },
          { ja: '顧客情報の更新が止まり、リスク評価が口座開設時のまま何年も動いていない。', en: 'Customer information stopped being refreshed, so the risk rating is still the one assigned at onboarding years ago.' },
        ],
        probes: [
          { ja: '月間のアラート件数と、そのうち期限内に人が検証できている割合はいくつですか。', en: 'How many alerts per month, and what share get a human review inside the deadline?' },
          { ja: '顧客リスク格付の見直しは何年周期で、実施率は何 % ですか。', en: 'On what cycle are customer risk ratings refreshed, and what percentage actually get refreshed?' },
        ],
        triggers: ['マネロン', 'マネー・ローンダリング', 'aml', 'kyc', 'cft', '制裁', '金融犯罪', '疑わしい取引', '反社', '不正検知', 'sanctions', 'financial crime', 'fraud'],
      },
      {
        id: 'banking-channel-operations',
        name: { ja: 'チャネル運営', en: 'Channel Operations' },
        group: 'core',
        universal: true,
        supersedes: ['sales-order'],
        definition: {
          ja: '店舗・ATM・オンラインなど複数の接点を、同じ商品・同じ本人確認水準で運営し続ける力。',
          en: 'Running branches, ATMs, and digital touchpoints so the same products and the same identity standard apply across all of them.',
        },
        typicalL2: [
          { ja: '店舗・窓口運営', en: 'Branch and counter operations' },
          { ja: 'ATM・自動機運営', en: 'ATM and self-service device operations' },
          { ja: 'インターネット・モバイルバンキング運営', en: 'Internet and mobile banking operations' },
          { ja: 'チャネル横断の本人確認・認証', en: 'Cross-channel identity and authentication' },
        ],
        weakSigns: [
          { ja: '同じ手続きがチャネルごとに別ルールで、オンラインで始めた手続きを店舗でやり直させる。', en: 'The same procedure has different rules per channel, so what was started online has to be restarted at the branch.' },
          { ja: '来店の用件別件数が取れておらず、店舗の統廃合の議論が感覚論で終わる。', en: 'Nobody counts why customers come in, so branch consolidation is argued on impressions.' },
        ],
        probes: [
          { ja: '主要な手続きのうち、オンラインだけで完結するのは何割ですか。', en: 'What share of your main procedures can be completed online end to end?' },
          { ja: '支店ごとの来店件数と用件の内訳は、今どこで見られますか。', en: 'Where can you see visit volumes and their purpose, branch by branch?' },
        ],
        triggers: ['店舗', '支店', '窓口', 'atm', 'インターネットバンキング', 'モバイルバンキング', 'チャネル', '来店', '非対面', 'branch', 'channel', 'online banking'],
      },
      {
        id: 'banking-back-office',
        name: { ja: '事務集中・後方事務', en: 'Back-office Operations' },
        group: 'core',
        universal: true,
        supersedes: ['service-delivery-production'],
        definition: {
          ja: 'チャネルで受け付けた手続きを、集中拠点で大量かつ正確に処理し切り、例外だけを人が見る形に保つ力。',
          en: 'Processing what the channels take in — accurately, at volume, from a central operation — so that only exceptions need a person.',
        },
        typicalL2: [
          { ja: '書類の受付・点検', en: 'Document intake and checking' },
          { ja: '集中処理・データ入力', en: 'Centralised processing and data entry' },
          { ja: '例外処理・照会対応', en: 'Exception handling and internal enquiry' },
          { ja: '事務品質・事務事故の管理', en: 'Operational quality and error management' },
        ],
        weakSigns: [
          { ja: '支店ごとに事務のやり方が違い、集中拠点に寄せられない書類が残り続ける。', en: 'Each branch works its own way, so a residue of paperwork can never be centralised.' },
          { ja: '事務事故の件数は数えているが原因分類が無く、同じ誤りが繰り返される。', en: 'Operational errors are counted but not classified, so the same mistake keeps happening.' },
        ],
        probes: [
          { ja: '手続き 1 件あたりの事務処理時間は、手続き別に測れていますか。', en: 'Is processing time per transaction measured, transaction type by transaction type?' },
          { ja: '支店で完結している事務のうち、集中拠点に寄せられるのは何割ですか。', en: 'Of the work still completed in branches, what share could move to the central operation?' },
        ],
        triggers: ['事務', '後方事務', '事務集中', '書類', '照合', 'back office', 'operations centre'],
      },
      {
        id: 'banking-wealth-distribution',
        name: { ja: '資産運用商品販売', en: 'Investment Product Distribution' },
        group: 'core',
        universal: false,
        definition: {
          ja: '投資信託・保険などの商品を、顧客の意向と適合性を確認したうえで提案・販売し、その過程を記録に残す力。',
          en: 'Proposing and selling investment and insurance products after confirming intent and suitability, and recording how that was done.',
        },
        typicalL2: [
          { ja: '顧客の意向・リスク許容度の把握', en: 'Capturing intent and risk tolerance' },
          { ja: '商品提案・説明記録', en: 'Proposal and evidence of explanation' },
          { ja: '適合性・勧誘ルールの遵守確認', en: 'Suitability and conduct rule checks' },
          { ja: '販売後のフォロー・残高推移の管理', en: 'After-sale follow-up and balance tracking' },
        ],
        weakSigns: [
          { ja: '販売時の説明記録が紙で散在し、苦情が出たときに当時の状況を再現できない。', en: 'Evidence of what was explained sits on paper in branches, and a complaint cannot be reconstructed.' },
          { ja: '販売実績は見えるが、購入後の顧客の損益や継続率は誰も見ていない。', en: 'Sales volumes are visible; what happened to the customer afterwards is measured by nobody.' },
        ],
        probes: [
          { ja: '販売から 1 年後の保有継続率と、顧客の損益分布は取れていますか。', en: 'Do you have one-year retention and the customer profit-and-loss distribution after purchase?' },
          { ja: '苦情が来たとき、当時の説明記録を何分で出せますか。', en: 'When a complaint arrives, how many minutes does it take to produce the record of what was explained?' },
        ],
        triggers: ['資産運用', '投資信託', '投信', 'nisa', '保険窓販', 'ファンド', '証券', '運用商品', 'investment', 'wealth'],
      },
      {
        id: 'banking-treasury-alm',
        name: { ja: '資金・ALM 運営', en: 'Treasury & ALM' },
        group: 'governing',
        universal: true,
        definition: {
          ja: '調達と運用の期間・金利・流動性の差を管理し、収益と資金繰りの両方を成り立たせる力。',
          en: 'Managing the maturity, rate, and liquidity gap between funding and assets so that both earnings and cash hold up.',
        },
        typicalL2: [
          { ja: '流動性・資金繰り管理', en: 'Liquidity and cash management' },
          { ja: '金利リスク(ALM)管理', en: 'Interest rate risk management' },
          { ja: '有価証券運用', en: 'Securities portfolio management' },
          { ja: '自己資本・資本配賦の管理', en: 'Capital adequacy and allocation' },
        ],
        weakSigns: [
          { ja: '金利シナリオ別の収益影響を出すのに数日かかり、判断が後追いになる。', en: 'Producing the earnings impact of a rate scenario takes days, so decisions always trail events.' },
          { ja: '営業現場の金利設定と ALM の想定が噛み合わず、実績が計画から外れ続ける。', en: 'Front-line pricing and ALM assumptions do not match, and results keep drifting from plan.' },
        ],
        probes: [
          { ja: '金利が 1 % 動いたときの収益影響を、何日で出せますか。', en: 'How many days does it take to produce the earnings impact of a one-point rate move?' },
          { ja: '預金の粘着性(金利上昇時に残る割合)の前提は、いつ誰が置いた数字ですか。', en: 'Your deposit stickiness assumption — who set that number, and when?' },
        ],
        triggers: ['alm', '金利', '流動性', '資金繰り', '有価証券', '自己資本', '資金調達', 'treasury', 'liquidity', 'interest rate'],
      },
      {
        id: 'banking-regulatory-reporting',
        name: { ja: '規制報告・当局対応', en: 'Regulatory Reporting & Supervisory Relations' },
        group: 'governing',
        universal: true,
        definition: {
          ja: '当局が求める報告を、期日と定義どおりに、社内の数字と一致した形で出し続ける力。',
          en: 'Producing what the supervisor asks for, on the due date, to their definitions, and consistent with the internal numbers.',
        },
        typicalL2: [
          { ja: '報告定義・データ定義の維持', en: 'Maintaining report and data definitions' },
          { ja: '報告データの作成・照合', en: 'Report production and reconciliation' },
          { ja: '提出・訂正の管理', en: 'Submission and correction management' },
          { ja: '検査・照会への対応', en: 'Examination and enquiry response' },
        ],
        weakSigns: [
          { ja: '報告のたびに部門ごとの数字が合わず、突合に人手と残業が消える。', en: 'Every reporting cycle the departments disagree, and reconciliation burns people and overtime.' },
          { ja: '同じ指標が経営報告と当局報告で違う値になり、どちらが正なのか誰も断言できない。', en: 'The same metric differs between the board pack and the regulatory return, and nobody will say which is right.' },
        ],
        probes: [
          { ja: '同じ指標が経営報告と当局報告で一致していますか。ずれるならどこで作り分けていますか。', en: 'Does the same metric match between the board pack and the regulatory return? If not, where do they diverge?' },
          { ja: '報告 1 本あたりの作成工数と、そのうち手作業の割合はどれくらいですか。', en: 'How many person-hours does one return take, and what share of that is manual?' },
        ],
        triggers: ['規制', '当局', '金融庁', '検査', 'バーゼル', '報告義務', 'regulatory', 'supervisory', 'basel'],
      },
    ],
    notes: [
      {
        ja: '勘定系(記録の正しさ)と顧客接点(変化の速さ)は別の速度で動く。能力マップでも両者を混ぜず、目標水準を別々に置くこと。',
        en: 'The ledger (correctness) and the customer channel (speed of change) run at different cadences. Keep them apart on the map and set separate target levels.',
      },
      {
        ja: '与信と AML の成熟度は「やっているか」ではなく「いつ・誰が・何を根拠に判断したかを再現できるか」で測る。',
        en: 'Maturity for credit and AML is not whether the activity happens but whether you can reconstruct who decided what, when, and on what basis.',
      },
      {
        ja: '社内では勘定系の用語、対外では商品名と、同じ業務が二重の語彙を持っている。どちらで書くかを最初に決めて統一する。',
        en: 'The same work has two vocabularies: core-banking jargon inside, product names outside. Decide which one the map uses before you start.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 金融(保険)
  // -------------------------------------------------------------------------
  {
    id: 'insurance',
    name: { ja: '金融(保険)', en: 'Insurance' },
    essence: {
      ja: '将来の不確実な損失を引き受け、保険料と支払の差で成り立つ。引受と支払の判断精度がそのまま収益になる。',
      en: 'Taking on uncertain future losses and living off the gap between premium and claims. Underwriting and claims judgement are the margin.',
    },
    aliases: ['insurance', '保険', '生保', '損保', '生命保険', '損害保険', '共済', '少額短期保険', 'insurer', 'insurtech'],
    detectors: ['保険', '保険料', '保険金', '契約者', '被保険者', '約款', '引受', '査定', '代理店', '募集', '責任準備金', '再保険', '給付金', '事故受付', 'premium', 'claims', 'policyholder', 'underwriting', 'actuarial'],
    capabilities: [
      {
        id: 'insurance-product-actuarial',
        name: { ja: '商品数理・料率設計', en: 'Product Actuarial & Pricing' },
        group: 'core',
        universal: true,
        definition: {
          ja: '引き受けるリスクを数量化し、約款と料率として成立させ、収益性を継続的に検証する力。',
          en: 'Quantifying the risk being taken, turning it into policy wording and rates, and continuously testing whether it still earns.',
        },
        typicalL2: [
          { ja: '商品開発・約款設計', en: 'Product development and policy wording' },
          { ja: '料率算定・改定', en: 'Rate setting and revision' },
          { ja: '収益性・損害率の検証', en: 'Profitability and loss ratio review' },
          { ja: '責任準備金の評価', en: 'Reserve valuation' },
        ],
        weakSigns: [
          { ja: '新商品を出すのに数年かかり、市場が動いたときに追随できない。', en: 'A new product takes years, so when the market shifts you cannot follow.' },
          { ja: '料率改定の根拠データが商品ごとにばらばらで、横比較ができない。', en: 'The data behind each rate revision is assembled differently per product, so nothing can be compared across the portfolio.' },
        ],
        probes: [
          { ja: '商品の企画から発売まで、直近の実績で何か月かかりましたか。', en: 'For the most recent launch, how many months from concept to on sale?' },
          { ja: '商品別の損害率・費用率を、何日遅れで見られますか。', en: 'With what lag can you see loss ratio and expense ratio by product?' },
        ],
        triggers: ['約款', '料率', '保険料', '責任準備金', '損害率', '数理', 'アクチュアリー', 'actuarial', 'pricing', 'reserve'],
      },
      {
        id: 'insurance-distribution',
        name: { ja: '募集・チャネル管理', en: 'Distribution & Agency Management' },
        group: 'core',
        universal: true,
        supersedes: ['sales-order'],
        definition: {
          ja: '代理店・募集人・直販などの販売網を、募集ルールを守れる状態に保ちながら運営する力。',
          en: 'Running the distribution network — agencies, licensed sellers, direct — while keeping it inside the conduct rules.',
        },
        typicalL2: [
          { ja: '代理店・募集人の登録・教育', en: 'Agency and seller registration and training' },
          { ja: '募集品質・比較推奨の管理', en: 'Conduct quality and comparison-recommendation control' },
          { ja: '手数料体系の設計・運用', en: 'Commission scheme design and operation' },
          { ja: 'チャネル別の実績管理', en: 'Performance management by channel' },
        ],
        weakSigns: [
          { ja: '代理店ごとの実質的な収益性が見えず、手数料の妥当性を説明できない。', en: 'Real profitability per agency is invisible, so commission levels cannot be justified.' },
          { ja: '募集時の記録が代理店の手元にしかなく、苦情や検査で自社が説明できない。', en: 'Records of the sales conversation stay with the agency, leaving the insurer unable to explain itself in a complaint or an examination.' },
        ],
        probes: [
          { ja: '代理店別の損害率と継続率を、同じ画面で並べて見られますか。', en: 'Can you see loss ratio and persistency side by side, agency by agency?' },
          { ja: '募集記録は誰が保管し、何年残していますか。', en: 'Who keeps the record of the sales conversation, and for how many years?' },
        ],
        triggers: ['代理店', '募集', '募集人', '乗合', '直販', '手数料', 'agency', 'broker', 'commission', 'distribution'],
      },
      {
        id: 'insurance-underwriting',
        name: { ja: '引受・査定', en: 'Underwriting & Risk Selection' },
        group: 'core',
        universal: true,
        definition: {
          ja: '申込を受けるか、条件を付けるか、断るかを、基準に沿って判断し、再保険まで含めてリスク量を制御する力。',
          en: 'Deciding to accept, load, or decline against defined criteria, and controlling total exposure including reinsurance.',
        },
        typicalL2: [
          { ja: '告知・診査・リスク情報の取得', en: 'Disclosure, medical, and risk information capture' },
          { ja: '引受基準の維持・自動判定', en: 'Underwriting rules and automated decisioning' },
          { ja: '特別条件・謝絶の判断', en: 'Loading and decline decisions' },
          { ja: '再保険の手配・出再管理', en: 'Reinsurance placement and cession' },
        ],
        weakSigns: [
          { ja: '自動査定率が上がらず、担当者の目視査定が滞留のボトルネックになっている。', en: 'The straight-through rate never improves and manual review is the queue.' },
          { ja: '引受基準の変更が現場に伝わるまで時間がかかり、支社ごとに運用が違う。', en: 'Changes to underwriting rules take time to reach the front line, so each office applies a different vintage.' },
        ],
        probes: [
          { ja: '申込のうち、人手を介さず成立するのは何割ですか。', en: 'What share of applications complete without a human touching them?' },
          { ja: '引受基準を 1 つ変えるのに、システム改修は何か月かかりますか。', en: 'To change one underwriting rule, how many months of system work is needed?' },
        ],
        triggers: ['引受', '査定', '告知', '診査', '謝絶', '特別条件', '再保険', 'underwriting', 'reinsurance'],
      },
      {
        id: 'insurance-policy-admin',
        name: { ja: '契約保全', en: 'Policy Administration' },
        group: 'core',
        universal: true,
        definition: {
          ja: '成立した契約を、変更・更新・失効・復活まで、契約者の申出どおりに正しく維持し続ける力。',
          en: 'Keeping a live policy correct through changes, renewals, lapses, and reinstatements, exactly as the policyholder asked.',
        },
        typicalL2: [
          { ja: '契約内容変更・受取人変更', en: 'Policy and beneficiary changes' },
          { ja: '更新・継続手続', en: 'Renewal and continuation' },
          { ja: '失効・復活・解約', en: 'Lapse, reinstatement, and surrender' },
          { ja: '契約者情報の維持', en: 'Policyholder information upkeep' },
        ],
        weakSigns: [
          { ja: '住所変更が商品ごとに別々に必要で、契約者が同じ手続きを何度もさせられる。', en: 'A change of address must be filed per product, so the customer does the same thing several times.' },
          { ja: '旧契約が古いシステムに残り、変更のたびに手作業の転記が発生する。', en: 'Legacy policies sit on an old system and every change means manual re-keying.' },
        ],
        probes: [
          { ja: '契約者が住所を変えたとき、更新が必要なシステムはいくつありますか。', en: 'When a policyholder moves, how many systems have to be updated?' },
          { ja: '手続きの何割がオンラインで完結しますか。残りは何が止めていますか。', en: 'What share of service requests complete online, and what blocks the rest?' },
        ],
        triggers: ['契約保全', '契約者', '被保険者', '受取人', '失効', '復活', '解約返戻', 'policy administration', 'policyholder'],
      },
      {
        id: 'insurance-claims',
        name: { ja: '保険金・給付金支払', en: 'Claims Management' },
        group: 'core',
        universal: true,
        supersedes: ['service-delivery-production'],
        definition: {
          ja: '事故・請求を受け付け、事実を確認し、支払うか否かと金額を判断して、約束どおりに支払う力。保険という商品が実際に姿を現す唯一の場面。',
          en: 'Taking the notification, establishing the facts, deciding whether and how much to pay, and paying as promised — the only moment the product actually appears.',
        },
        typicalL2: [
          { ja: '事故受付・初期対応', en: 'First notification of loss and initial response' },
          { ja: '事実確認・調査', en: 'Investigation and fact finding' },
          { ja: '支払査定・免責判断', en: 'Adjudication and exclusion decisions' },
          { ja: '不正請求の検知', en: 'Fraudulent claim detection' },
        ],
        weakSigns: [
          { ja: '支払までの日数が担当者と支社で大きく違い、その理由が説明できない。', en: 'Days-to-pay varies widely by adjuster and by office, and nobody can explain why.' },
          { ja: '不払い・支払漏れの点検が事後の一斉調査でしか行われない。', en: 'Missed payments are found only through occasional retrospective sweeps.' },
        ],
        probes: [
          { ja: '受付から支払までの日数の中央値と、最も遅い 10 % は何日ですか。', en: 'What is the median days from notification to payment, and what about the slowest ten percent?' },
          { ja: '支払漏れを検知する仕組みは、事後調査以外に何がありますか。', en: 'Besides retrospective sweeps, what detects a payment that should have been made?' },
        ],
        triggers: ['保険金', '給付金', '支払', '事故受付', '査定', '不払い', '不正請求', 'claims', 'fnol', 'adjuster'],
      },
      {
        id: 'insurance-premium-collection',
        name: { ja: '保険料収納・精算', en: 'Premium Collection & Settlement' },
        group: 'core',
        universal: true,
        supersedes: ['billing-collection'],
        definition: {
          ja: '保険料を約定どおり集め、未納を管理し、代理店手数料や共同保険の精算まで合わせ切る力。',
          en: 'Collecting premium as agreed, managing arrears, and settling commissions and co-insurance shares to the last unit.',
        },
        typicalL2: [
          { ja: '保険料の請求・収納', en: 'Premium billing and collection' },
          { ja: '未納・失効予告の管理', en: 'Arrears and lapse warning' },
          { ja: '代理店手数料の計算・支払', en: 'Commission calculation and payment' },
          { ja: '共同保険・再保険の精算', en: 'Co-insurance and reinsurance settlement' },
        ],
        weakSigns: [
          { ja: '手数料計算に例外が多すぎて、月次で表計算による手修正が発生する。', en: 'Commission has so many exceptions that every month ends in spreadsheet corrections.' },
          { ja: '未納の連絡が遅れ、防げたはずの失効が積み上がる。', en: 'Arrears contact goes out late and preventable lapses pile up.' },
        ],
        probes: [
          { ja: '手数料計算の例外ルールは何種類ありますか。誰が全部を把握していますか。', en: 'How many exception rules exist in commission calculation, and who knows all of them?' },
          { ja: '未納の一次連絡は何日目に出ますか。失効までに何回接触しますか。', en: 'On what day does the first arrears contact go out, and how many contacts happen before lapse?' },
        ],
        triggers: ['保険料', '収納', '未納', '手数料精算', '共同保険', 'premium', 'commission settlement'],
      },
    ],
    notes: [
      {
        ja: '保険は「引受」と「支払」で同じリスクを二度判断する。この 2 つの基準がずれていると、どれだけ売っても利益が残らない。能力マップでは必ず両方を独立に置く。',
        en: 'Insurance judges the same risk twice, at underwriting and at claim. If the two standards drift apart, volume never becomes profit — keep both on the map, independently.',
      },
      {
        ja: '代理店が持つ情報は自社の情報ではない。募集記録・顧客接点をどちらが正本として持つかを、能力の議論の前に決めること。',
        en: 'What the agency holds is not yours. Decide who owns the system of record for sales evidence and customer contact before debating capabilities.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 製造
  // -------------------------------------------------------------------------
  {
    id: 'manufacturing',
    name: { ja: '製造', en: 'Manufacturing' },
    essence: {
      ja: '設計した物を、決めた品質・原価・納期で繰り返し作って売る。設計・生産・調達・保守の情報がつながっているかで勝負が決まる。',
      en: 'Making a designed thing repeatedly to a set quality, cost, and date. Whether design, production, sourcing, and service share information decides the outcome.',
    },
    aliases: ['manufacturing', '製造', '製造業', 'メーカー', '工場', '機械', '部品', '素材', '化学', '自動車', '電機', 'factory', 'plant', 'industrial'],
    detectors: ['工場', '生産', '製造', '受注生産', '組立', '加工', '部品', '部品表', 'bom', '設計', '図面', '在庫', '出荷', '調達', '仕入', '据付', '保守', '歩留', '不良', 'ライン', '設備', 'production', 'assembly', 'shop floor', 'supplier'],
    capabilities: [
      {
        id: 'mfg-product-engineering',
        name: { ja: '製品設計・技術情報管理', en: 'Product Engineering & Technical Data' },
        group: 'core',
        universal: true,
        definition: {
          ja: '製品の形・仕様・構成を決め、図面と部品表を正本として保ち、変更を後工程に確実に伝える力。',
          en: 'Deciding shape, specification, and structure, holding drawings and the bill of materials as the record, and pushing every change downstream reliably.',
        },
        typicalL2: [
          { ja: '仕様・要求の管理', en: 'Requirements and specification management' },
          { ja: '設計・図面の版管理', en: 'Design and drawing version control' },
          { ja: '部品表(BOM)の維持', en: 'Bill of materials maintenance' },
          { ja: '設計変更(ECO)の展開', en: 'Engineering change propagation' },
        ],
        weakSigns: [
          { ja: '設計・製造・保守がそれぞれ別の部品表を持ち、どれが正なのか誰も断言できない。', en: 'Design, production, and service each hold their own bill of materials and nobody will say which one is right.' },
          { ja: '設計変更が現場に伝わらず、旧図面で作られた仕掛品が後から見つかる。', en: 'A change never reaches the floor and work-in-progress built to the old drawing turns up later.' },
        ],
        probes: [
          { ja: '部品表は今いくつ存在しますか。設計・製造・保守で同じものを見ていますか。', en: 'How many bills of materials exist today? Do design, production, and service look at the same one?' },
          { ja: '設計変更が現場の作業指示に反映されるまで、何日かかりますか。', en: 'How many days from an engineering change to the shop-floor instruction reflecting it?' },
        ],
        triggers: ['設計', '図面', '仕様', '部品表', 'bom', '設計変更', 'cad', 'plm', 'engineering', 'drawing'],
      },
      {
        id: 'mfg-production-planning',
        name: { ja: '生産計画・所要量計画', en: 'Production & Material Planning' },
        group: 'core',
        universal: true,
        definition: {
          ja: '需要と能力を突き合わせ、いつ何をどれだけ作るかを決めて、材料と人と設備を間に合わせる力。',
          en: 'Reconciling demand with capacity, deciding what to build and when, and getting material, people, and machines there in time.',
        },
        typicalL2: [
          { ja: '需給計画・基準生産計画', en: 'Demand-supply and master production planning' },
          { ja: '所要量展開・発注計画', en: 'Material requirements and order planning' },
          { ja: '能力・負荷の調整', en: 'Capacity and load levelling' },
          { ja: '納期回答', en: 'Delivery date commitment' },
        ],
        weakSigns: [
          { ja: '納期回答が営業の勘で行われ、後から工場が無理をして帳尻を合わせている。', en: 'Delivery dates are promised on instinct by sales and the plant is left to make them true.' },
          { ja: '計画の見直しが週次で、変更が起きるたびに現場が個別調整で走り回る。', en: 'Replanning happens weekly, so every change turns into individual firefighting on the floor.' },
        ],
        probes: [
          { ja: '納期回答は誰が、何を見て出していますか。その精度(遵守率)は測っていますか。', en: 'Who commits the delivery date, looking at what, and is the resulting on-time rate measured?' },
          { ja: '計画を組み直すのに何時間かかりますか。1 日に何回組み直せますか。', en: 'How long does a replan take, and how many times a day can you do it?' },
        ],
        triggers: ['生産計画', '所要量', 'mrp', '納期', '納期回答', '受注生産', '需給', '負荷', '工程計画', 'planning', 'scheduling', 'capacity'],
      },
      {
        id: 'mfg-production-operations',
        name: { ja: '製造実行・工程管理', en: 'Manufacturing Execution' },
        group: 'core',
        universal: true,
        supersedes: ['service-delivery-production'],
        definition: {
          ja: '計画を作業指示に落とし、現場の進捗・実績・設備稼働を把握しながら、決めた品質で作り切る力。',
          en: 'Turning the plan into work instructions and finishing to the required quality while tracking progress, actuals, and machine availability.',
        },
        typicalL2: [
          { ja: '作業指示・工順管理', en: 'Work order and routing management' },
          { ja: '進捗・実績収集', en: 'Progress and actual data capture' },
          { ja: '工程内検査・不良処理', en: 'In-process inspection and defect handling' },
          { ja: '設備稼働・保全の管理', en: 'Equipment availability and maintenance' },
        ],
        weakSigns: [
          { ja: '進捗が日報の手入力でしか分からず、遅れが判明するのが翌日以降になる。', en: 'Progress exists only in hand-typed daily reports, so a delay surfaces the next day at the earliest.' },
          { ja: '設備停止の理由が記録されず、同じ停止が何度も繰り返される。', en: 'Downtime reasons are not recorded and the same stoppage repeats.' },
        ],
        probes: [
          { ja: '今この瞬間の工程別進捗は、どこで何分遅れで見られますか。', en: 'Where can you see progress by process right now, and how many minutes behind is it?' },
          { ja: '設備の停止時間と理由は、機械別に集計できますか。', en: 'Can downtime and its reasons be aggregated per machine?' },
        ],
        triggers: ['製造', '生産', '組立', '加工', 'ライン', '工程', '作業指示', '稼働', 'mes', 'shop floor', 'production'],
      },
      {
        id: 'mfg-supplier-management',
        name: { ja: '調達・サプライヤ管理', en: 'Sourcing & Supplier Management' },
        group: 'core',
        universal: true,
        supersedes: ['sourcing-procurement'],
        definition: {
          ja: '必要な部品・材料を、必要な時期・価格・品質で確保し、供給元の実力と供給リスクを継続的に把握する力。',
          en: 'Securing parts and materials at the needed time, price, and quality, and continuously knowing the capability and risk of each source.',
        },
        typicalL2: [
          { ja: 'サプライヤ選定・評価', en: 'Supplier selection and rating' },
          { ja: '単価・契約の管理', en: 'Price and contract management' },
          { ja: '納期確約・督促', en: 'Delivery commitment and expediting' },
          { ja: '供給リスク・代替品の管理', en: 'Supply risk and alternate part management' },
        ],
        weakSigns: [
          { ja: '一社購買の部品がどれだけあるか誰も把握しておらず、供給が止まって初めて分かる。', en: 'Nobody knows how many parts are single-sourced until one of them stops arriving.' },
          { ja: '同じ部品を工場ごとに別の価格で買っており、合算購買力が使えていない。', en: 'The same part is bought at different prices per plant, and combined leverage is never used.' },
        ],
        probes: [
          { ja: '一社購買の部品は何点で、そのうち代替品が特定できているのは何点ですか。', en: 'How many parts are single-sourced, and for how many of those is an alternate identified?' },
          { ja: '主要部品の調達リードタイムは、直近 1 年でどう動きましたか。', en: 'How have lead times for your key parts moved over the last twelve months?' },
        ],
        triggers: ['調達', '仕入', '購買', 'サプライヤ', '仕入先', '外注', '部品', 'リードタイム', 'sourcing', 'procurement', 'supplier'],
      },
      {
        id: 'mfg-inventory-logistics',
        name: { ja: '在庫・物流運営', en: 'Inventory & Logistics Operations' },
        group: 'core',
        universal: true,
        supersedes: ['supply-logistics'],
        definition: {
          ja: '材料・仕掛・製品の在庫を必要な量に保ち、倉庫と輸送を通じて約束した場所と時刻に届ける力。',
          en: 'Holding material, work-in-progress, and finished goods at the right level, and delivering to the promised place and time through warehousing and transport.',
        },
        typicalL2: [
          { ja: '在庫計画・適正在庫の設定', en: 'Inventory planning and target levels' },
          { ja: '倉庫・保管の運営', en: 'Warehouse operations' },
          { ja: '出荷・輸送手配', en: 'Shipping and transport arrangement' },
          { ja: '輸出入・通関対応', en: 'Import, export, and customs' },
        ],
        weakSigns: [
          { ja: '帳簿在庫と現物が合わず、棚卸のたびに差異の説明で時間が溶ける。', en: 'Book and physical stock disagree, and every count is spent explaining the difference.' },
          { ja: '欠品を恐れて安全在庫を積み増し、滞留在庫が資金を固定している。', en: 'Fear of stockout inflates safety stock and dead inventory freezes cash.' },
        ],
        probes: [
          { ja: '在庫回転率と滞留在庫額を、品目区分別に見られますか。', en: 'Can you see turns and dead stock value by item category?' },
          { ja: '棚卸差異は直近でどれくらい出ましたか。原因の内訳は取れていますか。', en: 'How large was the last count variance, and do you have the cause breakdown?' },
        ],
        triggers: ['在庫', '倉庫', '出荷', '配送', '物流', '棚卸', '通関', '輸出', 'inventory', 'warehouse', 'shipping', 'logistics'],
      },
      {
        id: 'mfg-quality-traceability',
        name: { ja: '品質保証・トレーサビリティ', en: 'Quality Assurance & Traceability' },
        group: 'governing',
        universal: true,
        supersedes: ['quality-management'],
        definition: {
          ja: '決めた品質で作れていることを検査と記録で示し、問題が起きたときに影響範囲をロット単位で特定できる力。',
          en: 'Demonstrating through inspection and records that quality is being met, and being able to bound the impact to specific lots when it is not.',
        },
        typicalL2: [
          { ja: '検査基準・検査の実施', en: 'Inspection standards and execution' },
          { ja: '不適合・是正処置の管理', en: 'Nonconformance and corrective action' },
          { ja: 'ロット・製造履歴の追跡', en: 'Lot and build history traceability' },
          { ja: '市場クレーム・リコール対応', en: 'Field complaint and recall response' },
        ],
        weakSigns: [
          { ja: '不良の原因分析が担当者の経験に依存し、同じ不良が別ラインで再発する。', en: 'Root cause depends on an individual, and the same defect reappears on another line.' },
          { ja: '出荷先の特定に数日かかり、リコール範囲を絞れず全数回収になる。', en: 'Identifying who received the lot takes days, so the recall cannot be narrowed and everything comes back.' },
        ],
        probes: [
          { ja: '「このロットがどこへ行ったか」を何時間で答えられますか。', en: 'How many hours to answer "where did this lot go"?' },
          { ja: '不良の是正処置が有効だったかを、後から確認する仕組みはありますか。', en: 'Is there a mechanism that later confirms whether a corrective action actually worked?' },
        ],
        triggers: ['品質', '検査', '不良', '歩留', 'トレーサビリティ', 'ロット', 'リコール', 'クレーム', 'quality', 'defect', 'traceability', 'recall'],
      },
      {
        id: 'mfg-field-service',
        name: { ja: '据付・アフターサービス', en: 'Installation & Field Service' },
        group: 'core',
        universal: false,
        definition: {
          ja: '売った後の据付・保守・部品供給を通じて、製品が客先で動き続ける状態を保ち、そこから継続収益を得る力。',
          en: 'Keeping the product running at the customer site through installation, maintenance, and spares — and earning recurring revenue from it.',
        },
        typicalL2: [
          { ja: '据付・試運転・立会', en: 'Installation, commissioning, and handover' },
          { ja: '保守契約・定期点検の管理', en: 'Service contract and scheduled maintenance' },
          { ja: '補修部品の供給', en: 'Spare parts supply' },
          { ja: '遠隔監視・予防保全', en: 'Remote monitoring and preventive maintenance' },
        ],
        weakSigns: [
          { ja: '客先の製品構成・改造履歴が担当者の手帳にしかなく、担当が変わると分からなくなる。', en: 'The as-installed configuration and modification history live in one engineer’s notebook and vanish when they leave.' },
          { ja: '保守要員の高齢化が進み、若手が現地対応できるまでの育成期間が読めない。', en: 'The service workforce is ageing and nobody can say how long it takes to make a junior engineer site-ready.' },
        ],
        probes: [
          { ja: '客先ごとの現在の製品構成(改造・部品交換の履歴込み)は、どこで見られますか。', en: 'Where can you see the current as-installed configuration per customer, modifications and part swaps included?' },
          { ja: '保守売上は全社売上の何 % ですか。その比率を上げる計画はありますか。', en: 'What percentage of revenue is service, and is there a plan to raise it?' },
        ],
        triggers: ['据付', '保守', 'メンテナンス', 'アフターサービス', '点検', '補修部品', 'サービス員', '故障対応', 'field service', 'maintenance', 'installation', 'spare parts'],
      },
      {
        id: 'mfg-cost-management',
        name: { ja: '原価管理', en: 'Product Cost Management' },
        group: 'governing',
        universal: true,
        definition: {
          ja: '製品 1 個あたりにいくらかかっているかを、見積・標準・実際の 3 つで捉え、差異の原因まで説明できる力。',
          en: 'Knowing what one unit actually costs — quoted, standard, and actual — and being able to explain where the variance came from.',
        },
        typicalL2: [
          { ja: '見積原価の算定', en: 'Quotation costing' },
          { ja: '標準原価の設定・改定', en: 'Standard cost setting and revision' },
          { ja: '実際原価の集計', en: 'Actual cost collection' },
          { ja: '原価差異の分析', en: 'Variance analysis' },
        ],
        weakSigns: [
          { ja: '受注時の見積原価と実際原価を突き合わせておらず、赤字案件が決算まで分からない。', en: 'Quoted and actual cost are never compared, so a loss-making order is discovered at year end.' },
          { ja: '間接費の配賦基準が何年も見直されておらず、製品別の損益が実態と合わない。', en: 'The overhead allocation basis has not been revisited in years and product profitability is fiction.' },
        ],
        probes: [
          { ja: '案件別の見積原価と実際原価の差は、いつ、誰が見ていますか。', en: 'Who looks at quoted versus actual cost per order, and when?' },
          { ja: '製品別の損益を出すのに何日かかりますか。', en: 'How many days does it take to produce profitability by product?' },
        ],
        triggers: ['原価', '見積', '標準原価', '差異', '採算', 'コスト', 'costing', 'cost variance'],
      },
    ],
    notes: [
      {
        ja: '生産設備は 10〜20 年動く。IT の 3〜5 年サイクルで目標を置くと現場と衝突する。能力ごとに「更新の周期」を別に持たせること。',
        en: 'Production equipment lives 10–20 years. Setting targets on an IT-style 3–5 year cycle guarantees a fight with the plant; carry a refresh cadence per capability.',
      },
      {
        ja: '「部品表が 3 つある」は製造業のほぼ全社で起きている。能力マップを描く前に、設計・製造・保守のどれが正本かを事実として確認する。',
        en: 'Three bills of materials is close to universal in manufacturing. Before drawing the map, establish as fact which of design, production, or service is the record.',
      },
      {
        ja: '受注生産と量産では同じ「生産計画」でも中身が別物になる。どちらの型かを事業側に確認してから L2 を切ること。',
        en: 'Make-to-order and make-to-stock hide completely different work behind the same words. Confirm which one before splitting to L2.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 医療
  // -------------------------------------------------------------------------
  {
    id: 'healthcare',
    name: { ja: '医療・ヘルスケア', en: 'Healthcare' },
    essence: {
      ja: '患者に医療を提供し、その対価の多くを保険者から受け取る。品質と安全の要求水準が事業存続の条件になる。',
      en: 'Delivering care to patients while most of the money arrives from a payer. Quality and safety thresholds are conditions of staying in business.',
    },
    aliases: ['healthcare', 'health care', '医療', '病院', '診療所', 'クリニック', 'ヘルスケア', '介護', '医療機関', 'hospital', 'clinic', 'provider'],
    detectors: ['患者', '診療', '外来', '入院', '看護', 'カルテ', 'レセプト', '診療報酬', '医薬品', '処方', '検査', '手術', '院内', '医師', '病床', '感染対策', 'patient', 'clinical', 'inpatient', 'outpatient', 'medical record'],
    capabilities: [
      {
        id: 'healthcare-care-delivery',
        name: { ja: '診療・患者ケア提供', en: 'Clinical Care Delivery' },
        group: 'core',
        universal: true,
        supersedes: ['service-delivery-production'],
        definition: {
          ja: '患者の状態を評価し、診断・治療・看護を多職種で組み立てて提供し、転帰まで見届ける力。',
          en: 'Assessing the patient, assembling diagnosis, treatment, and nursing across professions, delivering it, and following the outcome.',
        },
        typicalL2: [
          { ja: '外来診療', en: 'Outpatient care' },
          { ja: '入院診療・病棟運営', en: 'Inpatient care and ward operations' },
          { ja: '検査・手術の実施', en: 'Diagnostics and procedures' },
          { ja: '多職種連携・退院支援', en: 'Multidisciplinary coordination and discharge planning' },
        ],
        weakSigns: [
          { ja: '同じ疾患でも医師ごとに手順が違い、結果のばらつきの原因を特定できない。', en: 'The same condition is handled differently by each physician and the source of outcome variation cannot be found.' },
          { ja: '退院調整が属人的で、在院日数が病棟ごとに大きく違う。', en: 'Discharge planning depends on individuals and length of stay differs sharply between wards.' },
        ],
        probes: [
          { ja: '主要な疾患群について、診療の標準手順はどこまで文書化されていますか。', en: 'For your main conditions, how far are care pathways actually documented?' },
          { ja: '在院日数と再入院率は、診療科別に見られますか。', en: 'Can you see length of stay and readmission rate by department?' },
        ],
        triggers: ['診療', '外来', '入院', '看護', '手術', '病棟', '治療', '医師', 'clinical', 'inpatient', 'outpatient', 'nursing'],
      },
      {
        id: 'healthcare-patient-access',
        name: { ja: '患者受付・予約', en: 'Patient Access & Scheduling' },
        group: 'core',
        universal: true,
        supersedes: ['sales-order'],
        definition: {
          ja: '患者が医療にたどり着くまでの受付・予約・紹介を整え、限られた枠と人を最も要る人に割り当てる力。',
          en: 'Getting the patient in — reception, booking, referral — and allocating scarce slots and staff to those who need them most.',
        },
        typicalL2: [
          { ja: '初診受付・患者登録', en: 'Registration and first visit intake' },
          { ja: '予約枠の設計・管理', en: 'Slot design and booking management' },
          { ja: '紹介・逆紹介の管理', en: 'Referral in and referral back' },
          { ja: '待ち時間・当日運用の管理', en: 'Waiting time and same-day flow' },
        ],
        weakSigns: [
          { ja: '予約枠が診療科ごとの慣習で決まり、空き枠と待ち行列が同時に存在する。', en: 'Slots follow departmental custom, so empty capacity and long queues exist at the same time.' },
          { ja: '紹介元への返書が遅れ、地域の医療機関からの紹介が減っていく。', en: 'Reply letters to referrers go out late and referrals from the community quietly decline.' },
        ],
        probes: [
          { ja: '予約から受診までの待ち日数は、診療科別に見られますか。', en: 'Can you see wait days from booking to visit, by department?' },
          { ja: '当日キャンセルと無断キャンセルの率はいくつですか。埋め戻しの仕組みはありますか。', en: 'What are your same-day and no-show cancellation rates, and is there a mechanism to refill the slot?' },
        ],
        triggers: ['受付', '予約', '紹介', '待ち時間', '初診', '再診', 'patient access', 'scheduling', 'referral'],
      },
      {
        id: 'healthcare-clinical-records',
        name: { ja: '診療情報管理', en: 'Clinical Documentation & Records' },
        group: 'enabling',
        universal: true,
        definition: {
          ja: '診療の事実を記録として残し、必要な人が必要なときに参照でき、保存・開示・二次利用まで統制する力。',
          en: 'Recording what was done to whom, making it available to those who need it, and governing retention, disclosure, and secondary use.',
        },
        typicalL2: [
          { ja: '診療記録の記載・監査', en: 'Documentation and record audit' },
          { ja: '病名・コーディングの管理', en: 'Diagnosis coding' },
          { ja: '記録の保存・開示請求対応', en: 'Retention and disclosure requests' },
          { ja: '研究・分析への二次利用', en: 'Secondary use for research and analysis' },
        ],
        weakSigns: [
          { ja: '記録が部門システムに分散し、患者 1 人の経過を追うのに複数の画面を開く必要がある。', en: 'Records scatter across departmental systems and following one patient means opening several screens.' },
          { ja: '記録の質が医師ごとに違い、後から見て何が行われたか分からない例が出る。', en: 'Documentation quality varies by clinician and some episodes cannot be reconstructed at all.' },
        ],
        probes: [
          { ja: '1 人の患者の 5 年分の経過を、何画面で追えますか。', en: 'How many screens does it take to follow five years of one patient?' },
          { ja: '記録の保存年限と削除の運用は、誰が管理していますか。', en: 'Who manages retention periods and the actual deletion of records?' },
        ],
        triggers: ['カルテ', '診療記録', '電子カルテ', '病名', 'コーディング', '開示', '保存年限', 'medical record', 'documentation', 'ehr'],
      },
      {
        id: 'healthcare-revenue-cycle',
        name: { ja: '医事会計・診療報酬請求', en: 'Billing & Reimbursement' },
        group: 'core',
        universal: true,
        supersedes: ['billing-collection'],
        definition: {
          ja: '行った医療を制度の算定ルールに沿って請求に変換し、査定・返戻を減らしながら収入を確実に受け取る力。',
          en: 'Converting the care given into a claim under the payment rules, and collecting it while keeping rejections and adjustments down.',
        },
        typicalL2: [
          { ja: '診療行為の算定・入力', en: 'Charge capture and coding' },
          { ja: '請求データの作成・点検', en: 'Claim production and pre-submission checking' },
          { ja: '返戻・査定への対応', en: 'Rejection and adjustment handling' },
          { ja: '窓口収納・未収金の管理', en: 'Point-of-service collection and receivables' },
        ],
        weakSigns: [
          { ja: '返戻・査定の原因分析が事後の個別対応にとどまり、同じ理由の返戻が毎月出る。', en: 'Rejections are fixed one by one after the fact and the same reason recurs every month.' },
          { ja: '算定漏れが月末の点検でしか見つからず、締め直前に人手が集中する。', en: 'Missed charges surface only in the month-end check, concentrating effort right before cutoff.' },
        ],
        probes: [
          { ja: '返戻率・査定率は月次でいくつですか。上位 3 つの理由は何ですか。', en: 'What are the monthly rejection and adjustment rates, and what are the top three reasons?' },
          { ja: '算定漏れを診療当日に検知する仕組みはありますか。', en: 'Is there anything that catches a missed charge on the day of care?' },
        ],
        triggers: ['レセプト', '診療報酬', '算定', '医事', '返戻', '査定', '未収金', 'claim', 'reimbursement', 'billing'],
      },
      {
        id: 'healthcare-pharmacy-supply',
        name: { ja: '医薬品・医療材料管理', en: 'Pharmacy & Medical Supply Management' },
        group: 'enabling',
        universal: true,
        definition: {
          ja: '医薬品と医療材料を、必要な時に、期限内の物を、正しい患者に渡るまで管理する力。',
          en: 'Managing drugs and consumables so that unexpired stock is on hand when needed and reaches the right patient.',
        },
        typicalL2: [
          { ja: '在庫・期限・ロット管理', en: 'Stock, expiry, and lot control' },
          { ja: '発注・仕入・価格交渉', en: 'Ordering, purchasing, and price negotiation' },
          { ja: '調剤・払出・投薬管理', en: 'Dispensing and administration' },
          { ja: '医療材料の使用実績管理', en: 'Consumable usage tracking' },
        ],
        weakSigns: [
          { ja: '部署ごとに院内在庫を抱えており、期限切れ廃棄が把握できていない。', en: 'Each unit hoards its own stock and expiry write-offs are never totalled.' },
          { ja: '高額材料の使用実績が症例と結び付かず、収支が症例単位で見えない。', en: 'High-cost consumables are not tied to cases, so case-level economics are invisible.' },
        ],
        probes: [
          { ja: '期限切れ廃棄額は年間いくらですか。部署別に出せますか。', en: 'What is the annual expiry write-off, and can you break it down by unit?' },
          { ja: '高額医療材料の使用は、症例単位で紐づいていますか。', en: 'Are high-cost consumables linked to individual cases?' },
        ],
        triggers: ['医薬品', '薬剤', '処方', '調剤', '医療材料', 'spd', '在庫', '期限', 'pharmacy', 'medication', 'supply'],
      },
      {
        id: 'healthcare-safety',
        name: { ja: '医療安全・感染対策', en: 'Patient Safety & Infection Control' },
        group: 'governing',
        universal: true,
        definition: {
          ja: '起きた事象と起きかけた事象を集め、原因を分析し、現場の手順に反映して同じ事故を防ぎ続ける力。',
          en: 'Collecting incidents and near misses, analysing cause, folding the result back into practice, and preventing repeats.',
        },
        typicalL2: [
          { ja: 'インシデント・アクシデント報告', en: 'Incident and near-miss reporting' },
          { ja: '原因分析・改善策の展開', en: 'Root cause analysis and countermeasure rollout' },
          { ja: '感染管理・サーベイランス', en: 'Infection control and surveillance' },
          { ja: '医療機器の保守・点検', en: 'Medical device maintenance and inspection' },
        ],
        weakSigns: [
          { ja: '報告件数が少ない部署を「安全な部署」と扱っており、実際は報告されていないだけ。', en: 'Units with few reports are treated as safe when in fact nothing is being reported.' },
          { ja: '改善策が通知文の発行で終わり、現場の手順が変わったかを確認していない。', en: 'Countermeasures end with a circular and nobody checks whether practice actually changed.' },
        ],
        probes: [
          { ja: '部署別の報告件数の差は、安全性の差ですか、報告文化の差ですか。どちらか確認していますか。', en: 'Is the difference in report counts between units a safety difference or a reporting-culture difference — and have you checked?' },
          { ja: '改善策の実施状況を、現場で確認する仕組みはありますか。', en: 'What mechanism verifies at the bedside that a countermeasure is in place?' },
        ],
        triggers: ['医療安全', 'インシデント', 'ヒヤリハット', '感染', '院内感染', '医療事故', '機器点検', 'patient safety', 'infection control', 'incident'],
      },
    ],
    notes: [
      {
        ja: '医療は「対価を払う人(保険者)」と「サービスを受ける人(患者)」が別。能力マップでも収入の流れと医療の流れを別の線として描くこと。',
        en: 'In healthcare the payer and the patient are different people. Draw the money flow and the care flow as separate lines on the map.',
      },
      {
        ja: '診療の標準化は「医師の裁量を奪う話」と受け取られやすい。能力の議論では、裁量を残す範囲を先に決めてから入ること。',
        en: 'Standardising care is easily heard as taking clinical autonomy away. Agree where discretion stays before opening the capability discussion.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 小売・EC
  // -------------------------------------------------------------------------
  {
    id: 'retail-ecommerce',
    name: { ja: '小売・EC', en: 'Retail & E-commerce' },
    essence: {
      ja: '仕入れた物を、店舗やオンラインで売る。品揃えと在庫の置き場所、そして値付けが利益をほぼ決める。',
      en: 'Buying goods and selling them in stores or online. Assortment, where the stock sits, and price decide nearly all of the margin.',
    },
    aliases: ['retail', 'ec', 'e-commerce', 'ecommerce', '小売', '流通', '通販', '通信販売', 'eコマース', 'スーパー', 'コンビニ', '百貨店', '専門店', 'd2c', 'オムニチャネル'],
    detectors: ['店舗', '売場', '棚割', '仕入', '品揃え', '在庫', '欠品', '値下げ', '販促', 'ポイント', '会員', 'レジ', 'pos', 'ec', '通販', '配送', '返品', '受取', 'store', 'assortment', 'merchandising', 'fulfilment', 'fulfillment'],
    capabilities: [
      {
        id: 'retail-merchandising',
        name: { ja: '商品調達・マーチャンダイジング', en: 'Merchandising & Buying' },
        group: 'core',
        universal: true,
        supersedes: ['sourcing-procurement'],
        definition: {
          ja: '何を仕入れ、いくらで、どこに、どれだけ並べるかを決めて、利益の出る品揃えを作る力。',
          en: 'Deciding what to buy, at what price, where to place it, and how much of it — building an assortment that earns.',
        },
        typicalL2: [
          { ja: '品揃え・カテゴリ計画', en: 'Assortment and category planning' },
          { ja: '仕入・取引条件の交渉', en: 'Buying and trade terms negotiation' },
          { ja: '値付け・値下げの管理', en: 'Pricing and markdown management' },
          { ja: '棚割・売場計画', en: 'Planogram and space planning' },
        ],
        weakSigns: [
          { ja: '値下げの判断が店舗任せで、全社の粗利がいつどこで消えたのか説明できない。', en: 'Markdown is left to stores and nobody can explain where and when the gross margin disappeared.' },
          { ja: '売れない商品が棚に残り続け、新商品を入れる場所が無い。', en: 'Non-sellers keep their shelf and there is nowhere to put anything new.' },
        ],
        probes: [
          { ja: '商品別の粗利を、値下げと廃棄を反映した後で見られますか。', en: 'Can you see gross margin per item after markdowns and write-offs?' },
          { ja: '売上下位 20 % の商品は、何品目で、何をもって残していますか。', en: 'How many items sit in the bottom twenty percent of sales, and on what grounds do they stay?' },
        ],
        triggers: ['仕入', '品揃え', '棚割', '値付け', '値下げ', 'カテゴリ', 'バイヤー', 'merchandising', 'assortment', 'markdown', 'pricing'],
      },
      {
        id: 'retail-demand-allocation',
        name: { ja: '需給計画・在庫配分', en: 'Demand Planning & Allocation' },
        group: 'core',
        universal: true,
        definition: {
          ja: '需要を予測し、限られた在庫を店舗・倉庫のどこに置くかを決めて、欠品と過剰の両方を減らす力。',
          en: 'Forecasting demand and deciding where limited stock should sit across stores and warehouses, cutting both stockouts and overstock.',
        },
        typicalL2: [
          { ja: '需要予測', en: 'Demand forecasting' },
          { ja: '初期配分・追加配分', en: 'Initial and replenishment allocation' },
          { ja: '店舗間移動・返品調整', en: 'Inter-store transfer and returns balancing' },
          { ja: '欠品・過剰在庫の監視', en: 'Stockout and overstock monitoring' },
        ],
        weakSigns: [
          { ja: '在庫は全社では足りているのに、必要な店舗に無い状態が常態化している。', en: 'Company-wide stock is sufficient yet the store that needs it never has it.' },
          { ja: '予測が担当者の経験値で、担当が変わると精度が落ちる。', en: 'Forecasting rests on one planner’s feel and accuracy drops when they change.' },
        ],
        probes: [
          { ja: '欠品率と在庫回転率を、店舗別・カテゴリ別に同じ画面で見られますか。', en: 'Can you see stockout rate and turns together, by store and by category?' },
          { ja: '店舗間移動は年に何件、いくらのコストで発生していますか。', en: 'How many inter-store transfers happen per year, and what do they cost?' },
        ],
        triggers: ['需要予測', '在庫配分', '補充', '欠品', '在庫', '発注', 'allocation', 'replenishment', 'forecast', 'stockout'],
      },
      {
        id: 'retail-store-operations',
        name: { ja: '店舗運営', en: 'Store Operations' },
        group: 'core',
        universal: false,
        definition: {
          ja: '売場・レジ・人員を日々回し、どの店でも同じ水準の買い物体験を成立させる力。',
          en: 'Running floor, checkout, and staffing day after day so the shopping experience holds the same standard in every store.',
        },
        typicalL2: [
          { ja: '開閉店・日次運用', en: 'Opening, closing, and daily routine' },
          { ja: 'レジ・精算・現金管理', en: 'Checkout, payment, and cash handling' },
          { ja: '要員計画・シフト管理', en: 'Labour planning and shifts' },
          { ja: '売場作業の標準化', en: 'Standard work on the floor' },
        ],
        weakSigns: [
          { ja: '本部からの作業指示が積み上がり、店舗が優先順位を自分で判断できない。', en: 'Head office tasks pile up and the store cannot decide what matters today.' },
          { ja: '店舗ごとに独自運用が育ち、優良店のやり方を他店に移せない。', en: 'Each store grows its own way of working and what the best store does cannot be transplanted.' },
        ],
        probes: [
          { ja: '本部から店舗に降りる作業指示は、週に何件ですか。所要時間の合計は測っていますか。', en: 'How many head-office tasks reach a store per week, and is the total time they consume measured?' },
          { ja: '優良店と平均店の差は、何の指標で説明できていますか。', en: 'Which metric explains the gap between your best store and the average one?' },
        ],
        triggers: ['店舗', '売場', 'レジ', 'pos', 'シフト', '開店', '接客', 'store operations', 'checkout', 'staffing'],
      },
      {
        id: 'retail-digital-commerce',
        name: { ja: 'オンライン販売運営', en: 'Digital Commerce Operations' },
        group: 'core',
        universal: false,
        supersedes: ['sales-order'],
        definition: {
          ja: 'サイト・アプリ・モールでの掲載から決済・受注引当までを運営し、注文を確実に成立させる力。',
          en: 'Running listing, cart, payment, and order allocation across site, app, and marketplaces so orders actually complete.',
        },
        typicalL2: [
          { ja: '商品掲載・コンテンツ管理', en: 'Listing and content management' },
          { ja: 'カート・決済の運営', en: 'Cart and payment operations' },
          { ja: '受注・在庫引当', en: 'Order capture and inventory allocation' },
          { ja: '注文変更・キャンセル対応', en: 'Order change and cancellation' },
        ],
        weakSigns: [
          { ja: 'サイト在庫と実在庫がずれ、受注後の欠品連絡が定常的に発生する。', en: 'Site stock and real stock diverge and post-order apology emails are routine.' },
          { ja: 'モールごとに運用が分かれ、同じ商品の情報が媒体で食い違う。', en: 'Each marketplace is operated separately and the same product carries different information on each.' },
        ],
        probes: [
          { ja: '受注後の欠品・キャンセル率はいくつですか。原因の内訳は取れていますか。', en: 'What is the post-order shortage and cancellation rate, and do you have the cause breakdown?' },
          { ja: '在庫情報がサイトに反映されるまで、何分の遅れがありますか。', en: 'How many minutes of lag before stock changes appear on the site?' },
        ],
        triggers: ['ec', 'オンライン', 'サイト', 'アプリ', 'モール', 'カート', '通販', 'digital commerce', 'online store', 'marketplace'],
      },
      {
        id: 'retail-fulfilment-returns',
        name: { ja: '配送・受取・返品', en: 'Fulfilment & Returns' },
        group: 'core',
        universal: true,
        supersedes: ['supply-logistics', 'service-delivery-production'],
        definition: {
          ja: '注文された物を、約束した方法と時刻で顧客に届け、返品・交換まで含めて完結させる力。',
          en: 'Getting the ordered goods to the customer by the promised method and time, and closing the loop through returns and exchanges.',
        },
        typicalL2: [
          { ja: '出荷・宅配手配', en: 'Picking, packing, and carrier arrangement' },
          { ja: '店舗受取・店舗出荷', en: 'Click and collect, ship from store' },
          { ja: '返品・交換・返金', en: 'Returns, exchanges, and refunds' },
          { ja: '配送品質・遅延の管理', en: 'Delivery quality and delay management' },
        ],
        weakSigns: [
          { ja: '返品コストが商品別に把握できず、返品率の高い商品が放置される。', en: 'Return cost is not attributed per item, so high-return products keep selling unchallenged.' },
          { ja: '配送遅延の連絡が顧客からの問合せで初めて分かる。', en: 'A delivery delay is discovered when the customer calls to ask.' },
        ],
        probes: [
          { ja: '返品率と返品にかかる実コストを、商品別に出せますか。', en: 'Can you produce return rate and true return cost per item?' },
          { ja: '配送遅延を、顧客より先に検知できていますか。', en: 'Do you detect a delivery delay before the customer does?' },
        ],
        triggers: ['配送', '出荷', '宅配', '受取', '返品', '交換', '返金', 'ラストマイル', 'delivery', 'fulfilment', 'fulfillment', 'returns'],
      },
      {
        id: 'retail-loyalty-promotion',
        name: { ja: '顧客ロイヤルティ・販促', en: 'Loyalty & Promotion' },
        group: 'core',
        universal: true,
        definition: {
          ja: '会員・購買履歴をもとに、次に来てもらうための施策を打ち、その効果を売上で確認する力。',
          en: 'Using membership and purchase history to make the next visit happen, and confirming the effect in actual sales.',
        },
        typicalL2: [
          { ja: '会員・ポイントの運営', en: 'Membership and points programme' },
          { ja: 'クーポン・値引きの設計', en: 'Coupon and discount design' },
          { ja: '購買データに基づく提案', en: 'Purchase-data driven targeting' },
          { ja: '販促の効果測定', en: 'Promotion effectiveness measurement' },
        ],
        weakSigns: [
          { ja: 'ポイント原価が販促費として管理されておらず、実質値引率が誰にも分からない。', en: 'Points cost is not managed as promotion spend and the effective discount rate is unknown to everyone.' },
          { ja: '会員 ID が店舗と EC で別で、同じ人の買い物が繋がらない。', en: 'Store and online memberships are different IDs, so one person’s purchases never join up.' },
        ],
        probes: [
          { ja: '店舗と EC で同じ顧客を同じ ID で認識できていますか。', en: 'Do store and online recognise the same customer under the same identity?' },
          { ja: 'ポイント・クーポンを含めた実質値引率は、月次でいくつですか。', en: 'Including points and coupons, what is your effective discount rate per month?' },
        ],
        triggers: ['会員', 'ポイント', 'クーポン', '販促', 'ロイヤルティ', 'キャンペーン', 'crm', 'loyalty', 'promotion'],
      },
    ],
    notes: [
      {
        ja: '小売は「同じ在庫をどのチャネルの数字として立てるか」で組織が揉める。能力マップを描く前に、在庫と売上の帰属ルールを事実として確認する。',
        en: 'Retail organisations fight over which channel books the same stock and the same sale. Establish the attribution rule as fact before drawing the map.',
      },
      {
        ja: '店舗運営の能力は「本部が決めること」と「店舗が決めてよいこと」の線引きそのもの。線を引かずに標準化を進めると現場が止まる。',
        en: 'Store operations capability is really the line between what head office decides and what the store may decide. Standardising without drawing that line stalls the floor.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 公共
  // -------------------------------------------------------------------------
  {
    id: 'public-sector',
    name: { ja: '公共・行政', en: 'Public Sector' },
    essence: {
      ja: '制度に基づいて住民・事業者に給付や許認可を提供する。対価は税・保険料であり、選べない相手に等しく届けることが要求される。',
      en: 'Delivering benefits and permissions under statute. The money comes from taxes and levies, and it must reach everyone equally, including those who cannot choose you.',
    },
    aliases: ['public sector', 'public-sector', 'government', '公共', '行政', '自治体', '官公庁', '省庁', '市役所', '県庁', 'government agency', '独立行政法人', '公的機関'],
    detectors: ['住民', '申請', '給付', '許認可', '窓口', '条例', '制度', '税', '賦課', '徴収', '滞納', '補助金', '公文書', '情報公開', '入札', '予算執行', 'citizen', 'permit', 'benefit', 'municipal'],
    capabilities: [
      {
        id: 'public-service-delivery',
        name: { ja: '申請受付・給付/許認可', en: 'Application Intake & Service Delivery' },
        group: 'core',
        universal: true,
        supersedes: ['sales-order', 'service-delivery-production'],
        definition: {
          ja: '住民・事業者からの申請を受け付け、要件を審査し、決定を通知して給付や許認可を実行する力。',
          en: 'Taking applications from citizens and businesses, testing them against the rules, notifying the decision, and delivering the benefit or permission.',
        },
        typicalL2: [
          { ja: '受付・本人確認', en: 'Intake and identity verification' },
          { ja: '要件審査・決定', en: 'Eligibility assessment and determination' },
          { ja: '通知・給付の実行', en: 'Notification and delivery' },
          { ja: '不服申立・再審査への対応', en: 'Appeals and reconsideration' },
        ],
        weakSigns: [
          { ja: '同じ書類を制度ごとに何度も出させており、住民から見ると同じ役所に同じ話を繰り返している。', en: 'The same document is demanded once per programme, so from outside it looks like telling the same office the same thing over and over.' },
          { ja: '処理日数が担当者と時期でばらつき、住民に見通しを示せない。', en: 'Processing time varies by officer and season, so no expectation can be given to the applicant.' },
        ],
        probes: [
          { ja: '主要な申請の処理日数は、中央値と最長でそれぞれ何日ですか。', en: 'For your main applications, what is the median and the worst-case processing time?' },
          { ja: '同じ住民に同じ情報を何回書かせていますか。', en: 'How many times does one citizen write the same information for you?' },
        ],
        triggers: ['申請', '受付', '給付', '許認可', '届出', '窓口', '審査', '不服申立', 'application', 'permit', 'benefit'],
      },
      {
        id: 'public-eligibility',
        name: { ja: '資格・受給者管理', en: 'Eligibility & Beneficiary Management' },
        group: 'core',
        universal: true,
        definition: {
          ja: '誰が制度の対象かを、世帯・所得・年齢などの事実に基づいて把握し、資格の得喪を追い続ける力。',
          en: 'Knowing who is in scope of each programme from facts such as household, income, and age, and tracking eligibility as it starts and ends.',
        },
        typicalL2: [
          { ja: '対象者の特定・名寄せ', en: 'Identification and record matching' },
          { ja: '資格の得喪管理', en: 'Eligibility start and end tracking' },
          { ja: '世帯・所得情報の連携', en: 'Household and income data linkage' },
          { ja: '重複・不正受給の検知', en: 'Duplicate and improper receipt detection' },
        ],
        weakSigns: [
          { ja: '制度ごとに対象者台帳が別で、同じ住民が別人として扱われる。', en: 'Each programme keeps its own register and the same citizen appears as different people.' },
          { ja: '資格喪失の反映が遅れ、過払いの返還請求が後から発生する。', en: 'Loss of eligibility is recorded late and overpayment recovery follows months later.' },
        ],
        probes: [
          { ja: '住民 1 人が今どの制度の対象かを、1 画面で確認できますか。', en: 'Can one screen show every programme a single citizen currently qualifies for?' },
          { ja: '過払い・返還の年間件数と金額はいくつですか。', en: 'How many overpayments and how much money is recovered per year?' },
        ],
        triggers: ['資格', '受給', '対象者', '世帯', '所得', '名寄せ', '不正受給', 'eligibility', 'beneficiary'],
      },
      {
        id: 'public-revenue',
        name: { ja: '賦課・徴収', en: 'Levy & Revenue Collection' },
        group: 'core',
        universal: true,
        supersedes: ['billing-collection'],
        definition: {
          ja: '税・保険料・使用料を制度どおりに算定して課し、納付を管理し、滞納には段階的に対応する力。',
          en: 'Assessing taxes, levies, and fees as the rules require, managing payment, and escalating on arrears in defined stages.',
        },
        typicalL2: [
          { ja: '課税・賦課決定', en: 'Assessment and determination' },
          { ja: '納付方法・収納の管理', en: 'Payment channels and collection' },
          { ja: '滞納整理・分納', en: 'Arrears management and instalments' },
          { ja: '還付・過誤納の処理', en: 'Refunds and misapplied payments' },
        ],
        weakSigns: [
          { ja: '滞納者への接触が担当者の判断任せで、対応の一貫性を説明できない。', en: 'Contact with debtors is left to the officer and consistency cannot be defended.' },
          { ja: '納付方法が窓口と紙に偏り、収納コストが下がらない。', en: 'Payment stays skewed to counter and paper, and the cost of collection never falls.' },
        ],
        probes: [
          { ja: '収納率は税目別にいくつですか。滞納の年齢別内訳は取れていますか。', en: 'What is the collection rate per levy, and do you have arrears ageing?' },
          { ja: '1 件あたりの収納コストは、納付方法別にいくらですか。', en: 'What does collection cost per transaction, by payment method?' },
        ],
        triggers: ['税', '賦課', '課税', '徴収', '収納', '滞納', '還付', '保険料', 'levy', 'tax', 'collection'],
      },
      {
        id: 'public-communication',
        name: { ja: '広報・住民コミュニケーション', en: 'Public Communication' },
        group: 'core',
        universal: true,
        supersedes: ['demand-generation'],
        definition: {
          ja: '制度と手続きを、必要な人に届く形と言葉で伝え、問合せと緊急時の情報発信まで一貫して担う力。',
          en: 'Getting rules and procedures to the people who need them, in a form and language they can use, and carrying that through enquiries and emergencies.',
        },
        typicalL2: [
          { ja: '制度・手続きの周知', en: 'Programme and procedure awareness' },
          { ja: '問合せ応対(窓口・電話・オンライン)', en: 'Enquiry handling across counter, phone, and online' },
          { ja: '緊急時の情報発信', en: 'Emergency communication' },
          { ja: '多言語・アクセシビリティ対応', en: 'Multilingual and accessibility provision' },
        ],
        weakSigns: [
          { ja: '制度は作ったが対象者に届かず、申請率が想定を大きく下回る。', en: 'The programme exists but never reaches those entitled and take-up falls far below plan.' },
          { ja: '同じ質問が窓口に繰り返し来ているのに、案内の文面が直らない。', en: 'The same question keeps arriving at the counter and the wording of the guidance is never fixed.' },
        ],
        probes: [
          { ja: '主要な制度の申請率(対象者に対する実際の申請割合)は測っていますか。', en: 'Do you measure take-up — actual applications against those entitled — for your main programmes?' },
          { ja: '窓口・電話への問合せ上位 10 件は何ですか。案内文の改善に繋がっていますか。', en: 'What are the top ten enquiries, and have they changed any of your published guidance?' },
        ],
        triggers: ['広報', '周知', '問合せ', 'コールセンター', '多言語', 'アクセシビリティ', '住民説明', 'communication', 'outreach', 'enquiry'],
      },
      {
        id: 'public-policy-administration',
        name: { ja: '政策立案・制度運用', en: 'Policy Development & Rule Administration' },
        group: 'governing',
        universal: true,
        definition: {
          ja: '制度を設計し、条例・規則として成立させ、施行日に運用を切り替え、効果を測って見直す力。',
          en: 'Designing a programme, enacting it as rule, switching operations over on the effective date, and measuring whether it worked.',
        },
        typicalL2: [
          { ja: '制度設計・影響試算', en: 'Programme design and impact estimation' },
          { ja: '条例・規則の維持', en: 'Ordinance and rule maintenance' },
          { ja: '施行時の運用切替', en: 'Go-live transition of operations' },
          { ja: '効果測定・見直し', en: 'Outcome measurement and revision' },
        ],
        weakSigns: [
          { ja: '制度改正のたびにシステム改修が間に合わず、施行直後を手作業で凌ぐ。', en: 'System changes never keep up with rule changes and the first weeks after enactment run on manual workarounds.' },
          { ja: '効果測定の指標が制度設計時に決まっておらず、後から評価できない。', en: 'No outcome measure was defined at design time, so the programme cannot be evaluated afterwards.' },
        ],
        probes: [
          { ja: '直近の制度改正で、施行日までにシステム対応は間に合いましたか。何で凌ぎましたか。', en: 'In your last rule change, did the systems make the effective date? If not, what carried the load?' },
          { ja: '制度の効果を測る指標は、設計時に決めていますか。', en: 'Is the outcome measure decided at design time?' },
        ],
        triggers: ['政策', '制度', '条例', '規則', '施行', '法改正', '効果測定', 'policy', 'ordinance', 'legislation'],
      },
      {
        id: 'public-budget-execution',
        name: { ja: '予算執行・公会計', en: 'Budget Execution & Public Accounting' },
        group: 'governing',
        universal: true,
        definition: {
          ja: '予算を編成し、契約・支出を規律のもとで執行し、決算と監査に耐える記録を残す力。',
          en: 'Building the budget, executing contracts and spend under discipline, and leaving records that survive audit.',
        },
        typicalL2: [
          { ja: '予算編成・配当', en: 'Budget formulation and allotment' },
          { ja: '契約・入札の管理', en: 'Contracting and tendering' },
          { ja: '支出負担行為・支払', en: 'Commitment and disbursement' },
          { ja: '決算・監査対応', en: 'Closing and audit response' },
        ],
        weakSigns: [
          { ja: '年度末に予算消化の駆け込み発注が集中し、調達の質が落ちる。', en: 'Year-end spending rushes concentrate procurement into weeks and quality drops.' },
          { ja: '執行状況が月次でしか見えず、途中の組み替え判断が遅れる。', en: 'Execution is visible only monthly, so reallocation decisions come too late.' },
        ],
        probes: [
          { ja: '予算の執行状況は、今日時点で何日遅れの数字ですか。', en: 'As of today, how many days stale is your budget execution figure?' },
          { ja: '年度末に集中する発注の割合はどれくらいですか。', en: 'What share of your procurement lands in the final quarter?' },
        ],
        triggers: ['予算', '執行', '入札', '契約', '支出', '決算', '監査', '公会計', 'budget', 'procurement', 'tender', 'audit'],
      },
      {
        id: 'public-records-disclosure',
        name: { ja: '記録管理・情報公開', en: 'Records Management & Disclosure' },
        group: 'governing',
        universal: true,
        definition: {
          ja: '公文書を分類・保存年限どおりに管理し、開示請求と個人情報保護の双方に応えられる状態を保つ力。',
          en: 'Classifying and retaining public records to their schedule, and staying able to answer both disclosure requests and privacy obligations.',
        },
        typicalL2: [
          { ja: '文書の分類・保存年限管理', en: 'Classification and retention scheduling' },
          { ja: '開示請求への対応', en: 'Disclosure request handling' },
          { ja: '個人情報の保護・利用統制', en: 'Personal data protection and use control' },
          { ja: '廃棄・移管の管理', en: 'Disposal and transfer to archives' },
        ],
        weakSigns: [
          { ja: '文書が担当者のフォルダに散在し、開示請求のたびに探索に何日もかかる。', en: 'Documents scatter across personal folders and every disclosure request starts a multi-day search.' },
          { ja: '保存年限を過ぎた文書が残り続け、廃棄の判断を誰もしない。', en: 'Records past their retention period simply stay, because nobody will decide to destroy them.' },
        ],
        probes: [
          { ja: '開示請求 1 件あたりの探索時間は、平均で何時間ですか。', en: 'On average, how many hours does one disclosure request take to search?' },
          { ja: '保存年限を過ぎた文書の廃棄は、誰がいつ判断していますか。', en: 'Who decides, and when, that a record past its retention period is destroyed?' },
        ],
        triggers: ['公文書', '文書管理', '保存年限', '情報公開', '開示請求', '個人情報', 'records', 'disclosure', 'foi', 'retention'],
      },
    ],
    notes: [
      {
        ja: '公共では「顧客を選べない」「やめられない」の 2 点が民間と決定的に違う。能力の目標水準は「最も条件の悪い利用者が使えるか」で置くこと。',
        en: 'The public sector cannot choose its users and cannot stop serving them. Set capability targets by whether the worst-placed user can get through.',
      },
      {
        ja: '制度と組織は改正のたびに動くが、能力(申請を受ける・資格を判定する・徴収する)は動かない。能力マップは制度改正に耐える唯一の軸になる。',
        en: 'Programmes and org units move at every amendment; the capabilities — intake, eligibility, collection — do not. The capability map is the one axis that survives legislative change.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 通信
  // -------------------------------------------------------------------------
  {
    id: 'telecommunications',
    name: { ja: '通信', en: 'Telecommunications' },
    essence: {
      ja: '設備を先に作り、その上で回線・サービスを継続課金で売る。設備投資の回収期間と加入者の解約率が同時に効く。',
      en: 'Build the network first, then sell connectivity on recurring charges. Payback on capital and subscriber churn bite at the same time.',
    },
    aliases: ['telecom', 'telecommunications', '通信', '通信事業', '携帯', 'キャリア', 'mvno', 'isp', 'プロバイダ', 'ケーブルテレビ', 'carrier', 'operator'],
    detectors: ['回線', '加入者', '契約者', '開通', '基地局', '通信', '帯域', 'sim', '料金プラン', '通話', 'データ通信', '障害', '相互接続', 'ローミング', 'network', 'subscriber', 'provisioning', 'churn'],
    capabilities: [
      {
        id: 'telecom-subscriber-management',
        name: { ja: '加入者・回線管理', en: 'Subscriber & Line Management' },
        group: 'core',
        universal: true,
        definition: {
          ja: '契約者・回線・端末・番号の対応関係を常に正しく保ち、加入から解約までの状態を追い続ける力。',
          en: 'Keeping the mapping between customer, line, device, and number correct at all times, and tracking state from activation to termination.',
        },
        typicalL2: [
          { ja: '加入・解約手続', en: 'Activation and termination' },
          { ja: '名義・プラン変更', en: 'Ownership and plan changes' },
          { ja: '番号・SIM・端末の管理', en: 'Number, SIM, and device management' },
          { ja: '契約と設備の対応付け', en: 'Contract to network asset linkage' },
        ],
        weakSigns: [
          { ja: '契約上の回線と実際に使われている設備が一致せず、解約後も設備が占有され続ける。', en: 'Contracted lines and live network resources disagree, and cancelled services keep holding capacity.' },
          { ja: '同じ顧客の複数回線が別契約として散らばり、世帯・法人単位で見られない。', en: 'One customer’s several lines sit as unrelated contracts and cannot be seen as a household or a company.' },
        ],
        probes: [
          { ja: '契約数と実際に稼働している回線数は一致していますか。差はどれくらいですか。', en: 'Do contract count and live line count match? How big is the gap?' },
          { ja: '法人顧客の全回線を 1 画面で見られますか。', en: 'Can one screen show every line belonging to one corporate customer?' },
        ],
        triggers: ['加入者', '契約者', '回線', 'sim', '番号', '端末', '解約', 'subscriber', 'line', 'msisdn'],
      },
      {
        id: 'telecom-provisioning',
        name: { ja: 'サービスオーダ・開通', en: 'Service Provisioning & Activation' },
        group: 'core',
        universal: true,
        supersedes: ['sales-order', 'service-delivery-production'],
        definition: {
          ja: '申込を受けてから、工事・設定・開通確認までを順序どおりに進め、約束した日に使える状態にする力。',
          en: 'Taking the order through construction, configuration, and verification so the service works on the promised day.',
        },
        typicalL2: [
          { ja: '申込受付・提供可否判定', en: 'Order capture and serviceability check' },
          { ja: '工事・設置の手配', en: 'Field work and installation scheduling' },
          { ja: '設定投入・アクティベーション', en: 'Configuration and activation' },
          { ja: '開通確認・引き渡し', en: 'Verification and handover' },
        ],
        weakSigns: [
          { ja: '提供可否の判定が甘く、受注してから提供できないと分かる案件が定常的に出る。', en: 'Serviceability is judged loosely and orders regularly turn out to be undeliverable after they are taken.' },
          { ja: '開通が遅れても、遅れていること自体を顧客の問合せで知る。', en: 'A late activation is discovered when the customer calls about it.' },
        ],
        probes: [
          { ja: '申込から開通までの日数は、中央値と最長で何日ですか。', en: 'From order to service live, what is the median and the worst case in days?' },
          { ja: '受注後に提供不可となる案件は、月に何件ですか。', en: 'How many orders per month turn out to be undeliverable after acceptance?' },
        ],
        triggers: ['開通', '工事', '設置', '申込', 'アクティベーション', '提供可否', 'provisioning', 'activation', 'installation'],
      },
      {
        id: 'telecom-network-operations',
        name: { ja: '通信サービス運用・品質保証', en: 'Service Operations & Assurance' },
        group: 'core',
        universal: true,
        definition: {
          ja: 'ネットワークを監視し、障害を切り分けて復旧させ、通信品質を約束した水準に保ち続ける力。',
          en: 'Watching the network, isolating and restoring faults, and holding service quality at the promised level.',
        },
        typicalL2: [
          { ja: '監視・障害検知', en: 'Monitoring and fault detection' },
          { ja: '切り分け・復旧', en: 'Isolation and restoration' },
          { ja: '品質・性能の管理', en: 'Quality and performance management' },
          { ja: '計画停止・作業管理', en: 'Planned outage and change execution' },
        ],
        weakSigns: [
          { ja: '障害の影響範囲(どの顧客が困っているか)を把握するのに時間がかかる。', en: 'Working out who is actually affected by a fault takes far longer than fixing it.' },
          { ja: '品質の指標が設備側の数字だけで、顧客が感じる品質と乖離している。', en: 'Quality is measured only from the network side and diverges from what customers experience.' },
        ],
        probes: [
          { ja: '障害発生から影響顧客を特定するまで、何分かかりますか。', en: 'From fault to knowing which customers are affected, how many minutes?' },
          { ja: '顧客体感の品質指標は何を見ていますか。設備側の指標とどれくらい一致しますか。', en: 'Which customer-experienced quality metric do you watch, and how well does it track the network-side number?' },
        ],
        triggers: ['障害', '監視', '復旧', '品質', '帯域', 'sla', 'ネットワーク運用', 'network operations', 'assurance', 'outage'],
      },
      {
        id: 'telecom-network-planning',
        name: { ja: '通信設備計画・構築', en: 'Infrastructure Planning & Build' },
        group: 'core',
        universal: true,
        definition: {
          ja: '需要の予測に基づいて設備の場所・容量・時期を決め、投資として実行し、回収を見届ける力。',
          en: 'Deciding where, how much, and when to build from a demand forecast, executing it as investment, and following the payback.',
        },
        typicalL2: [
          { ja: 'トラフィック需要予測', en: 'Traffic demand forecasting' },
          { ja: '設備計画・エリア設計', en: 'Capacity and coverage planning' },
          { ja: '設備構築・工事管理', en: 'Build and construction management' },
          { ja: '投資判断・回収管理', en: 'Investment appraisal and payback tracking' },
        ],
        weakSigns: [
          { ja: '設備投資の効果が事後に検証されず、同じ根拠で同じ投資が繰り返される。', en: 'Capital outcomes are never checked afterwards and the same rationale funds the same investment again.' },
          { ja: '需要予測と実トラフィックの乖離が放置され、余剰と逼迫が同時に起きる。', en: 'Forecast and actual traffic drift apart unchecked, so spare and congested capacity coexist.' },
        ],
        probes: [
          { ja: '直近の大型投資について、事前の需要予測と実績はどれくらい合いましたか。', en: 'For your last major build, how close did the forecast come to actual demand?' },
          { ja: '設備の稼働率は、エリア別にどの粒度で見られますか。', en: 'At what granularity can you see utilisation by area?' },
        ],
        triggers: ['基地局', '設備', '回線設計', 'トラフィック', 'エリア', '容量', '投資', 'network planning', 'capacity', 'build'],
      },
      {
        id: 'telecom-rating-billing',
        name: { ja: '料金計算・課金', en: 'Rating, Charging & Billing' },
        group: 'core',
        universal: true,
        supersedes: ['billing-collection'],
        definition: {
          ja: '利用実績を集めて料金プランどおりに計算し、請求・収納し、問合せに数字の根拠を示せる力。',
          en: 'Collecting usage, rating it against the plan, billing and collecting, and being able to show where each number came from.',
        },
        typicalL2: [
          { ja: '利用実績の収集・突合', en: 'Usage collection and reconciliation' },
          { ja: '料金計算・割引適用', en: 'Rating and discount application' },
          { ja: '請求・収納・督促', en: 'Invoicing, collection, and dunning' },
          { ja: '料金問合せ・調定対応', en: 'Billing enquiry and adjustment' },
        ],
        weakSigns: [
          { ja: '料金プランを 1 つ増やすたびに改修が必要で、商品企画の速度が課金系に縛られる。', en: 'Every new tariff needs development work, so product speed is capped by the billing stack.' },
          { ja: '請求誤りの検知が顧客からの申告頼みになっている。', en: 'Billing errors are found only when customers report them.' },
        ],
        probes: [
          { ja: '新しい料金プランを出すのに、何週間かかりますか。', en: 'How many weeks to launch a new tariff?' },
          { ja: '請求誤りは月に何件で、そのうち自社で先に検知したのは何件ですか。', en: 'How many billing errors per month, and how many did you find before the customer did?' },
        ],
        triggers: ['料金', '課金', '請求', '料金プラン', '通話料', '従量', 'cdr', 'rating', 'charging', 'billing', 'tariff'],
      },
      {
        id: 'telecom-wholesale-interconnect',
        name: { ja: '相互接続・卸提供', en: 'Interconnection & Wholesale' },
        group: 'core',
        universal: false,
        definition: {
          ja: '他事業者と接続し、設備や回線を卸で貸し借りし、事業者間の精算を合わせ切る力。',
          en: 'Interconnecting with other operators, wholesaling capacity in both directions, and settling between carriers to the last unit.',
        },
        typicalL2: [
          { ja: '事業者間接続の管理', en: 'Interconnect management' },
          { ja: '卸提供・MVNO 支援', en: 'Wholesale and MVNO enablement' },
          { ja: '事業者間精算', en: 'Inter-operator settlement' },
          { ja: 'ローミングの管理', en: 'Roaming management' },
        ],
        weakSigns: [
          { ja: '事業者間精算の差異調整が毎月手作業で、担当者以外は手順を再現できない。', en: 'Inter-operator settlement differences are reconciled by hand every month and only one person can repeat the steps.' },
          { ja: '卸先ごとに個別対応が積み上がり、新規の卸提供に時間がかかる。', en: 'Bespoke handling accumulates per wholesale partner and onboarding a new one takes months.' },
        ],
        probes: [
          { ja: '事業者間精算の差異は月にいくら発生し、調整に何人日かかっていますか。', en: 'How large are monthly settlement differences and how many person-days go into reconciling them?' },
          { ja: '新しい卸先を受け入れるのに何か月かかりますか。', en: 'How many months to onboard a new wholesale partner?' },
        ],
        triggers: ['相互接続', '卸', 'mvno', '事業者間', 'ローミング', '精算', 'interconnect', 'wholesale', 'roaming'],
      },
    ],
    notes: [
      {
        ja: '通信は「設備の能力」と「商品の能力」の更新速度が桁違いに違う。同じ図に並べても、目標時期は必ず分けて置くこと。',
        en: 'Network capabilities and product capabilities change on wildly different clocks. They can share the map, but never the same target date.',
      },
      {
        ja: '課金系は商品企画の速度を決める律速段階になりやすい。「料金プランを 1 つ増やすのに何週間か」は、この業界で最も雄弁な成熟度指標。',
        en: 'Billing is usually the rate limiter on product speed. "How many weeks to add one tariff" is the most eloquent maturity metric in this industry.',
      },
    ],
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

// ---------------------------------------------------------------------------
// 業界別セットの検索・推定 / Industry set lookup and inference
// ---------------------------------------------------------------------------

/**
 * 語が説明文に含まれるかを判定する。
 * 英数字の語は単語境界で見る(「ec」が「recovery」に当たらないように)。
 * 日本語は単語境界が無いので単純な部分一致にする。
 * `knowledge/index.ts` の `matchesKeyword` と同じ考え方だが、
 * index.ts はこのファイルを取り込む側なので、循環参照を避けてここに小さく持つ。
 */
function containsTerm(haystackLower: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (t.length === 0) return false;
  if (/^[\x20-\x7e]+$/.test(t)) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystackLower);
  }
  return haystackLower.includes(t);
}

/** 業界セットが持つ照合語をすべて集める(重複は落とす) */
function setTerms(set: IndustryCapabilitySet): string[] {
  const terms = new Set<string>();
  for (const a of set.aliases) terms.add(a.toLowerCase());
  for (const d of set.detectors) terms.add(d.toLowerCase());
  for (const c of set.capabilities) for (const t of c.triggers) terms.add(t.toLowerCase());
  return [...terms];
}

/**
 * `industry` 引数の文字列から業界セットを引く。
 * "金融" / "banking" / "地方銀行" / "製造業" のようなゆれた入力を受ける。
 * 該当が無ければ undefined を返し、呼び出し側は「業界セットが無い」と明示すること。
 */
export function findIndustryCapabilitySet(input: string): IndustryCapabilitySet | undefined {
  const raw = input.trim();
  if (raw.length === 0) return undefined;
  const key = raw.toLowerCase();

  const byId = INDUSTRY_CAPABILITY_SETS.find((s) => s.id === key);
  if (byId) return byId;

  const byName = INDUSTRY_CAPABILITY_SETS.find(
    (s) => s.name.en.toLowerCase() === key || s.name.ja === raw,
  );
  if (byName) return byName;

  const byAlias = INDUSTRY_CAPABILITY_SETS.find((s) => s.aliases.some((a) => a.toLowerCase() === key));
  if (byAlias) return byAlias;

  // 部分一致。"地方銀行" → "銀行"、"manufacturing industry" → "manufacturing" のように、
  // 最も長く一致した別名を持つセットを採る(短い語の誤ヒットを避ける)。
  let best: IndustryCapabilitySet | undefined;
  let bestLength = 0;
  for (const set of INDUSTRY_CAPABILITY_SETS) {
    for (const alias of set.aliases) {
      const a = alias.toLowerCase();
      const hit = containsTerm(key, a) || (a.length >= 4 && a.includes(key) && key.length >= 3);
      if (hit && a.length > bestLength) {
        best = set;
        bestLength = a.length;
      }
    }
  }
  if (best) return best;

  // 別名で当たらなければ業務語で見る("預金と融資" のような入力を救う)
  let byDetector: IndustryCapabilitySet | undefined;
  let byDetectorLength = 0;
  for (const set of INDUSTRY_CAPABILITY_SETS) {
    for (const d of set.detectors) {
      const dl = d.toLowerCase();
      if (containsTerm(key, dl) && dl.length > byDetectorLength) {
        byDetector = set;
        byDetectorLength = dl.length;
      }
    }
  }
  return byDetector;
}

/**
 * 事業の説明から業界セットを推定する。
 * 一致した語の数を素点にし、強い順に返す。0 点のセットは返さない。
 * 「推定」であることは呼び出し側が必ず利用者に明示すること。
 *
 * 素点だけでは足りない。detectors には「在庫」「出荷」のように
 * 他業界でも使う語が混ざるため、素点が高くても当たり所が 1 つの能力に
 * 偏っていれば誤判定になる。そこで `confident` に一致の広さを持たせ、
 * 推定に使ってよいかを呼び出し側が判断できるようにする。
 */
export function detectIndustryCapabilitySets(description: string): IndustryDetection[] {
  const haystack = description.toLowerCase();
  const results: IndustryDetection[] = [];
  for (const set of INDUSTRY_CAPABILITY_SETS) {
    const matched = setTerms(set).filter((t) => containsTerm(haystack, t));
    if (matched.length === 0) continue;
    // 長い語(「インターネットバンキング」など)は業界を強く示すので少し重く見る
    const score = matched.reduce((acc, t) => acc + (t.length >= 4 ? 2 : 1), 0);
    // 業界名そのものが出ていれば強い手がかり。出ていなければ、業界固有の語が
    // いくつの能力にまたがるかで見る(1 つの能力の語彙だけでは業界を示さない)。
    const namesIndustry = set.aliases.some((a) => containsTerm(haystack, a.toLowerCase()));
    const capabilityBreadth = set.capabilities.filter((c) =>
      c.triggers.some((t) => containsTerm(haystack, t.toLowerCase())),
    ).length;
    results.push({
      set,
      matched: matched.sort((a, b) => b.length - a.length),
      score,
      confident: namesIndustry || capabilityBreadth >= 3,
    });
  }
  return results.sort((a, b) => b.score - a.score || a.set.id.localeCompare(b.set.id));
}

/** ID・名称・別名で業界セットの能力を 1 件引く(id は業界セット内で一意) */
export function findIndustryCapability(id: string): IndustryReferenceCapability | undefined {
  const key = normalizeKey(id);
  if (key.length === 0) return undefined;
  for (const set of INDUSTRY_CAPABILITY_SETS) {
    const hit = set.capabilities.find(
      (c) => normalizeKey(c.id) === key || normalizeKey(c.name.ja) === key || normalizeKey(c.name.en) === key,
    );
    if (hit) return hit;
  }
  return undefined;
}

/** 分類の表示ラベル */
export const CAPABILITY_GROUP_LABELS: Record<CapabilityGroup, Bilingual> = {
  core: { ja: '中核(価値を直接生む)', en: 'Core — creates value directly' },
  enabling: { ja: '支援(中核を回し続ける)', en: 'Enabling — keeps the core running' },
  governing: { ja: '統制(方向と歯止め)', en: 'Governing — direction and brakes' },
};
