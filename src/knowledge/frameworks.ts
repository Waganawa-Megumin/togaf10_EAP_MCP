/**
 * 周辺フレームワーク・参照ガイドのカタログ / Catalogue of adjacent frameworks and reference guides.
 *
 * TOGAF だけで全部やろうとするのが失敗の元。実務では目的別に他の道具と組み合わせる。
 * 本ファイルは「名称・策定主体・構造」といった事実と、独自の実務解説のみで構成する。
 * 各フレームワークの原文・定義文の転載は行わない。
 *
 * Factual identifiers (names, owners, structure) plus original practitioner commentary only.
 * No source text from any of the referenced works is reproduced here.
 */

import type { Bilingual } from './types.js';

/** フレームワークの分類 / Category of a framework. */
export type FrameworkCategory =
  | 'modeling'
  | 'method'
  | 'business-architecture'
  | 'delivery'
  | 'operations'
  | 'governance'
  | 'domain';

/** TOGAF との比較表に使う補足軸(任意) / Optional axes used by the side-by-side comparison table. */
export interface FrameworkComparison {
  /** 扱う粒度 */
  granularity: Bilingual;
  /** 典型的な成果物 */
  artifacts: Bilingual;
  /** 学習・導入コストの体感 */
  learningCurve: Bilingual;
}

/** 周辺フレームワーク 1 件 / One adjacent framework. */
export interface Framework {
  /** 安定 ID(例: 'archimate', 'bizbok', 'c4-model') */
  id: string;
  /** 正式名称(事実) */
  name: Bilingual;
  /** 策定・管理主体(事実) */
  owner: Bilingual;
  category: FrameworkCategory;
  /** 何をする道具か(独自の説明) */
  summary: Bilingual;
  /** TOGAF より得意なこと */
  strengths: Bilingual[];
  /** 限界・使わない方がよい場面 */
  limits: Bilingual[];
  /** TOGAF ADM とどう組み合わせるか */
  combineWithAdm: Bilingual;
  /** 併用が効く ADM フェーズ ID */
  phaseIds: string[];
  /** ライセンス・入手性の注記(事実の範囲で) */
  availability: Bilingual;
  keywords: string[];
  /** 比較表用の補足(任意) */
  comparison?: FrameworkComparison;
}

/** 分類の表示ラベル / Display labels for the categories. */
export const CATEGORY_LABELS: Record<FrameworkCategory, Bilingual> = {
  modeling: { ja: 'モデリング記法', en: 'Modeling notation' },
  method: { ja: '設計手法', en: 'Design method' },
  'business-architecture': { ja: 'ビジネスアーキテクチャ', en: 'Business architecture' },
  delivery: { ja: '開発・デリバリ', en: 'Delivery' },
  operations: { ja: '運用・サービス管理', en: 'Operations and service management' },
  governance: { ja: 'ガバナンス・統制', en: 'Governance and control' },
  domain: { ja: '個別領域(データ/セキュリティ/クラウド)', en: 'Domain-specific (data, security, cloud)' },
};

/** 表示順を固定した分類一覧 / Categories in display order. */
export const FRAMEWORK_CATEGORIES: FrameworkCategory[] = [
  'modeling',
  'method',
  'business-architecture',
  'delivery',
  'operations',
  'governance',
  'domain',
];

/** 比較表の TOGAF 側(固定列) / The TOGAF column of the comparison table. */
export const TOGAF_BASELINE: FrameworkComparison & { purpose: Bilingual; caution: Bilingual } = {
  purpose: {
    ja: '企業全体の変革を、ビジョン合意から実装・運用まで反復可能な手順(ADM)で進める。',
    en: 'Drive enterprise-wide change through a repeatable cycle (the ADM), from agreeing a vision to implementation and operation.',
  },
  granularity: {
    ja: '企業・事業部単位。個々のシステム内部までは踏み込まない。',
    en: 'Enterprise or business-unit scope; it stops above the internals of any single system.',
  },
  artifacts: {
    ja: '文書中心の成果物群(ビジョン、各層のアーキテクチャ記述、ロードマップ、契約)。',
    en: 'A document-centric deliverable set: vision, architecture descriptions per layer, roadmap, contracts.',
  },
  learningCurve: {
    ja: '体系が大きく、通読では身に付かない。1 案件を通して回して初めて使えるようになる。',
    en: 'Large body of material; reading it end to end does not stick. It clicks only after running one real engagement.',
  },
  caution: {
    ja: '記法も見積り手法も持たないため、具体の道具を必ず外から補う必要がある。',
    en: 'It ships with neither a notation nor an estimation technique, so concrete tools always have to be brought in from outside.',
  },
};

export const FRAMEWORKS: Framework[] = [
  // ---------------------------------------------------------------- modeling
  {
    id: 'archimate',
    name: { ja: 'ArchiMate', en: 'ArchiMate' },
    owner: { ja: 'The Open Group', en: 'The Open Group' },
    category: 'modeling',
    summary: {
      ja: 'EA を図で表すための記法。戦略・ビジネス・アプリケーション・テクノロジー・物理の各レイヤに加え、動機と実装移行の拡張を持ち、要素と関係の種類があらかじめ決められている。TOGAF が「何を決めるか」の手順であるのに対し、ArchiMate は「決めた内容をどう描くか」の言語にあたる。',
      en: 'A notation for drawing enterprise architecture. It offers strategy, business, application, technology and physical layers plus motivation and implementation extensions, with a fixed vocabulary of element and relationship types. Where TOGAF prescribes the steps for deciding, ArchiMate is the language for depicting what was decided.',
    },
    strengths: [
      { ja: '事業能力からサーバまで、レイヤをまたぐ依存を 1 枚で追える', en: 'Traces dependencies across layers — business capability down to server — on a single canvas' },
      { ja: '要素と関係が型付けされているので、影響範囲の抽出や検査を機械的にできる', en: 'Elements and relationships are typed, so impact extraction and checking can be automated' },
      { ja: 'Archi のような無償ツールがあり、モデルを版管理できる資産として維持できる', en: 'Free tooling such as Archi exists, so the model can be kept as a version-controlled asset' },
    ],
    limits: [
      { ja: '記法が大きく、初見の関係者は読めない。経営層向け資料にそのまま出すと失敗する。', en: 'The notation is large and unreadable to newcomers; handing an executive a raw ArchiMate view fails every time.' },
      { ja: '表現力が高い分、粒度の取り決めが無いと描き手ごとにモデルがばらつく', en: 'Its expressive power means that without an agreed level of detail, every modeler produces a different model' },
      { ja: '描くこと自体が目的化しやすい。意思決定に使われないモデルは保守されず腐る。', en: 'Modeling easily becomes the goal; a model no decision depends on is never maintained and rots.' },
    ],
    combineWithAdm: {
      ja: 'B〜D の各層の記述に共通言語として使い、E ではギャップと作業パッケージの依存関係を可視化する。ただし A のビジョンは ArchiMate ではなく手描き 1 枚絵の方が通りやすい。',
      en: 'Use it as the common language for the descriptions in Phases B–D, and in Phase E to visualise gaps and work-package dependencies. For the Phase A vision, a single hand-drawn picture lands better than an ArchiMate view.',
    },
    phaseIds: ['a', 'b', 'c', 'd', 'e'],
    availability: {
      ja: '仕様は The Open Group が公開。対応ツールにはオープンソースのものもある。商標や準拠表明の扱いには条件があるため、社外公開資料に使う場合は各自で確認すること。',
      en: 'The specification is published by The Open Group and open-source tooling exists. Trademark and conformance claims carry conditions, so check them yourself before using it in external material.',
    },
    keywords: ['archimate', 'アーキメイト', 'モデリング', 'modeling', 'notation', '記法', 'archi', 'ea モデル', 'レイヤ', 'layered', '可視化'],
    comparison: {
      granularity: { ja: '企業全体から個別コンポーネントまで、同じ記法で連続的に描ける', en: 'One notation spanning the whole enterprise down to individual components' },
      artifacts: { ja: 'ビューポイント別の図とモデルリポジトリ', en: 'Viewpoint-specific diagrams backed by a model repository' },
      learningCurve: { ja: '基本要素だけなら数日。全要素を使いこなすには数か月。', en: 'Days for the core elements; months to wield the full vocabulary' },
    },
  },
  {
    id: 'zachman',
    name: { ja: 'Zachman Framework', en: 'Zachman Framework' },
    owner: { ja: 'Zachman International(John A. Zachman)', en: 'Zachman International (John A. Zachman)' },
    category: 'modeling',
    summary: {
      ja: '「何を・どうやって・どこで・誰が・いつ・なぜ」の 6 列と、経営者から実装者までの視点を並べた 6 行で作る分類表。作る手順は定義しておらず、既にある成果物を置く座標系として機能する。',
      en: 'A classification matrix: six columns (what, how, where, who, when, why) against six rows of perspective, from executive to implementer. It defines no procedure; it is a coordinate system for filing the artifacts you already have.',
    },
    strengths: [
      { ja: '手持ちの資料の抜けが一目で分かる(空白のマスがそのまま欠落)', en: 'Missing material is visible at a glance — an empty cell is a missing artifact' },
      { ja: '「誰向けか」と「何を書くか」を混同しない訓練になる', en: 'Trains people to stop conflating who a document is for with what it describes' },
      { ja: '記法にもツールにも依存しないので、既存資産の棚卸しに使いやすい', en: 'Independent of notation and tooling, which makes it easy to apply to an existing document estate' },
    ],
    limits: [
      { ja: '手順が無い。これ単体では何も前に進まない。', en: 'There is no process. On its own it moves nothing forward.' },
      { ja: '全マスを埋めにいくと、誰も読まない文書の山を作って終わる', en: 'Trying to fill every cell ends in a mountain of documents nobody reads' },
      { ja: 'クラウド前提・反復開発前提の現代的な議論には直接は噛み合わない', en: 'It does not engage directly with modern cloud-native, iterative delivery discussions' },
    ],
    combineWithAdm: {
      ja: '予備フェーズでアーキテクチャリポジトリの棚割りを決めるときと、B〜D で「この視点向けの資料が無い」を洗い出すときに使う。埋めるべきマスを先に絞ってから使うこと。',
      en: 'Use it in the Preliminary Phase to lay out the architecture repository, and in Phases B–D to find which perspective has no material. Decide which cells matter before you start filling them.',
    },
    phaseIds: ['preliminary', 'b', 'c', 'd'],
    availability: {
      ja: '概要は広く公開されている。公式の図表と研修は Zachman International が提供。',
      en: 'The outline is widely published; the official chart and training come from Zachman International.',
    },
    keywords: ['zachman', 'ザックマン', '分類', 'classification', 'matrix', 'マトリクス', 'ontology', '棚卸し', '成果物整理'],
    comparison: {
      granularity: { ja: '成果物の分類のみ。中身の粒度には踏み込まない。', en: 'Classification only; it says nothing about the detail inside each artifact' },
      artifacts: { ja: '6×6 の分類表と、そこに配置した既存成果物の一覧', en: 'A six-by-six chart plus the inventory of artifacts placed in it' },
      learningCurve: { ja: '概念は 1 時間で理解できる。運用に乗せるのは別問題。', en: 'The idea takes an hour; operating it is another matter' },
    },
  },
  {
    id: 'c4-model',
    name: { ja: 'C4 モデル', en: 'C4 Model' },
    owner: { ja: 'Simon Brown(個人が策定・公開)', en: 'Simon Brown (created and published by an individual)' },
    category: 'modeling',
    summary: {
      ja: 'ソフトウェアの構造を Context / Container / Component / Code の 4 段階のズームで描く方法。1 枚に全部を詰め込まず、聞き手に応じて縮尺を変えるのが要点。図の記法自体は自由で、凡例を付けることだけを求める。',
      en: 'Describe a software system at four zoom levels — context, container, component, code. The point is to change scale for the audience instead of cramming everything onto one diagram. The visual notation is deliberately free-form; it only asks for a legend.',
    },
    strengths: [
      { ja: '学習コストが実質ゼロ。開発チームがその場で描き始められる。', en: 'Effectively zero learning cost — a delivery team can start drawing in the same meeting' },
      { ja: '抽象度が段階で固定されるので「この図は何の話か」で揉めない', en: 'Fixing the zoom level per diagram kills the argument about what a diagram is even about' },
      { ja: 'Mermaid や PlantUML などテキスト記法で書けるため、コードと一緒に差分管理できる', en: 'It can be written in text notations such as Mermaid or PlantUML, so diagrams live in version control next to the code' },
    ],
    limits: [
      { ja: '対象はソフトウェアシステム 1 つ。企業全体の依存関係は表せない。', en: 'Scoped to one software system; it cannot express enterprise-wide dependencies.' },
      { ja: '事業能力・組織・データガバナンスは完全に範囲外', en: 'Business capability, organisation and data governance are entirely out of scope' },
      { ja: '要素が型付けされていないため、多数のモデルを機械的に検査する用途には向かない', en: 'Elements are not typed, so it is a poor basis for automated checking across many models' },
    ],
    combineWithAdm: {
      ja: 'フェーズ C(アプリケーション)と D の個別システム記述に使う。企業全体は ArchiMate で押さえ、システム 1 つの中身は C4 に落とすと読み手が一気に増える。',
      en: 'Use it for per-system descriptions in Phases C and D. Hold the enterprise picture in ArchiMate and drop to C4 inside a single system — the readership multiplies.',
    },
    phaseIds: ['c', 'd'],
    availability: {
      ja: '考案者のサイトで無償公開。再利用の条件はサイト記載のライセンス表記を確認すること。',
      en: 'Published free of charge on the author\'s site; check the licence stated there before reusing the material.',
    },
    // 'context' / 'container' / 'component' は単独だと Docker や汎用語に釣られるため図名で限定する
    keywords: ['c4', 'c4 model', 'c4モデル', 'context diagram', 'container diagram', 'component diagram', 'コンテナ図', 'コンポーネント図', 'ソフトウェアアーキテクチャ', 'software architecture', 'mermaid', 'plantuml', 'ズーム'],
    comparison: {
      granularity: { ja: 'システム 1 つの内部を 4 段階で。企業全体は扱わない。', en: 'Four zoom levels inside one system; no enterprise scope' },
      artifacts: { ja: '4 種類の図とテキスト定義(バージョン管理可能)', en: 'Four diagram kinds, expressible as version-controllable text' },
      learningCurve: { ja: '30 分。開発者向けの説明が要らない。', en: 'Half an hour; developers need no briefing' },
    },
  },
  {
    id: 'bpmn',
    name: { ja: 'BPMN(ビジネスプロセスモデル記法)', en: 'BPMN (Business Process Model and Notation)' },
    owner: { ja: 'Object Management Group (OMG)', en: 'Object Management Group (OMG)' },
    category: 'modeling',
    summary: {
      ja: '業務プロセスをイベント・アクティビティ・ゲートウェイ・フローで描く記法。プールとレーンで担当を分けるため、部門をまたぐ受け渡しの断絶が図の上に現れる。実行エンジンで動かせる水準まで書ける点が他の作図記法との決定的な違い。',
      en: 'A notation for business processes built from events, activities, gateways and flows. Pools and lanes separate who does what, so hand-off breakdowns between departments surface visually. Unlike most drawing notations, it can be written precisely enough for an execution engine.',
    },
    strengths: [
      { ja: '業務担当者が読める。合意形成の道具として長い実績がある。', en: 'Business staff can read it; it has a long track record as a consensus-building device' },
      { ja: '例外系・待ち・分岐を明示する作りなので、要件の抜けが減る', en: 'It forces exceptions, waits and branches to be drawn, which cuts missed requirements' },
      { ja: '多くのワークフロー基盤・BPM 製品が取り込めるため、図が実装につながる', en: 'Many workflow and BPM platforms import it, so the diagram carries through to implementation' },
    ],
    limits: [
      { ja: '1 本のプロセスしか表せない。企業全体の構造はこれでは見えない。', en: 'It shows one process at a time; enterprise structure never emerges from it.' },
      { ja: '詳細に書くほど保守されなくなる。現場が変わっても図は変わらない。', en: 'The more detail, the less it is maintained — the process changes and the diagram does not.' },
      { ja: '記法要素が多く、全部使うと読めなくなる(実務で必要なのは一部)', en: 'The element set is large; using all of it destroys readability — practice needs only a fraction' },
    ],
    combineWithAdm: {
      ja: 'フェーズ B のプロセス記述の標準記法として使う。粗い流れはバリューストリームで押さえ、実際に自動化・改修する範囲だけ BPMN に落とすと保守が続く。',
      en: 'Adopt it as the standard notation for process description in Phase B. Keep the coarse flow as value streams and drop only the stretch you will actually automate into BPMN — that is the version that stays maintained.',
    },
    phaseIds: ['b', 'c'],
    availability: {
      ja: '仕様は OMG が公開。国際規格としても発行されている。対応ツールは無償・商用の双方がある。',
      en: 'The specification is published by OMG and also issued as an international standard; both free and commercial tools support it.',
    },
    keywords: ['bpmn', '業務プロセス', 'process', 'プロセス図', 'omg', 'workflow', 'ワークフロー', 'swimlane', 'レーン', '業務フロー', '自動化'],
    comparison: {
      granularity: { ja: '業務プロセス 1 本を、実行可能な精度まで', en: 'One business process, down to executable precision' },
      artifacts: { ja: 'プロセス図と、実行エンジン向けの定義ファイル', en: 'Process diagrams and engine-ready definition files' },
      learningCurve: { ja: '読むだけなら半日。実行可能な記述には訓練が要る。', en: 'Half a day to read; real training to write executable models' },
    },
  },
  {
    id: 'dmn',
    name: { ja: 'DMN(決定モデル記法)', en: 'DMN (Decision Model and Notation)' },
    owner: { ja: 'Object Management Group (OMG)', en: 'Object Management Group (OMG)' },
    category: 'modeling',
    summary: {
      ja: '与信可否や料金区分といった業務上の判断を、決定要求図とデシジョンテーブルで表す記法。プロセス図の分岐条件に判断ロジックを埋め込むのをやめ、判断だけを外に出して管理するために使う。',
      en: 'A notation for business decisions — credit approval, pricing tier — expressed as decision requirement diagrams and decision tables. Its purpose is to stop burying decision logic inside process gateways and manage the decisions as first-class objects.',
    },
    strengths: [
      { ja: 'ルールが表になるので、業務部門が直接レビューし修正できる', en: 'Rules become tables the business can review and edit directly' },
      { ja: 'ルール変更をアプリ改修から切り離せる(改修リードタイムが縮む)', en: 'Rule changes decouple from application releases, shortening lead time' },
      { ja: '網羅性・矛盾の検査をツールで機械的にできる', en: 'Completeness and contradiction checks can be run mechanically by tooling' },
    ],
    limits: [
      { ja: '判断だけを扱う。プロセス全体や組織構造は対象外。', en: 'Decisions only; process flow and organisation are out of scope.' },
      { ja: 'ルールが数百件を超えると表の管理そのものが新しい課題になる', en: 'Past a few hundred rules, managing the tables becomes its own problem' },
      { ja: '機械学習による判断など、明文化できないロジックには使えない', en: 'Unusable for logic that cannot be written down, such as model-based scoring' },
    ],
    combineWithAdm: {
      ja: 'フェーズ B で業務ルールを洗い出す際に BPMN と対で使う。C ではルールをアプリに埋め込むかルール基盤に置くかという設計判断に直結する。',
      en: 'Pair it with BPMN when harvesting business rules in Phase B. In Phase C it feeds directly into the decision of whether rules live inside applications or on a rules platform.',
    },
    phaseIds: ['b', 'c'],
    availability: {
      ja: '仕様は OMG が公開。オープンソースの実装がある。',
      en: 'The specification is published by OMG; open-source implementations exist.',
    },
    keywords: ['dmn', '決定', 'decision', 'ビジネスルール', 'business rule', 'デシジョンテーブル', 'decision table', 'omg', '判断', 'ルール'],
    comparison: {
      granularity: { ja: '判断 1 件単位。入力から結論までの依存関係を表す。', en: 'One decision at a time, with its input dependencies' },
      artifacts: { ja: '決定要求図とデシジョンテーブル', en: 'Decision requirement diagrams and decision tables' },
      learningCurve: { ja: 'デシジョンテーブルだけなら数時間', en: 'A few hours if you stay with decision tables' },
    },
  },
  {
    id: 'uml',
    name: { ja: 'UML(統一モデリング言語)', en: 'UML (Unified Modeling Language)' },
    owner: { ja: 'Object Management Group (OMG)', en: 'Object Management Group (OMG)' },
    category: 'modeling',
    summary: {
      ja: 'ソフトウェアの構造と振る舞いを描く汎用記法。クラス図・シーケンス図・状態機械図など図種が多いが、EA の文脈で本当に効くのはシーケンス図と状態機械図の 2 つに絞られることが多い。',
      en: 'A general-purpose notation for software structure and behaviour. It offers many diagram kinds, but in an EA context the ones that keep earning their place are sequence diagrams and state machines.',
    },
    strengths: [
      { ja: '開発者に説明不要で通じる。ツールの選択肢も多い。', en: 'Developers need no briefing, and tool choice is wide' },
      { ja: 'シーケンス図は連携の時系列と失敗経路を詰めるのに今も最適', en: 'Sequence diagrams remain the best way to nail down interaction ordering and failure paths' },
      { ja: '状態機械図は「起きてはいけない遷移」を設計段階で潰せる', en: 'State machines let you kill impossible-but-reachable transitions at design time' },
    ],
    limits: [
      { ja: '図種が多く、網羅的に描くと維持できない', en: 'Too many diagram kinds; drawing them all guarantees they will not be maintained' },
      { ja: 'クラス図はコードと二重管理になりやすく、乖離した瞬間に嘘の資料になる', en: 'Class diagrams duplicate the code and become lies the moment they drift' },
      { ja: '経営層・業務部門には読めない。合意形成の場には出せない。', en: 'Executives and business units cannot read it; it does not belong in a consensus meeting.' },
    ],
    combineWithAdm: {
      ja: 'フェーズ C/D の詳細検討で、特定の連携や状態遷移を詰めるときに限定して使う。企業全体は ArchiMate、システム全体像は C4、その下に UML という階層にすると重複しない。',
      en: 'Reserve it for detailed work in Phases C and D on a specific interaction or state model. Layer it under ArchiMate for the enterprise and C4 for the system, and the overlap disappears.',
    },
    phaseIds: ['c', 'd'],
    availability: {
      ja: '仕様は OMG が公開。国際規格としても発行されている。',
      en: 'The specification is published by OMG and also issued as an international standard.',
    },
    keywords: ['uml', 'クラス図', 'シーケンス図', 'sequence diagram', 'class diagram', 'state machine', '状態遷移', 'omg', '詳細設計'],
    comparison: {
      granularity: { ja: 'クラス・メッセージ単位の詳細', en: 'Class- and message-level detail' },
      artifacts: { ja: 'シーケンス図・状態機械図・クラス図など', en: 'Sequence, state machine and class diagrams among others' },
      learningCurve: { ja: '主要 2〜3 図種なら 1 日。全図種は不要。', en: 'A day for the two or three diagrams that matter; the rest is unnecessary' },
    },
  },
  {
    id: '4plus1-views',
    name: { ja: '4+1 ビューモデル', en: '4+1 View Model' },
    owner: { ja: 'Philippe Kruchten が提唱(論文として公開)', en: 'Proposed by Philippe Kruchten (published as a paper)' },
    category: 'modeling',
    summary: {
      ja: 'システムを論理・プロセス・開発・物理の 4 つのビューで記述し、シナリオでそれらを束ねる古典的な整理。「1 枚の図で全部を説明しようとするな」という主張を最初に定式化したもので、以降のビューポイント論の下敷きになっている。',
      en: 'A classic scheme: describe a system through logical, process, development and physical views, tied together by scenarios. It was the first formal statement of "stop trying to explain everything in one diagram", and later viewpoint thinking builds on it.',
    },
    strengths: [
      { ja: 'ビューを分ける発想を最短で説明できる。教育用途に強い。', en: 'The fastest way to explain why views are separated; excellent for teaching' },
      { ja: '特定の記法に縛られないので、既存資料の読み替えに使える', en: 'Notation-agnostic, so it works as a lens for re-reading existing material' },
      { ja: 'シナリオでビュー間の整合を確認する手順が明確', en: 'It gives a clear procedure for checking consistency across views using scenarios' },
    ],
    limits: [
      { ja: '分類が古い時代のシステム観に基づいており、データ・セキュリティ・クラウド運用の観点が薄い', en: 'The categories reflect an older view of systems; data, security and cloud operations are thin' },
      { ja: 'そのまま採用すると ArchiMate や C4 と役割が重複する', en: 'Adopting it wholesale duplicates what ArchiMate or C4 already do' },
      { ja: '現在は単独採用より、考え方だけ借りる使い方が現実的', en: 'Today it is more realistic to borrow the idea than to adopt it as the scheme of record' },
    ],
    combineWithAdm: {
      ja: 'フェーズ C/D でビューの切り方を決めるときの参考にする。ADM のステークホルダー・関心事・ビューの考え方と発想が同じなので、既存資料が 4+1 で書かれている場合の読み替え表として使える。',
      en: 'Use it as a reference when deciding how to slice views in Phases C and D. It shares its logic with the ADM\'s stakeholder-concern-view chain, so it doubles as a mapping table for legacy material written in 4+1 form.',
    },
    phaseIds: ['c', 'd'],
    availability: {
      ja: '論文として公開されており、無償で読める。',
      en: 'Published as a paper and freely readable.',
    },
    keywords: ['4+1', '4+1 view', 'kruchten', 'ビューモデル', 'view model', '論理ビュー', 'logical view', 'シナリオ', 'ビュー'],
    comparison: {
      granularity: { ja: 'システム 1 つを 5 つの切り口で', en: 'One system seen through five lenses' },
      artifacts: { ja: 'ビュー別の図とシナリオ記述', en: 'Per-view diagrams plus scenario descriptions' },
      learningCurve: { ja: '1 時間。論文 1 本で足りる。', en: 'An hour; one paper covers it' },
    },
  },

  // ------------------------------------------------------------------ method
  {
    id: 'ddd',
    name: { ja: 'DDD(ドメイン駆動設計)', en: 'DDD (Domain-Driven Design)' },
    owner: { ja: 'Eric Evans が提唱(特定の管理団体を持たない)', en: 'Introduced by Eric Evans; no governing body' },
    category: 'method',
    summary: {
      ja: '業務の言葉づかいをそのままモデルとコードに持ち込み、言葉の意味が変わる境界でシステムを分割する設計手法。分割の理由を技術都合ではなく業務の意味に置く点が、EA のドメイン分割と直結する。',
      en: 'A design approach that carries the language of the business straight into the model and the code, and splits systems where the meaning of that language changes. Because the reason for a split is semantic rather than technical, it lines up directly with EA domain partitioning.',
    },
    strengths: [
      { ja: 'サービス分割の単位に業務上の根拠を与えられる(技術都合の分割を防げる)', en: 'Gives service boundaries a business justification instead of a technical one' },
      { ja: 'コンテキストマップでシステム間の力関係と翻訳が必要な箇所が見える', en: 'A context map exposes the power relationships between systems and where translation is required' },
      { ja: '同じ「顧客」が部門で別物、という用語の衝突を設計上の問題として扱える', en: 'Turns terminology collisions — one word, two meanings per department — into an explicit design problem' },
    ],
    limits: [
      { ja: '業務が単純な領域では過剰。CRUD で足りるものに戦術的パターンを持ち込むと複雑になるだけ。', en: 'Overkill in simple domains; applying tactical patterns to plain CRUD only adds complexity.' },
      { ja: '設計者・開発者に一定の熟練が要る。形だけ真似ると層が増えるだけになる。', en: 'Requires seasoned designers; copied superficially it just adds layers.' },
      { ja: '業務専門家が継続的に関与できる体制が前提。人を出せない組織では機能しない。', en: 'Assumes domain experts stay involved; without that staffing it does not work.' },
    ],
    combineWithAdm: {
      ja: 'フェーズ B で洗い出した事業能力・バリューストリームを、C のアプリケーション分割に落とす橋渡しに使う。境界づけられたコンテキストは、そのまま候補となるアプリケーションコンポーネントの単位になる。',
      en: 'Use it as the bridge from the capabilities and value streams found in Phase B to the application partitioning of Phase C. A bounded context is a ready-made candidate application component.',
    },
    phaseIds: ['b', 'c'],
    availability: {
      ja: '書籍と多数のコミュニティ資料。無償の解説も豊富。',
      en: 'Books plus a large body of community material; plenty of free explanation available.',
    },
    keywords: ['ddd', 'domain driven design', 'ドメイン駆動', '境界づけられたコンテキスト', 'bounded context', 'ユビキタス言語', 'マイクロサービス', 'microservices', 'コンテキストマップ', '分割'],
    comparison: {
      granularity: { ja: 'ドメインの境界からクラス設計まで', en: 'From domain boundaries down to class design' },
      artifacts: { ja: 'コンテキストマップ、ドメインモデル、動くコード', en: 'Context maps, domain models and working code' },
      learningCurve: { ja: '概念は数日。使いこなすには実案件が数本要る。', en: 'Days for the concepts; several real projects to use them well' },
    },
  },

  // ---------------------------------------------------- business-architecture
  {
    id: 'bizbok',
    name: { ja: 'BIZBOK Guide(ビジネスアーキテクチャ知識体系ガイド)', en: 'BIZBOK Guide (Business Architecture Body of Knowledge)' },
    owner: { ja: 'Business Architecture Guild', en: 'Business Architecture Guild' },
    category: 'business-architecture',
    summary: {
      ja: '事業側の構造を、ケイパビリティ・バリューストリーム・組織・情報を軸に整理する体系。TOGAF のフェーズ B が「何をどこまで書くか」を細かく決めていないのに対し、こちらは記述方法とマッピング手順が具体的。',
      en: 'A body of knowledge that organises the business side around capabilities, value streams, organisation and information. Where TOGAF Phase B leaves the level of description open, this is specific about how to write it and how to map the pieces together.',
    },
    strengths: [
      { ja: 'ケイパビリティマップの作り方(階層・粒度・命名)が具体的で、迷いが減る', en: 'Concrete guidance on building a capability map — levels, granularity, naming — removes the guesswork' },
      { ja: 'バリューストリームとケイパビリティの交差でヒートマップを作り、投資判断に直結させられる', en: 'Crossing value streams with capabilities yields a heat map that feeds investment decisions directly' },
      { ja: 'IT を持ち出さずに事業部門と会話できる語彙が揃っている', en: 'Provides vocabulary for talking to business units without dragging IT into the room' },
    ],
    limits: [
      { ja: 'アプリケーション層・技術層は範囲外。C 以降は別の道具が要る。', en: 'Application and technology layers are out of scope; Phase C onward needs other tools.' },
      { ja: 'マップ作りが目的化しやすい。1 年かけて地図だけが残る事故が頻発する。', en: 'Map-making easily becomes the goal; a year spent producing only a map is a common failure.' },
      { ja: '資料の入手に会員登録が要るため、社内への配布に制約が出る', en: 'Access is membership-based, which constrains internal distribution of the material.' },
    ],
    combineWithAdm: {
      ja: 'フェーズ B のビジネスアーキテクチャの記述方法として採用し、成果物をケイパビリティマップとバリューストリームで表す。E ではヒートマップをそのまま作業パッケージの優先順位付けに使える。',
      en: 'Adopt it as the description method for Phase B and express the deliverables as capability maps and value streams. In Phase E the heat map converts directly into work-package prioritisation.',
    },
    phaseIds: ['a', 'b', 'e'],
    availability: {
      ja: 'ギルドの会員向けに配布されており、改訂が続いている。版によって内容が異なる点に注意。',
      en: 'Distributed to guild members and revised on an ongoing basis; content differs between editions.',
    },
    keywords: ['bizbok', 'ビジネスアーキテクチャ', 'business architecture', 'capability', 'ケイパビリティ', 'value stream', 'バリューストリーム', 'guild', '能力', 'ヒートマップ'],
    comparison: {
      granularity: { ja: '事業能力を 3〜4 階層まで。IT には降りない。', en: 'Capabilities to three or four levels; never descends into IT' },
      artifacts: { ja: 'ケイパビリティマップ、バリューストリーム、各種クロスマッピング', en: 'Capability maps, value streams and cross-mappings' },
      learningCurve: { ja: '考え方は数日。粒度感を掴むには経験者の伴走が要る。', en: 'Days for the concepts; getting granularity right needs an experienced hand alongside' },
    },
  },
  {
    id: 'wardley-mapping',
    name: { ja: 'Wardley マッピング', en: 'Wardley Mapping' },
    owner: { ja: 'Simon Wardley が考案・公開', en: 'Created and published by Simon Wardley' },
    category: 'business-architecture',
    summary: {
      ja: '縦軸に利用者から見た価値連鎖、横軸に構成要素の進化段階(未成熟から汎用品まで)を取って地図を描く手法。「今どこに自前で作る価値があるか」を位置関係として示せる。',
      en: 'Draw a map with the user-facing value chain on the vertical axis and the evolution of each component — from immature to commodity — on the horizontal. It renders the question of where building your own still pays as a matter of position.',
    },
    strengths: [
      { ja: '内製か調達かの判断根拠を、絵で経営層に示せる', en: 'Turns build-versus-buy reasoning into a picture executives accept' },
      { ja: '要素が右へ動くという時間軸を持つので、今の最適解が数年後に負債になることを説明できる', en: 'Its built-in drift to the right explains why today\'s optimum becomes tomorrow\'s liability' },
      { ja: '専門記法の学習が要らず、その場のホワイトボードで描ける', en: 'No notation to learn; it can be drawn on the whiteboard in the meeting' },
    ],
    limits: [
      { ja: '描き手の主観が強く出る。同じ事業でも人によって地図が違う。', en: 'Heavily subjective — two people map the same business differently.' },
      { ja: '検証手段が無いため、間違った地図でも説得力を持ってしまう', en: 'There is no validation mechanism, so a wrong map is just as persuasive as a right one' },
      { ja: '詳細設計には使えない。実装の指示は一切出ない。', en: 'Useless for detailed design; it issues no implementation guidance.' },
    ],
    combineWithAdm: {
      ja: 'フェーズ A で「そもそもどこを変えるか」の当たりを付け、E/F で作業パッケージの優先順位と調達方針(内製か既製品か)の根拠に使う。',
      en: 'Use it in Phase A to locate where change is worth making at all, and in Phases E and F to justify work-package priority and the build-or-buy stance.',
    },
    phaseIds: ['a', 'b', 'e', 'f'],
    availability: {
      ja: '考案者が公開しており無償で利用できる。再利用条件は原典のライセンス表記を確認すること。',
      en: 'Published free of charge by its creator; check the stated licence before reusing the material.',
    },
    keywords: ['wardley', 'ワードリー', 'wardley mapping', 'マッピング', 'evolution', '進化', 'value chain', '価値連鎖', '内製', 'buy vs build', 'build vs buy', 'make or buy', 'sourcing', '調達', '外注', '戦略'],
    comparison: {
      granularity: { ja: '構成要素を数十個まで。1 枚に収まる粗さで止める。', en: 'A few dozen components — deliberately coarse enough for one sheet' },
      artifacts: { ja: '地図 1 枚と、そこから導いた戦略上の打ち手', en: 'A single map plus the strategic moves derived from it' },
      learningCurve: { ja: '半日で描ける。妥当な地図を描けるまでは反復が要る。', en: 'Half a day to draw one; several attempts before the map is any good' },
    },
  },
  {
    id: 'business-model-canvas',
    name: { ja: 'ビジネスモデルキャンバス', en: 'Business Model Canvas' },
    owner: { ja: 'Alexander Osterwalder / Strategyzer', en: 'Alexander Osterwalder / Strategyzer' },
    category: 'business-architecture',
    summary: {
      ja: '事業の成り立ちを、顧客・価値提案・チャネル・顧客関係・収益・資源・活動・パートナー・コストの 9 枠で 1 枚に収める道具。精密な分析ではなく、関係者が同じ絵を見て前提のズレに気付くために使う。',
      en: 'A one-page tool that lays a business out across nine blocks: customers, value proposition, channels, relationships, revenue, resources, activities, partners and costs. Its job is not precise analysis but getting stakeholders to notice where their assumptions differ.',
    },
    strengths: [
      { ja: '1 時間のワークショップで埋まる。合意形成の初速が速い。', en: 'Fills up in a one-hour workshop; nothing gets consensus moving faster' },
      { ja: '収益とコストが同じ紙にあるので、投資対効果の議論から逃げられない', en: 'Revenue and cost sit on the same sheet, so the return conversation cannot be dodged' },
      { ja: '経営層・事業部門に事前説明が要らない', en: 'Executives and business units need no briefing to read it' },
    ],
    limits: [
      { ja: '静的な断面図。競合の動きや時間変化は表せない。', en: 'A static snapshot; competitive moves and change over time are invisible.' },
      { ja: '埋めた内容の妥当性は検証されない。願望を書いても誰も止めない。', en: 'Nothing validates what you write; wishful thinking passes unchallenged.' },
      { ja: 'システム・データ・組織の実装には全く踏み込まない', en: 'It says nothing at all about systems, data or organisational implementation' },
    ],
    combineWithAdm: {
      ja: 'フェーズ A で「誰に何の価値を、どの収益構造で」という前提を短時間で揃え、B のビジネスアーキテクチャへの入力にする。',
      en: 'Use it in Phase A to align quickly on who gets what value under which revenue model, then feed that into the Phase B business architecture.',
    },
    phaseIds: ['a', 'b'],
    availability: {
      ja: 'キャンバス自体は広く公開・利用されている。書籍や関連ツールは有償。',
      en: 'The canvas itself is widely published and used; the books and companion tooling are commercial.',
    },
    keywords: ['business model canvas', 'ビジネスモデルキャンバス', 'bmc', '価値提案', 'value proposition', 'ビジネスモデル', 'business model', 'キャンバス', '新規事業'],
    comparison: {
      granularity: { ja: '事業 1 つを 9 枠、1 ページで', en: 'One business, nine blocks, one page' },
      artifacts: { ja: '記入済みキャンバス 1 枚', en: 'A single filled-in canvas' },
      learningCurve: { ja: '説明 10 分', en: 'Ten minutes of explanation' },
    },
  },

  // ---------------------------------------------------------------- delivery
  {
    id: 'safe',
    name: { ja: 'SAFe(スケールドアジャイルフレームワーク)', en: 'SAFe (Scaled Agile Framework)' },
    owner: { ja: 'Scaled Agile, Inc.', en: 'Scaled Agile, Inc.' },
    category: 'delivery',
    summary: {
      ja: '複数のアジャイルチームを束ねて大規模開発を回すための枠組み。数か月周期で全チームの計画を揃える場と、常設のチーム群が中核にある。TOGAF が「何を作るべきか」を決めるのに対し、SAFe は「決まったものをどう届けるか」を扱う。',
      en: 'A framework for running large-scale development across many agile teams, built around long-lived team groupings and a periodic event where all of them align their plans. Where TOGAF decides what should be built, SAFe handles how it gets delivered.',
    },
    strengths: [
      { ja: '依存関係を持つ複数チームの計画を、同じ場で同時に揃えられる', en: 'Aligns the plans of interdependent teams in one room at one time' },
      { ja: '予算をプロジェクト単位からプロダクト単位に移す議論の型が用意されている', en: 'Provides a ready-made argument for moving budgeting from projects to products' },
      { ja: 'ロールと会議体が定義済みなので、大企業の導入手順として扱いやすい', en: 'Roles and ceremonies come predefined, which makes it tractable as a large-enterprise rollout plan' },
    ],
    limits: [
      { ja: '儀式が多く、形だけ導入すると重いウォーターフォールになる', en: 'Ceremony-heavy; adopted as a shell it becomes a slow waterfall with new vocabulary' },
      { ja: '組織構造を変えずに導入しても、チーム間の依存関係は減らない', en: 'Introduced without changing the organisation, inter-team dependencies do not go away' },
      { ja: '研修・認定のコストが高く、そこへの依存を嫌う組織もある', en: 'Training and certification are costly, and some organisations object to the dependency that creates' },
    ],
    combineWithAdm: {
      ja: 'フェーズ E/F で定義した作業パッケージと移行計画を、SAFe 側のポートフォリオ/プログラム階層のバックログに引き渡す。G のガバナンスは SAFe のアーキテクチャ確保の仕組みと接続すると機能する。',
      en: 'Hand the work packages and migration plan from Phases E and F to the SAFe portfolio and programme backlogs. Phase G governance works when it is wired into the SAFe mechanism for keeping architectural runway ahead of delivery.',
    },
    phaseIds: ['e', 'f', 'g'],
    availability: {
      ja: 'フレームワークの解説は公開されている。研修・認定および一部の利用は有償ライセンス。',
      en: 'The framework description is published; training, certification and some uses require a commercial licence.',
    },
    // 'art' は英語の一般語に釣られるだけなので入れない(SAFe 用語としては 'pi planning' で足りる)
    keywords: ['safe', 'スケールドアジャイル', 'scaled agile', 'アジャイル', 'agile', 'pi planning', '大規模開発', 'ポートフォリオ', 'デリバリ', 'スクラム', '複数チーム', 'チーム間', '依存関係', 'multiple teams'],
    comparison: {
      granularity: { ja: '複数チーム・複数四半期の計画単位', en: 'Multi-team, multi-quarter planning units' },
      artifacts: { ja: '各階層のバックログ、計画ボード、依存関係マップ', en: 'Backlogs per level, planning boards and dependency maps' },
      learningCurve: { ja: '導入は組織変更を伴い、半年から数年', en: 'Adoption implies organisational change: six months to several years' },
    },
  },
  {
    id: 'team-topologies',
    name: { ja: 'Team Topologies(チームトポロジー)', en: 'Team Topologies' },
    owner: { ja: 'Matthew Skelton, Manuel Pais(書籍として公開)', en: 'Matthew Skelton and Manuel Pais (published as a book)' },
    category: 'delivery',
    summary: {
      ja: 'チームの型を 4 つ、チーム間の関わり方を 3 つに絞り、認知負荷を基準に組織を設計する考え方。アーキテクチャと組織構造は同じものの裏表だ、という前提に立っている。',
      en: 'An approach that limits teams to four types and their interactions to three modes, and designs the organisation around cognitive load. It starts from the premise that architecture and org structure are two faces of the same thing.',
    },
    strengths: [
      { ja: '「この構造だと結局誰が保守するのか」という問いに答えを出せる', en: 'Answers the question every target architecture dodges: who actually maintains this' },
      { ja: 'プラットフォームチームの責務範囲を決める議論に直接使える', en: 'Directly usable for settling what a platform team is and is not responsible for' },
      { ja: '認知負荷という比較的測りやすい基準があるため、チーム分割が主観論争になりにくい', en: 'Cognitive load is a relatively measurable criterion, which keeps team-splitting out of pure opinion' },
    ],
    limits: [
      { ja: '組織を変える権限が無い立場では実行できない', en: 'Unusable from a position without the authority to change the organisation' },
      { ja: '4 つの型に当てはめること自体が目的化しやすい', en: 'Sorting every team into one of four boxes easily becomes the goal in itself' },
      { ja: '技術アーキテクチャそのものの答えは出ない', en: 'It produces no answers about the technical architecture itself' },
    ],
    combineWithAdm: {
      ja: 'フェーズ E/F で作業パッケージの担い手を決めるとき、および H で定常運用体制を設計するときに使う。目標アーキテクチャの境界とチーム境界を意図的に揃えると、引き継ぎコストが目に見えて下がる。',
      en: 'Use it when assigning owners to work packages in Phases E and F, and when designing the steady-state organisation in Phase H. Deliberately aligning team boundaries with target-architecture boundaries visibly cuts hand-off cost.',
    },
    phaseIds: ['e', 'f', 'h'],
    availability: {
      ja: '書籍として販売。概念の要約は著者らが公開している。',
      en: 'Sold as a book; the authors publish summaries of the core concepts.',
    },
    keywords: ['team topologies', 'チームトポロジー', 'チーム', 'team', '組織', '組織設計', 'organization', '認知負荷', 'cognitive load', 'プラットフォーム', 'platform', 'conway', '体制', '保守担当'],
    comparison: {
      granularity: { ja: 'チーム単位。個人の役割までは決めない。', en: 'Team level; it does not assign individual roles' },
      artifacts: { ja: 'チーム構成図と、チーム間の関わり方の定義', en: 'A team structure map and defined interaction modes' },
      learningCurve: { ja: '読むのは 1 日。組織に適用するのは政治的作業。', en: 'A day to read; applying it is political work' },
    },
  },

  // -------------------------------------------------------------- operations
  {
    id: 'it4it',
    name: { ja: 'IT4IT リファレンスアーキテクチャ', en: 'IT4IT Reference Architecture' },
    owner: { ja: 'The Open Group', en: 'The Open Group' },
    category: 'operations',
    summary: {
      ja: 'IT 組織自身の業務(サービスの企画から運用まで)を、価値の流れと受け渡すデータの単位で定義した参照アーキテクチャ。「IT 部門をひとつのシステムとして設計する」という発想が特徴。',
      en: 'A reference architecture that defines the work of the IT organisation itself — from service planning to operations — as value streams plus the data objects handed between them. Its distinguishing idea is to design the IT function as if it were a system.',
    },
    strengths: [
      { ja: 'ITSM・CI/CD・監視などツール乱立を、データの受け渡しという観点で整理できる', en: 'Untangles the sprawl of ITSM, CI/CD and monitoring tools by asking what data passes between them' },
      { ja: '「どのツールが正の情報源か」を決める議論の型になる', en: 'Gives structure to the argument about which tool is the system of record' },
      { ja: 'TOGAF と同じ団体の成果物で、用語の衝突が起きにくい', en: 'Comes from the same body as TOGAF, so terminology collisions are rare' },
    ],
    limits: [
      { ja: '対象は IT 組織の内部業務。事業側のアーキテクチャには何も言わない。', en: 'Scoped to the internals of the IT function; it says nothing about the business architecture.' },
      { ja: '参照モデルが大きく、そのまま導入すると現場の実態と合わない', en: 'The reference model is large; adopted verbatim it will not match how the shop actually works' },
      { ja: '小規模組織には過剰。ツールが数個なら表計算で足りる。', en: 'Overkill for small organisations; with a handful of tools a spreadsheet does the job.' },
    ],
    combineWithAdm: {
      ja: 'フェーズ B で IT 部門自身の業務を描くとき、および G/H で運用への引き渡しとサービス管理の設計をするときに使う。',
      en: 'Use it in Phase B when the IT function itself is the business being modelled, and in Phases G and H to design hand-over to operations and ongoing service management.',
    },
    phaseIds: ['b', 'c', 'g', 'h'],
    availability: {
      ja: '標準は The Open Group が公開。版により価値の流れの構成が見直されている。',
      en: 'Published as a standard by The Open Group; the value stream structure has been reorganised between editions.',
    },
    keywords: ['it4it', 'it運用', 'itサービス', 'service management', 'value stream', '参照アーキテクチャ', 'reference architecture', 'open group', 'ツール統合', '情報源'],
    comparison: {
      granularity: { ja: 'IT 部門の業務とデータオブジェクト単位', en: 'IT function processes and their data objects' },
      artifacts: { ja: '価値の流れの定義、データオブジェクト一覧、ツール配置図', en: 'Value stream definitions, data object inventory and tool landscape' },
      learningCurve: { ja: '数週間。既存ツール構成の棚卸しが前提作業になる。', en: 'Weeks, and it presupposes an inventory of the existing tool estate' },
    },
  },
  {
    id: 'itil-4',
    name: { ja: 'ITIL 4', en: 'ITIL 4' },
    owner: { ja: 'PeopleCert(旧 AXELOS)', en: 'PeopleCert (formerly AXELOS)' },
    category: 'operations',
    summary: {
      ja: 'IT サービスの提供と運用を、価値の流れと実践(プラクティス)群として整理した体系。インシデント対応・変更管理・構成管理など、稼働後に必要になる仕組みを一通り備えている。',
      en: 'A body of practice organising IT service delivery and operation as a value system with a set of management practices. It covers what a system needs after go-live: incident handling, change control, configuration management and the rest.',
    },
    strengths: [
      { ja: '運用の受け入れ条件を具体的に書ける(監視・エスカレーション・変更手順)', en: 'Lets you write concrete operational acceptance criteria: monitoring, escalation, change procedure' },
      { ja: '用語が広く普及しており、運用委託先・ベンダーと話が通じる', en: 'The vocabulary is widespread, so outsourcers and vendors already speak it' },
      { ja: '4 版では手続き準拠より価値と流れを重視する立て付けになっている', en: 'The fourth edition is framed around value and flow rather than procedural compliance' },
    ],
    limits: [
      { ja: '設計・構築側の意思決定は扱わない。何を作るべきかは分からない。', en: 'It does not address build-side decisions; it will not tell you what to build.' },
      { ja: '手続きが重くなりがちで、デプロイ頻度の高い開発と衝突しやすい', en: 'Its procedures tend to accrete weight and collide with high-frequency deployment' },
      { ja: '認定コースが中心で、書籍だけで組織に浸透させるのは難しい', en: 'It is delivered largely through certification courses; books alone rarely change an organisation' },
    ],
    combineWithAdm: {
      ja: 'フェーズ F/G の実装ガバナンスと、H の変更管理で参照する。特に G の「運用への引き渡し条件」を実践に写像しておくと、稼働後に責任の空白が出ない。',
      en: 'Reference it for implementation governance in Phases F and G and for change management in Phase H. Mapping the Phase G hand-over criteria onto its practices is what prevents a responsibility vacuum after go-live.',
    },
    phaseIds: ['f', 'g', 'h'],
    availability: {
      ja: '書籍・研修・認定はいずれも有償。',
      en: 'Books, training and certification are all commercial.',
    },
    keywords: ['itil', 'itsm', '運用', 'operations', 'サービス管理', 'service management', 'インシデント', 'incident', '変更管理', 'change management', '保守'],
    comparison: {
      granularity: { ja: 'サービス単位の運用手続き', en: 'Operational procedures at the service level' },
      artifacts: { ja: 'サービスカタログ、手順書、SLA、構成情報', en: 'Service catalogue, runbooks, SLAs and configuration records' },
      learningCurve: { ja: '基礎は数日。組織への定着は年単位。', en: 'Days for the basics; years to embed in an organisation' },
    },
  },

  // -------------------------------------------------------------- governance
  {
    id: 'iso-42010',
    name: { ja: 'ISO/IEC/IEEE 42010(アーキテクチャ記述)', en: 'ISO/IEC/IEEE 42010 (Architecture Description)' },
    owner: { ja: 'ISO / IEC / IEEE', en: 'ISO / IEC / IEEE' },
    category: 'governance',
    summary: {
      ja: 'アーキテクチャ記述が満たすべき要件を定めた国際規格。ステークホルダー・関心事・ビューポイント・ビューの関係を規定し、「その図は誰のどの関心に答えるのか」を必ず言えるようにする。特定の記法は指定しない。',
      en: 'An international standard stating what an architecture description must satisfy. It fixes the chain from stakeholder to concern to viewpoint to view, forcing every diagram to name whose question it answers. It prescribes no notation.',
    },
    strengths: [
      { ja: '成果物レビューの合否基準として使える(関心事に紐づかない図は落とせる)', en: 'Works as a pass/fail criterion in reviews — a diagram tied to no concern can be rejected' },
      { ja: '記法に依存しないので、ArchiMate でも C4 でも同じ基準を当てられる', en: 'Notation-independent, so the same bar applies whether the team draws ArchiMate or C4' },
      { ja: '規格番号で示せるため、公共調達・監査系の文書で通りがよい', en: 'Being a numbered standard, it passes smoothly in public procurement and audit documents' },
    ],
    limits: [
      { ja: '何をどう描くかは教えてくれない。手順書ではない。', en: 'It does not tell you what to draw or how; it is not a procedure.' },
      { ja: '規格文書は読みにくく、そのまま現場に配っても使われない', en: 'The standard itself reads poorly; handing it to a delivery team achieves nothing' },
      { ja: '準拠すること自体には価値が無い。運用に載せなければただの紙。', en: 'Conformance in itself is worthless; unless it is operated it is just paper.' },
    ],
    combineWithAdm: {
      ja: '予備フェーズでアーキテクチャ記述の枠組み(誰の関心にどのビューで答えるか)を決める下敷きにし、A〜D の成果物レビュー観点として使う。',
      en: 'Use it in the Preliminary Phase as the basis for deciding which view answers whose concern, then as the review lens for the deliverables of Phases A–D.',
    },
    phaseIds: ['preliminary', 'a', 'b', 'c', 'd'],
    availability: {
      ja: '有償の国際規格。利用には購入が必要。',
      en: 'A paid international standard; use requires purchase.',
    },
    keywords: ['42010', 'iso', 'ieee', 'architecture description', 'アーキテクチャ記述', 'ビューポイント', 'viewpoint', 'view', 'ビュー', '関心事', 'concern', '規格', 'レビュー基準', 'アーキテクチャレビュー', 'architecture review'],
    comparison: {
      granularity: { ja: '記述の枠組みのみ。中身には踏み込まない。', en: 'The description framework only; never the content' },
      artifacts: { ja: 'ビューポイント定義と、それに準拠したビュー群', en: 'Viewpoint definitions and the conforming views' },
      learningCurve: { ja: '概念は 2 時間。規格文書の読解は別。', en: 'Two hours for the concepts; reading the standard is a separate exercise' },
    },
  },
  {
    id: 'cobit',
    name: { ja: 'COBIT', en: 'COBIT' },
    owner: { ja: 'ISACA', en: 'ISACA' },
    category: 'governance',
    summary: {
      ja: 'IT の統制と管理の目標を体系化した枠組み。何をどこまで統制すべきかを目標の一覧として示し、成熟度評価と監査に使える形にしてある。経営部門・監査部門との共通言語になる点が実務上の価値。',
      en: 'A framework organising the objectives of IT governance and management. It presents what must be controlled as an objective set, shaped for maturity assessment and audit. Its practical value is as shared language with the executive and audit functions.',
    },
    strengths: [
      { ja: '監査で要求される観点をそのまま満たしやすい', en: 'Maps cleanly onto what auditors ask for' },
      { ja: '成熟度評価により、投資の必要性を数値で示せる', en: 'Maturity assessment lets you argue for investment with numbers' },
      { ja: '経営層・監査法人が既に知っている枠組みなので説明コストが低い', en: 'Executives and external auditors already know it, so explanation cost is low' },
    ],
    limits: [
      { ja: '「何をすべきか」は示すが「どうやるか」は薄い', en: 'Strong on what should be in place, thin on how to get there' },
      { ja: '統制目標を全部適用すると事務作業が膨れ、開発速度を落とす', en: 'Applying every control objective inflates paperwork and slows delivery' },
      { ja: '現場からは監査のための作業に見えやすく、形骸化しやすい', en: 'To delivery teams it looks like work for the auditors, and it hollows out fast' },
    ],
    combineWithAdm: {
      ja: '予備フェーズでアーキテクチャガバナンスの枠組みを設計するときと、G/H で統制と例外承認の運用を定めるときに使う。ADM の準拠レビューを COBIT の目標に紐付けておくと、監査対応の二度手間が消える。',
      en: 'Use it when designing the governance framework in the Preliminary Phase and when defining control and exception handling in Phases G and H. Tying ADM compliance reviews to its objectives removes the duplicate work at audit time.',
    },
    phaseIds: ['preliminary', 'g', 'h'],
    availability: {
      ja: 'ISACA から提供。多くの資料は購入または会員登録が前提。',
      en: 'Provided by ISACA; most material requires purchase or membership.',
    },
    keywords: ['cobit', 'isaca', 'ガバナンス', 'governance', '統制', 'control', '監査', 'audit', '成熟度', 'maturity', 'コンプライアンス'],
    comparison: {
      granularity: { ja: '統制目標単位。実装手順は含まない。', en: 'Control objectives; no implementation steps' },
      artifacts: { ja: '統制目標の適用表、成熟度評価結果、監査証跡', en: 'Applicability matrices, maturity assessments and audit evidence' },
      learningCurve: { ja: '数週間。監査経験があれば早い。', en: 'Weeks, and much faster with an audit background' },
    },
  },
  {
    id: 'adr',
    name: { ja: 'ADR(アーキテクチャ決定記録)', en: 'ADR (Architecture Decision Records)' },
    owner: { ja: 'コミュニティ発の実践(特定の管理団体を持たない)', en: 'A community practice; no governing body' },
    category: 'governance',
    summary: {
      ja: '決定 1 件を 1 ファイルに、背景・検討した選択肢・決めたこと・受け入れる不利益という形で残す軽量な習慣。文書ではなく履歴を残すのが要点で、コードと同じリポジトリで版管理する。',
      en: 'A lightweight habit: one decision per file, recording the context, the options weighed, the choice, and the downsides accepted. The point is to keep a history rather than a document, versioned in the same repository as the code.',
    },
    strengths: [
      { ja: '数分で書ける。重い設計書と違い、運用が実際に続く。', en: 'Written in minutes, so unlike heavyweight design documents the practice actually survives' },
      { ja: '「なぜこうなっているのか」が数年後に読める。担当交代の被害を最小化できる。', en: 'The "why is it like this" is still readable years later, which blunts the cost of turnover' },
      { ja: 'プルリクエスト上で決定そのものをレビューできる', en: 'The decision itself can be reviewed in a pull request' },
    ],
    limits: [
      { ja: '全体像は分からない。決定の集合であって設計書ではない。', en: 'No big picture emerges; it is a set of decisions, not a design.' },
      { ja: '書く文化が無い組織では 3 件書いて止まる', en: 'In organisations without a writing habit it stops after three entries' },
      { ja: '粒度が揃わないと後から検索できず、記録として役に立たなくなる', en: 'Inconsistent granularity makes the archive unsearchable and therefore useless' },
    ],
    combineWithAdm: {
      ja: 'B〜D の設計判断と、G で出た逸脱の承認記録を ADR として残す。ADM 側の決定ログと二重管理にならないよう、正の記録をどちらに置くかを先に決めること。',
      en: 'Record the design choices of Phases B–D and the dispensations granted in Phase G as ADRs. Decide up front whether the ADR or the ADM decision log is the record of truth, or you will maintain both.',
    },
    phaseIds: ['b', 'c', 'd', 'g'],
    availability: {
      ja: 'テンプレートが複数、無償で公開されている。',
      en: 'Several templates are published free of charge.',
    },
    // 'log' 単独は監査ログ・アプリログに釣られるため 'decision log' に限定する
    keywords: ['adr', 'architecture decision record', '決定記録', '意思決定', 'decision', '記録', 'decision log', 'madr', '設計判断', '経緯'],
    comparison: {
      granularity: { ja: '決定 1 件ごと。大小の判断が混在しうる。', en: 'One decision at a time, large and small mixed together' },
      artifacts: { ja: '数十行の Markdown ファイル群', en: 'A directory of short Markdown files' },
      learningCurve: { ja: '10 分。テンプレートを配れば始まる。', en: 'Ten minutes; hand out a template and it starts' },
    },
  },
  {
    id: 'okr',
    name: { ja: 'OKR(目標と主要な結果)', en: 'OKR (Objectives and Key Results)' },
    owner: { ja: '特定の管理団体を持たない実践(半導体産業で生まれ、その後広く普及)', en: 'A practice with no governing body; originated in the semiconductor industry and spread widely' },
    category: 'governance',
    summary: {
      ja: '定性的な目標と、その達成を測る少数の数値指標を組にして、組織の重点を揃える手法。EA の文脈では、アーキテクチャ活動の成果を「文書を何本作ったか」ではなく事業側の数値で語るために使う。',
      en: 'A method that pairs a qualitative objective with a handful of numeric results to align where an organisation puts its attention. In an EA context its use is to express architecture outcomes in business numbers rather than document counts.',
    },
    strengths: [
      { ja: 'アーキテクチャ投資の成果を事業指標に結び付けられる', en: 'Connects architecture investment to business metrics' },
      { ja: '定期的な見直しがあるため、長期ロードマップの前提崩れに早く気付ける', en: 'The regular review cadence surfaces broken roadmap assumptions early' },
      { ja: '数を絞る強制力があり、「やらないこと」を決められる', en: 'The forced small count makes it possible to decide what will not be done' },
    ],
    limits: [
      { ja: '人事評価と直結させると、達成しやすい目標しか設定されなくなる', en: 'Tie it to performance appraisal and only easy objectives get set' },
      { ja: '数値化しにくい基盤整備・技術的負債の返済が軽視されやすい', en: 'Platform work and debt repayment, being hard to quantify, get deprioritised' },
      { ja: '設定作業に時間をかけすぎると、本来の作業が止まる', en: 'Over-invest in the setting exercise and the actual work stops' },
    ],
    combineWithAdm: {
      ja: 'フェーズ A で定めた目標・成功基準を OKR の形に落とし、E/F の作業パッケージと紐付ける。H では実際の数値をもとに、アーキテクチャ変更が効いたかを検証する。',
      en: 'Express the objectives and success criteria set in Phase A as OKRs and tie them to the work packages of Phases E and F. In Phase H, use the actual numbers to test whether the architecture change worked.',
    },
    phaseIds: ['a', 'e', 'f', 'h'],
    availability: {
      ja: '公開された実践で、無償の解説が豊富。管理ツールは有償のものが多い。',
      en: 'An open practice with abundant free material; the tooling around it is mostly commercial.',
    },
    keywords: ['okr', '目標管理', 'objectives', 'key results', 'kpi', '指標', 'metrics', '成果測定', '効果測定', 'アウトカム'],
    comparison: {
      granularity: { ja: '四半期程度の期間で、目標を数個', en: 'A handful of objectives over roughly a quarter' },
      artifacts: { ja: '目標と指標の一覧、進捗の記録', en: 'A list of objectives with measures, plus progress records' },
      learningCurve: { ja: '仕組みは 1 時間。運用の癖を抜くのに数四半期。', en: 'An hour for the mechanics; several quarters to break bad habits' },
    },
  },

  // ------------------------------------------------------------------ domain
  {
    id: 'dama-dmbok',
    name: { ja: 'DAMA-DMBOK(データマネジメント知識体系)', en: 'DAMA-DMBOK (Data Management Body of Knowledge)' },
    owner: { ja: 'DAMA International', en: 'DAMA International' },
    category: 'domain',
    summary: {
      ja: 'データガバナンスを中心に、データ品質・メタデータ・マスタデータ・データセキュリティなどの知識領域を体系化したもの。TOGAF のフェーズ C(データ)が枠だけを示すのに対し、実際に何をどう管理するかの中身を持つ。',
      en: 'A body of knowledge organising data management around governance, with knowledge areas for quality, metadata, master data, security and more. Where TOGAF Phase C gives the frame for data, this supplies the contents.',
    },
    strengths: [
      { ja: 'データ品質・メタデータなど、EA が手薄になりがちな運用側の論点を網羅している', en: 'Covers the operational topics EA usually neglects — data quality, metadata, lineage' },
      { ja: '役割(データオーナー・データスチュワード)の定義が具体的で、組織設計に落とせる', en: 'Role definitions such as data owner and steward are concrete enough to staff' },
      { ja: 'データ関連の用語が統一され、部門をまたぐ会話が噛み合う', en: 'Standardises data vocabulary so cross-department conversations converge' },
    ],
    limits: [
      { ja: '網羅的すぎて、全領域を同時に始めると必ず失敗する', en: 'So comprehensive that starting every knowledge area at once reliably fails' },
      { ja: '記法・図の標準は含まない。モデリングは別の道具が要る。', en: 'It contains no notation; modelling needs a separate tool.' },
      { ja: 'データ専任を置けない組織では、絵に描いた餅で終わる', en: 'Without dedicated data roles it stays theoretical' },
    ],
    combineWithAdm: {
      ja: 'フェーズ C(データアーキテクチャ)の詳細化と、G のガバナンス設計で参照する。特にデータオーナーシップの決め方は ADM 側の記述が薄いので、補完価値が高い。',
      en: 'Reference it when detailing the data architecture in Phase C and when designing governance in Phase G. Data ownership in particular is thin in the ADM, so the complement is worth a lot.',
    },
    phaseIds: ['c', 'g'],
    availability: {
      ja: '書籍として販売。各国の支部が普及活動を行っている。',
      en: 'Sold as a book; national chapters promote it.',
    },
    keywords: ['dmbok', 'dama', 'データ', 'data', 'データマネジメント', 'data management', 'データガバナンス', 'data governance', 'マスタ', 'マスタデータ', 'master data', 'メタデータ', 'metadata', 'データ品質', 'data quality', 'データオーナー', 'data owner'],
    comparison: {
      granularity: { ja: 'データ管理の知識領域単位。個別のテーブル設計は対象外。', en: 'Knowledge areas of data management; individual table design is out of scope' },
      artifacts: { ja: 'データガバナンス方針、用語辞書、品質指標、役割定義', en: 'Governance policy, business glossary, quality measures and role definitions' },
      learningCurve: { ja: '全体像は数週間。1 領域ずつ着手するのが現実的。', en: 'Weeks for the whole picture; realistically you start one area at a time' },
    },
  },
  {
    id: 'nist-csf',
    name: { ja: 'NIST サイバーセキュリティフレームワーク (CSF)', en: 'NIST Cybersecurity Framework (CSF)' },
    owner: { ja: 'NIST(米国国立標準技術研究所)', en: 'NIST (US National Institute of Standards and Technology)' },
    category: 'domain',
    summary: {
      ja: 'セキュリティの取り組みを少数の機能に分類し、現状と目標のプロファイルを比べて差分を出す枠組み。技術対策の一覧ではなく、経営が理解できる粒度で守りの状況を語るための道具。',
      en: 'A framework that sorts security activity into a small set of functions and compares a current profile against a target one to expose the gap. It is not a control list; it is a way to talk about defensive posture at a level executives can follow.',
    },
    strengths: [
      { ja: '現状プロファイルと目標プロファイルの差分という形が、ADM のギャップ分析とそのまま重なる', en: 'The current-versus-target profile shape maps one-to-one onto ADM gap analysis' },
      { ja: '機能の数が少ないため、経営報告の 1 スライドに載る', en: 'The small number of functions fits on one executive slide' },
      { ja: '無償で入手でき、他の規格・基準との対応表も整備されている', en: 'Free to obtain, with published crosswalks to other standards' },
    ],
    limits: [
      { ja: '具体的な実装方法は示さない。製品選定の答えは出ない。', en: 'It prescribes no implementation and will not choose products for you.' },
      { ja: '業種固有の規制要件は別途参照が必要', en: 'Sector-specific regulatory requirements must be sourced separately' },
      { ja: '自己評価に依存するため、点数だけが独り歩きしやすい', en: 'It relies on self-assessment, so the score tends to travel without its context' },
    ],
    combineWithAdm: {
      ja: 'セキュリティは B〜D の全層に横串で入るため、各層の目標像を描く際の観点リストとして使う。G では要件の遵守確認の枠組みとして使える。',
      en: 'Security cuts across Phases B–D, so use it as the checklist of concerns when describing each layer\'s target, and in Phase G as the frame for verifying compliance.',
    },
    phaseIds: ['b', 'c', 'd', 'g'],
    availability: {
      ja: '米国政府の成果物として無償公開。改訂により機能の構成が見直されている。',
      en: 'Published free of charge as a US government work; the function set has been revised between versions.',
    },
    // 'リスク' / 'risk' 単独だとプロジェクトリスクの相談まで釣ってしまうので、セキュリティ文脈に限定する
    keywords: ['nist', 'csf', 'セキュリティ', 'security', 'サイバー', 'サイバーセキュリティ', 'cybersecurity', 'セキュリティリスク', 'security risk', 'プロファイル', '脅威', '攻撃', 'インシデント対応'],
    comparison: {
      granularity: { ja: '組織全体のセキュリティ態勢。個別製品設定は対象外。', en: 'Organisation-wide security posture; product configuration is out of scope' },
      artifacts: { ja: '現状/目標プロファイルと、その差分の実行計画', en: 'Current and target profiles plus the action plan for the gap' },
      learningCurve: { ja: '構造は 1 日。評価の実施には専門知識が要る。', en: 'A day for the structure; assessing against it needs specialist knowledge' },
    },
  },
  {
    id: 'cloud-well-architected',
    name: {
      ja: 'クラウドの Well-Architected 系フレームワーク(AWS / Microsoft Azure / Google Cloud)',
      en: 'Cloud Well-Architected frameworks (AWS / Microsoft Azure / Google Cloud)',
    },
    owner: {
      ja: '各クラウド事業者(Amazon Web Services / Microsoft / Google)',
      en: 'The respective cloud providers (Amazon Web Services, Microsoft, Google)',
    },
    category: 'domain',
    summary: {
      ja: 'クラウド上の設計を、信頼性・セキュリティ・コスト・性能・運用といった柱ごとにレビューするチェック体系。各社が自社サービス前提で公開しており、設問に答える形で弱点を洗い出す。',
      en: 'Review checklists that assess a cloud design pillar by pillar — reliability, security, cost, performance, operations. Each provider publishes its own, assuming its own services, and surfaces weaknesses through a questionnaire.',
    },
    strengths: [
      { ja: '設問形式なので、レビュー会をその日から始められる', en: 'Question-based, so a review session can start the same day' },
      { ja: 'コストと信頼性のトレードオフを明示的に議論させる作りになっている', en: 'Structured to force the cost-versus-reliability trade-off into the open' },
      { ja: '各社のツールで実環境を自動診断でき、机上の評価に留まらない', en: 'Provider tooling can scan the live environment, so the assessment is not purely on paper' },
    ],
    limits: [
      { ja: '前提が自社クラウドなので、マルチクラウドやオンプレ併存の判断は出ない', en: 'Each assumes its own cloud, so multi-cloud and hybrid trade-offs get no answer' },
      { ja: '自社サービスの採用を促す記述に寄りやすい', en: 'The guidance leans toward adopting the provider\'s own services' },
      { ja: '単一システムの設計レビュー用。ポートフォリオ全体の話はできない。', en: 'Scoped to reviewing one system; it cannot discuss the portfolio.' },
    ],
    combineWithAdm: {
      ja: 'フェーズ D のテクノロジーアーキテクチャの妥当性確認と、F/G の個別システム設計レビュー基準として使う。E で作業パッケージを見積もる際にコストの柱を参照すると精度が上がる。',
      en: 'Use it to sanity-check the technology architecture in Phase D and as the review standard for individual system designs in Phases F and G. Consulting the cost pillar while sizing Phase E work packages improves the estimates.',
    },
    phaseIds: ['d', 'e', 'f', 'g'],
    availability: {
      ja: '各社が無償でオンライン公開。サービス更新に合わせて内容が頻繁に変わる。',
      en: 'Published online free of charge by each provider and revised frequently as services change.',
    },
    // 'review' 単独はコードレビュー等に釣られるため 'design review' に限定する
    keywords: ['well-architected', 'クラウド', 'cloud', 'aws', 'azure', 'google cloud', 'gcp', '設計レビュー', 'design review', 'コスト最適化', '信頼性', 'reliability', '非機能'],
    comparison: {
      granularity: { ja: 'システム 1 つの設計。構成レベルの具体性がある。', en: 'One system design, specific down to configuration level' },
      artifacts: { ja: 'レビュー結果と是正項目の一覧', en: 'A review result with a list of remediation items' },
      learningCurve: { ja: '設問に答えるだけなら即日。判断には設計経験が要る。', en: 'Same-day if you just answer the questions; judging the answers needs design experience' },
    },
  },
];

/**
 * 甲乙付けがたいときの優先順(実務で出番が多い順・編集判断)。
 * FRAMEWORKS の並びは分類ごとの掲載順なので、推薦の同点処理にはこちらを使う。
 * ここに無い ID は最後尾に回る。
 */
export const RECOMMEND_PRIORITY: string[] = [
  'archimate',
  'c4-model',
  'bpmn',
  'ddd',
  'bizbok',
  'adr',
  'wardley-mapping',
  'itil-4',
  'dama-dmbok',
  'cloud-well-architected',
  'nist-csf',
  'safe',
  'team-topologies',
  'business-model-canvas',
  'iso-42010',
  'cobit',
  'okr',
  'dmn',
  'uml',
  'it4it',
  'zachman',
  '4plus1-views',
];

/** 優先順の位置(未登録は最後尾) / Position in the tie-break order; unlisted ids go last. */
export function recommendRank(id: string): number {
  const i = RECOMMEND_PRIORITY.indexOf(id);
  return i < 0 ? RECOMMEND_PRIORITY.length : i;
}

/** 正規化(比較用): 記号・空白を落として小文字化 */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_/()（）]/g, '').replace(/-/g, '');
}

/**
 * ID・名称・キーワードのいずれかで 1 件引く。
 * Look up one framework by id, name (either language), or keyword.
 */
export function findFramework(nameOrId: string): Framework | undefined {
  const raw = nameOrId.trim().toLowerCase();
  if (raw.length === 0) return undefined;
  const key = normalize(nameOrId);

  const byId = FRAMEWORKS.find((f) => f.id.toLowerCase() === raw || normalize(f.id) === key);
  if (byId) return byId;

  const byName = FRAMEWORKS.find(
    (f) => normalize(f.name.ja) === key || normalize(f.name.en) === key,
  );
  if (byName) return byName;

  const byKeyword = FRAMEWORKS.find((f) => f.keywords.some((k) => normalize(k) === key));
  if (byKeyword) return byKeyword;

  // 前方一致・部分一致は最後の手段(短すぎる入力では引かない)
  if (key.length < 3) return undefined;
  return FRAMEWORKS.find(
    (f) =>
      normalize(f.name.ja).includes(key) ||
      normalize(f.name.en).includes(key) ||
      f.keywords.some((k) => normalize(k).includes(key)),
  );
}

/** 指定 ADM フェーズで併用が効くものを返す / Frameworks worth pairing with a given ADM phase. */
export function frameworksForPhase(phaseId: string): Framework[] {
  const key = phaseId.trim().toLowerCase();
  return FRAMEWORKS.filter((f) => f.phaseIds.includes(key));
}

/** 分類で絞り込む / Filter by category. */
export function frameworksByCategory(category: FrameworkCategory): Framework[] {
  return FRAMEWORKS.filter((f) => f.category === category);
}
