/**
 * ArchiMate 知識ベース / ArchiMate knowledge base.
 *
 * TOGAF が「進め方(手法)」を与えるのに対し、ArchiMate は「描き方(言語)」を与える。
 * 実務ではこの 2 つを併用するが、対応関係が分からないまま挫折する例が非常に多い。
 * 本ファイルはその橋渡しを目的に、
 *   - 層 / 要素 / 関係の「名称と構造(事実)」
 *   - それをどう使い、どこで事故るかという「独自の実務解説」
 *   - ADM フェーズごとに何を描けばよいかの対応表
 * を持つ。仕様書の定義文は転載せず、解説はすべて独自の言葉で書いている。
 *
 * This file bridges TOGAF (the method) and ArchiMate (the notation). It carries the
 * factual structure — layer, element, and relationship names — plus original,
 * practice-oriented commentary. No specification text is reproduced.
 */

import type { Bilingual } from './types.js';

/** 層の ID / Layer identifier. */
export type ArchiMateLayerId =
  | 'strategy'
  | 'business'
  | 'application'
  | 'technology'
  | 'physical'
  | 'motivation'
  | 'implementation';

/** 層 / A layer (or aspect) of the notation. */
export interface ArchiMateLayer {
  id: ArchiMateLayerId;
  name: Bilingual;
  /** この層で何を表すのか(独自の説明) */
  purpose: Bilingual;
  /** この層を描くときの実務的な勘所 */
  tips: Bilingual[];
  /**
   * この層を主に描く ADM フェーズ。
   * TOGAF_ARCHIMATE_MAPPING の該当フェーズが必ずこの層を含むように保つこと
   * (片方だけに載っていると、ツールの出力が互いに矛盾する)。
   */
  phaseIds: string[];
  keywords: string[];
}

/** 要素 / A modelling element. */
export interface ArchiMateElement {
  /** 安定 ID(kebab-case。例: 'business-actor') */
  id: string;
  /** 要素名(事実) */
  name: Bilingual;
  layer: ArchiMateLayerId;
  /** 何を表す要素か(独自の説明。1〜2 文) */
  meaning: Bilingual;
  /** 実務でどう使うか / どこで間違えるか */
  usage: Bilingual;
  /** 混同されやすい要素との違い */
  confusedWith?: Bilingual;
  keywords: string[];
}

/** 関係 / A relationship type. */
export interface ArchiMateRelationship {
  id: string;
  name: Bilingual;
  /** 何を意味する関係か(独自の説明) */
  meaning: Bilingual;
  /** 使いどころと間違えやすい点 */
  usage: Bilingual;
  /** 結びつきの強さによる分類(構造的 > 依存 > 動的 > その他) */
  category: 'structural' | 'dependency' | 'dynamic' | 'other';
  keywords: string[];
}

/** ADM フェーズと ArchiMate の対応 / Phase-to-notation mapping. */
export interface TogafArchiMateMapping {
  /** 実在する ADM フェーズ ID */
  phaseId: string;
  /** そのフェーズで主に描く層 */
  layers: ArchiMateLayerId[];
  /** そのフェーズで主に使う要素 ID */
  elementIds: string[];
  /** そのフェーズの成果物を ArchiMate でどう表現するか */
  guidance: Bilingual;
}

/** 層 ID の一覧(表示順) / Layer ids in display order. */
export const ARCHIMATE_LAYER_IDS: ArchiMateLayerId[] = [
  'strategy',
  'business',
  'application',
  'technology',
  'physical',
  'motivation',
  'implementation',
];

// ---------------------------------------------------------------------------
// 層 / Layers
// ---------------------------------------------------------------------------

export const ARCHIMATE_LAYERS: ArchiMateLayer[] = [
  {
    id: 'strategy',
    name: { ja: '戦略層', en: 'Strategy Layer' },
    purpose: {
      ja: '「組織として何ができるか」「何に賭けるか」を、組織図にも製品にも依存しない粒度で表す層。経営の言葉とアーキテクチャの言葉が最初に接続する場所。',
      en: 'Expresses what the organization is able to do and what it is betting on, at a granularity independent of org charts and products. This is where executive language first touches architecture language.',
    },
    tips: [
      { ja: '要素数は 10〜30 に抑える。ここが 100 個になった時点で経営層は読むのをやめる。', en: 'Keep it to 10–30 elements. Past a hundred, executives stop reading.' },
      { ja: '部署名を書かない。ケイパビリティは組織再編で消えない粒度で名付ける。', en: 'Never name a department. Name capabilities so they survive the next reorg.' },
      { ja: '各ケイパビリティに現状評価(色分け)を付けると、そのまま投資判断の材料になる。', en: 'Heat-map each capability; the same picture then doubles as the investment argument.' },
      { ja: '戦略層は必ず動機層(目標・ドライバ)と繋ぐ。繋がない戦略層はただの用語集。', en: 'Always wire the strategy layer to motivation (drivers and goals). Unwired, it is just a glossary.' },
    ],
    phaseIds: ['preliminary', 'a', 'b'],
    keywords: ['strategy', '戦略', 'capability', 'ケイパビリティ', 'value stream', 'バリューストリーム', 'resource', 'リソース'],
  },
  {
    id: 'business',
    name: { ja: 'ビジネス層', en: 'Business Layer' },
    purpose: {
      ja: '誰が、どんな手順で、どんなサービスを外部に提供しているかを表す層。IT を一切外しても成立する内容だけを書くのが原則。',
      en: 'Who does what, in what sequence, to deliver which services to the outside. The rule of thumb: it must still make sense with all IT removed.',
    },
    tips: [
      { ja: '「システム名」が出てきたらビジネス層ではない。アプリケーション層に移す。', en: 'The moment a system name appears, you have left the business layer. Move it to application.' },
      { ja: '外部から見える単位はビジネスサービス、内部の手順はビジネスプロセスに分ける。', en: 'What outsiders can see is a business service; the internal sequence is a business process.' },
      { ja: 'アクター(人・組織)とロール(役割)を分けると、組織再編で図を作り直さずに済む。', en: 'Separating actors from roles means a reorg does not force a redraw.' },
      { ja: '最初から全業務を描かない。ステークホルダーの関心事に触れる業務だけ描く。', en: 'Do not model every process. Model only the ones a stakeholder concern touches.' },
    ],
    phaseIds: ['b'],
    keywords: ['business', 'ビジネス', '業務', 'process', 'プロセス', 'actor', 'アクター', 'service', 'サービス'],
  },
  {
    id: 'application',
    name: { ja: 'アプリケーション層', en: 'Application Layer' },
    purpose: {
      ja: 'ソフトウェアの塊と、それが業務に提供している機能・データを表す層。「どの業務がどのシステムに支えられているか」を答えるための層。',
      en: 'The software blocks, plus the functions and data they offer to the business. This is the layer that answers which system supports which business activity.',
    },
    tips: [
      { ja: 'コンポーネントの粒度は「調達・保守の単位」で切る。クラス図の粒度に落ちると保守不能になる。', en: 'Size components by what you procure and maintain. Drop to class-diagram granularity and the model dies of maintenance.' },
      { ja: '業務との接続は必ずアプリケーションサービス経由で描く。コンポーネントから業務プロセスへ直に線を引かない。', en: 'Connect to the business through application services. Do not wire a component straight onto a business process.' },
      { ja: 'インターフェース(API)を明示すると、そのまま統合方式の議論に使える。', en: 'Make interfaces (APIs) explicit and the same diagram carries the integration discussion.' },
      { ja: 'データオブジェクトは「誰が作り、誰が読むか」まで描いて初めて価値が出る。', en: 'A data object earns its place only once you show who creates it and who reads it.' },
    ],
    phaseIds: ['c'],
    keywords: ['application', 'アプリケーション', 'システム', 'component', 'コンポーネント', 'api', 'data', 'データ'],
  },
  {
    id: 'technology',
    name: { ja: 'テクノロジー層', en: 'Technology Layer' },
    purpose: {
      ja: 'アプリケーションを動かす計算資源・ミドルウェア・ネットワークを表す層。可用性・性能・移行の議論はここに紐づく。',
      en: 'The compute, middleware, and network that keep applications running. Availability, performance, and migration arguments all anchor here.',
    },
    tips: [
      { ja: 'クラウド前提なら物理サーバではなくサービス単位(マネージドサービス)をノードとして扱うほうが現実に合う。', en: 'On cloud, treating managed services as nodes fits reality better than drawing physical servers.' },
      { ja: '本番構成をそのまま写経しない。図は構成管理 DB の代わりにはならない。', en: 'Do not transcribe production. A model is not a replacement for a CMDB.' },
      { ja: 'テクノロジーサービスを定義しておくと、アプリ層を書き換えずに基盤だけ差し替える議論ができる。', en: 'Defining technology services lets you swap the platform in discussion without rewriting the application layer.' },
      { ja: '通信経路は「経路(Path)」と「ネットワーク(Communication Network)」を使い分ける。', en: 'Distinguish the logical path from the physical communication network.' },
    ],
    phaseIds: ['d'],
    keywords: ['technology', 'テクノロジー', '基盤', 'infrastructure', 'node', 'ノード', 'network', 'ネットワーク'],
  },
  {
    id: 'physical',
    name: { ja: '物理層', en: 'Physical Layer' },
    purpose: {
      ja: '工場設備・拠点・物流網・材料といった、現実世界の「モノ」を表す層。製造業・物流・エネルギー・医療のように IT だけでは全体像にならない領域で効く。',
      en: 'Real-world things: plant equipment, sites, logistics networks, materials. It earns its keep in manufacturing, logistics, energy, and healthcare, where IT alone never shows the whole picture.',
    },
    tips: [
      { ja: 'IT 中心の案件では丸ごと省いてよい。無理に使うと図が重くなるだけ。', en: 'Skip it entirely on IT-centric engagements; forcing it in only adds weight.' },
      { ja: 'OT/IoT 案件では設備をノードと繋ぎ、「どの設備がどのシステムに繋がるか」を一枚で示せる。', en: 'On OT/IoT work, linking equipment to nodes shows in one page which machine talks to which system.' },
      { ja: '設備は保全計画・更新周期の情報を属性として持たせると、移行計画の根拠になる。', en: 'Tag equipment with maintenance and refresh cycles; that becomes the evidence for the migration plan.' },
    ],
    phaseIds: ['d'],
    keywords: ['physical', '物理', '設備', 'equipment', 'facility', '拠点', 'material', '物流', 'ot', 'iot'],
  },
  {
    id: 'motivation',
    name: { ja: '動機層', en: 'Motivation Layer' },
    purpose: {
      ja: '「なぜそれをやるのか」を表す層。ステークホルダー、外圧、評価、目標、原則、要件を繋ぎ、設計判断の根拠を追跡可能にする。',
      en: 'The why. It links stakeholders, external pressures, assessments, goals, principles, and requirements so that every design decision has a traceable reason.',
    },
    tips: [
      { ja: 'この層こそが「なぜこの設計なのか」への唯一の回答になる。時間がないときも動機層だけは描く。', en: 'This is the only place that answers "why this design". If you can draw one layer, draw this one.' },
      { ja: 'ドライバ → 評価 → 目標 → 成果 → 要件、の順で書くと自然に筋が通る。', en: 'Driver → assessment → goal → outcome → requirement reads as a coherent chain almost by itself.' },
      { ja: '目標には必ず測定単位を付ける。「効率化する」は目標ではなくただの願望。', en: 'Every goal needs a unit of measure. "Become more efficient" is a wish, not a goal.' },
      { ja: '実装要素から要件へ実現関係を張る(向きは具体 → 抽象)。これで「この機能は誰が求めたのか」に即答できる。', en: 'Draw realization from the implementing element up to the requirement — concrete to abstract. That is what lets you answer "who asked for this feature" instantly.' },
    ],
    phaseIds: ['preliminary', 'a', 'b', 'requirements-management'],
    keywords: ['motivation', '動機', '目標', 'goal', 'driver', 'ドライバ', 'requirement', '要件', 'principle', '原則'],
  },
  {
    id: 'implementation',
    name: { ja: '実装・移行層', en: 'Implementation & Migration Layer' },
    purpose: {
      ja: '目標像へ至る道筋を表す層。作業パッケージ、成果物、中間状態(プラトー)、ギャップを使い、アーキテクチャを計画に変換する。',
      en: 'The route to the target. Work packages, deliverables, intermediate states (plateaus), and gaps turn architecture into a plan.',
    },
    tips: [
      { ja: 'プラトーを 2〜4 個に絞る。中間状態が 8 個ある計画は誰も守らない。', en: 'Keep plateaus to two to four. Nobody follows a plan with eight intermediate states.' },
      { ja: '各プラトーは「その時点で実際に動いている姿」で描く。工程名ではなく状態名を付ける。', en: 'Draw each plateau as what is actually running at that moment. Name states, not project phases.' },
      { ja: 'ギャップ要素を明示すると、ロードマップの各項目に発生理由が付く。', en: 'Explicit gap elements give every roadmap item a reason for existing.' },
      { ja: '作業パッケージは予算・オーナー・期間を持てる粒度にする。持てないなら大きすぎるか小さすぎる。', en: 'Size work packages so they can carry a budget, an owner, and a duration. If they cannot, they are the wrong size.' },
    ],
    phaseIds: ['e', 'f', 'g'],
    keywords: ['implementation', 'migration', '実装', '移行', 'roadmap', 'ロードマップ', 'plateau', 'プラトー', 'gap', 'ギャップ'],
  },
];

// ---------------------------------------------------------------------------
// 要素 / Elements
// ---------------------------------------------------------------------------

export const ARCHIMATE_ELEMENTS: ArchiMateElement[] = [
  // --- Strategy ---------------------------------------------------------
  {
    id: 'resource',
    name: { ja: 'リソース', en: 'Resource' },
    layer: 'strategy',
    meaning: {
      ja: 'ケイパビリティを支える「手持ちの持ち物」。要員、技能、資金、設備、データ、ブランドのように、棚卸しして数え上げられるもの。',
      en: 'The stock a capability draws on — people, skills, money, kit, data, brand. If you could put it on an inventory and count it, it belongs here.',
    },
    usage: {
      ja: 'ケイパビリティの裏付けとして使う。「この能力が弱い」の原因が人なのか設備なのかデータなのかを切り分けたいときに効く。',
      en: 'Use it to back a capability. It is what separates "we are weak here because of people" from "…because of equipment" or "…because of data".',
    },
    confusedWith: {
      ja: 'ケイパビリティは「できること」、リソースは「持っているもの」。人月やライセンス数で数えられるならリソース側。',
      en: 'A capability is what you can do; a resource is what you hold. If you can count it in headcount or licences, it is a resource.',
    },
    keywords: ['resource', 'リソース', '資産', '要員', 'asset'],
  },
  {
    id: 'capability',
    name: { ja: 'ケイパビリティ', en: 'Capability' },
    layer: 'strategy',
    meaning: {
      ja: '組織が発揮できる能力を、実現手段(組織・システム・手順)から切り離して名付けたもの。「与信審査ができる」のように名詞で表す。',
      en: 'What the organization is able to do, named independently of how it is done. Expressed as a noun: "credit assessment", not "run the credit team".',
    },
    usage: {
      ja: 'ケイパビリティマップの単位。現状評価を色で塗り、投資対象を決める。手段が変わっても名前が変わらないのが良いケイパビリティ。',
      en: 'The unit of a capability map. Heat-map the current state, then choose where to invest. A good capability keeps its name when the means change.',
    },
    confusedWith: {
      ja: 'ビジネス機能との混同が最多。ケイパビリティは「できる/できない」を経営が語る単位で、実行主体を含まない。ビジネス機能は組織内部の仕事のまとまりで、担い手(アクター/ロール)が割り当たる。同じ名前が両方に現れたら、経営会議で使う側だけをケイパビリティにする。',
      en: 'The most common mix-up is with business function. A capability is what executives argue about in terms of have/have-not, and carries no performer. A business function is a bundle of internal work with an actor or role assigned to it. If the same name appears in both, keep only the boardroom one as a capability.',
    },
    keywords: ['capability', 'ケイパビリティ', '能力', 'capability map', 'ケイパビリティマップ'],
  },
  {
    id: 'course-of-action',
    name: { ja: '行動方針', en: 'Course of Action' },
    layer: 'strategy',
    meaning: {
      ja: '目標に到達するために組織が選ぶ打ち手の方向性。「内製に切り替える」「共通基盤に集約する」といった選択そのもの。',
      en: 'The direction of play chosen to reach a goal — "bring it in-house", "consolidate onto a shared platform". The choice itself.',
    },
    usage: {
      ja: '戦略と実行計画の間の踊り場として使う。複数案を並べ、どのケイパビリティを強化する案なのかを線で示すと比較しやすい。',
      en: 'Use it as the landing between strategy and plan. Lay out alternatives and draw which capability each one strengthens; comparison becomes obvious.',
    },
    confusedWith: {
      ja: '作業パッケージと混同しやすい。行動方針は「どちらへ進むか」という方針で、予算も期間も持たない。予算とオーナーが付いた瞬間に作業パッケージ。',
      en: 'Often confused with a work package. A course of action is a direction with no budget and no dates. The moment it acquires a budget and an owner, it is a work package.',
    },
    keywords: ['course of action', '行動方針', '打ち手', '戦略オプション', 'strategy option'],
  },
  {
    id: 'value-stream',
    name: { ja: 'バリューストリーム', en: 'Value Stream' },
    layer: 'strategy',
    meaning: {
      ja: '価値が生まれてから受け手に届くまでの一連の段階。受け手(顧客・社員)の視点で、始点と終点を明確にして描く。',
      en: 'The end-to-end stages by which value reaches a recipient. Drawn from the recipient\'s point of view, with an explicit start and finish.',
    },
    usage: {
      ja: '段階ごとに必要なケイパビリティを対応付け、どこが詰まっているかを可視化する。部門横断の議論を始める最短の道具。',
      en: 'Map the capabilities each stage needs and the bottleneck becomes visible. The fastest way to open a cross-departmental conversation.',
    },
    confusedWith: {
      ja: 'ビジネスプロセスと混同されやすい。バリューストリームは価値の受け手から見た 5〜8 段階の粗い流れで、分岐や例外を書かない。ビジネスプロセスは実際の手順で、分岐も担当者も持つ。段階の中に「承認待ち」が出てきたらそれはもうプロセス。',
      en: 'Frequently confused with a business process. A value stream is five to eight coarse stages seen by the recipient, with no branches and no exceptions. A business process is the actual procedure, with branches and performers. Once "waiting for approval" appears as a stage, you are in process territory.',
    },
    keywords: ['value stream', 'バリューストリーム', '価値の流れ', 'end to end', '価値提供'],
  },

  // --- Business ---------------------------------------------------------
  {
    id: 'business-actor',
    name: { ja: 'ビジネスアクター', en: 'Business Actor' },
    layer: 'business',
    meaning: {
      ja: '実在する主体。人、部署、法人、取引先など、名簿に載る側のもの。',
      en: 'A real entity: a person, a department, a legal body, a trading partner — whatever appears on a roster.',
    },
    usage: {
      ja: '「誰が」を答える要素。社内の組織単位を並べる場合はここに置き、業務との接続はロール経由にすると組織変更に強くなる。',
      en: 'Answers "who". Put org units here, but connect them to work through roles; the model then survives reorganizations.',
    },
    confusedWith: {
      ja: 'ロールとの混同が最多。「山田さん」「経理部」はアクター、「承認者」「申請者」はロール。1 人が複数ロールを担い、1 ロールを複数人が担うため、直結すると人事異動のたびに図を直すことになる。',
      en: 'Most often confused with role. "Ms. Yamada" and "Finance" are actors; "approver" and "requester" are roles. One actor plays many roles and one role is played by many actors, so wiring them directly means redrawing after every staff change.',
    },
    keywords: ['business actor', 'ビジネスアクター', 'アクター', '組織', '担当者', 'who'],
  },
  {
    id: 'business-role',
    name: { ja: 'ビジネスロール', en: 'Business Role' },
    layer: 'business',
    meaning: {
      ja: '業務上の役割。誰が担うかとは独立に、「何をする責任を持つか」で定義される。',
      en: 'A responsibility in the business, defined by what it is accountable for rather than by who fills it.',
    },
    usage: {
      ja: 'プロセスや機能に割り当てる相手はロールにする。権限設計・職務分掌・アクセス制御の議論にそのまま繋がる。',
      en: 'Assign roles — not actors — to processes and functions. It plugs straight into authorization design, segregation of duties, and access control.',
    },
    confusedWith: {
      ja: 'アクターとの違いは上記。またロールとビジネス機能も混ざりやすい。ロールは「責任の所在」、機能は「仕事のまとまり」。',
      en: 'See business actor for the actor/role split. Role and business function also blur: a role is where accountability sits, a function is a bundle of work.',
    },
    keywords: ['business role', 'ビジネスロール', 'ロール', '役割', '責任', 'responsibility'],
  },
  {
    id: 'business-collaboration',
    name: { ja: 'ビジネスコラボレーション', en: 'Business Collaboration' },
    layer: 'business',
    meaning: {
      ja: '複数のロールやアクターが束になって初めて成立する主体。委員会、共同事業体、部門横断チームなど。',
      en: 'A standing constellation of two or more roles or actors that only exists as a group: a committee, a joint venture, a cross-functional team.',
    },
    usage: {
      ja: '「この判断は 1 部署では下せない」構造を明示するのに使う。承認が滞る原因の可視化に強い。',
      en: 'Use it to make visible that a decision cannot be made by one unit alone — a strong lens on why approvals stall.',
    },
    confusedWith: {
      ja: 'インタラクションと対で覚える。コラボレーションは「集まった主体(名詞)」、インタラクションは「その集まりが行う振る舞い(動詞)」。',
      en: 'Learn it paired with interaction: the collaboration is the assembled subject (a noun); the interaction is the behaviour that assembly performs (a verb).',
    },
    keywords: ['business collaboration', 'コラボレーション', '協働', '委員会', '合議'],
  },
  {
    id: 'business-interface',
    name: { ja: 'ビジネスインターフェース', en: 'Business Interface' },
    layer: 'business',
    meaning: {
      ja: '外部からサービスに触れる接点。窓口、コールセンター、店舗、Web フォームなどチャネルを表す。',
      en: 'The point of contact through which a service is reached: counter, call centre, store, web form. In short, the channel.',
    },
    usage: {
      ja: '同じサービスを複数チャネルで提供している状態を可視化する。チャネル統合やオムニチャネル議論の土台になる。',
      en: 'Shows one service delivered through several channels — the base for channel consolidation and omni-channel debates.',
    },
    confusedWith: {
      ja: 'サービスとの違いが要注意。サービスは「何を提供するか」、インターフェースは「どこで受け取れるか」。窓口を閉じてもサービスは残る。',
      en: 'Careful with service: the service is what is offered, the interface is where you can get it. Close the counter and the service still exists.',
    },
    keywords: ['business interface', 'インターフェース', 'チャネル', '窓口', 'channel'],
  },
  {
    id: 'business-process',
    name: { ja: 'ビジネスプロセス', en: 'Business Process' },
    layer: 'business',
    meaning: {
      ja: '「何をきっかけに始まり、どうなったら終わりか」を言い切れる一連の業務。並べ替えると意味が壊れる、つまり順序そのものが情報になっているのが特徴。',
      en: 'Work you can describe as "it begins when X happens and it is done when Y is true". Reorder the steps and the meaning breaks — that dependence on order is what makes it a process.',
    },
    usage: {
      ja: '「どういう順番で仕事が流れるか」を示す。ArchiMate では細部を描かず、詳細手順は BPMN 等に委ねて相互参照するのが現実的。',
      en: 'Shows the order of work. In practice keep it coarse in ArchiMate and cross-reference BPMN for the detailed procedure.',
    },
    confusedWith: {
      ja: 'ビジネス機能との混同がこの層で最大の事故。プロセスは「時間軸に沿った流れ」で、始点・終点・順序がある。機能は「似た仕事のまとまり」で、順序を持たない。判定法: 名前に順序が要るか。「受注する→与信する→出荷する」はプロセス、「与信管理」は機能。組織図に近ければ機能、業務フロー図に近ければプロセス。',
      en: 'Function versus process is the biggest accident in this layer. A process runs along a timeline with a start, an end, and an order. A function is a grouping of similar work with no order. Test: does the name need a sequence? "Take order → assess credit → ship" is a process; "credit management" is a function. Closer to the org chart means function; closer to the flow chart means process.',
    },
    keywords: ['business process', 'ビジネスプロセス', 'プロセス', '業務フロー', 'workflow', '手順'],
  },
  {
    id: 'business-function',
    name: { ja: 'ビジネス機能', en: 'Business Function' },
    layer: 'business',
    meaning: {
      ja: '「同じ人たち・同じ道具でこなせる仕事」をひとまとめにした単位。並べ替えても意味が壊れない、つまり順序を持たないのが特徴。',
      en: 'Work bundled by "the same people with the same tools could do all of this". Reorder the items and nothing breaks — the absence of sequence is the giveaway.',
    },
    usage: {
      ja: '業務機能一覧(機能分解図)の単位。組織横断で「同じ仕事を何箇所でやっているか」を見つけるのに最も効く。',
      en: 'The unit of a functional decomposition. The single best lens for spotting the same work being done in five places.',
    },
    confusedWith: {
      ja: 'プロセスとの違いはビジネスプロセスの項に書いた通り。ケイパビリティとも混ざる。ケイパビリティは経営視点の「できること」で担い手を持たない。ビジネス機能は組織内部の仕事のまとまりで、ロールが割り当たる。粗さも違い、ケイパビリティ 1 個にビジネス機能が複数ぶら下がるのが普通。',
      en: 'For the process split see business process. It also blurs with capability: a capability is an executive-level ability with no performer, while a business function is an internal bundle of work with roles assigned. They also differ in grain — one capability normally spans several business functions.',
    },
    keywords: ['business function', 'ビジネス機能', '機能', '業務機能', 'function'],
  },
  {
    id: 'business-interaction',
    name: { ja: 'ビジネスインタラクション', en: 'Business Interaction' },
    layer: 'business',
    meaning: {
      ja: '複数の主体が共同で行う振る舞い。片方だけでは成立しない交渉・審議・契約締結などを表す。',
      en: 'Behaviour performed jointly by more than one party — negotiation, deliberation, signing — where neither side alone completes it.',
    },
    usage: {
      ja: '「合意形成に時間がかかる」箇所を明示する。実務では使用頻度が低いので、本当に共同でしか成立しない場合だけ使う。',
      en: 'Use it to expose where consensus-building eats the schedule. It is rarely needed — reserve it for behaviour that genuinely cannot happen one-sided.',
    },
    confusedWith: {
      ja: 'プロセスと混同しやすいが、判定は簡単で「主体が 2 つ以上必要か」。1 主体で完結するならプロセスにする。',
      en: 'Confused with process, but the test is simple: does it require two or more parties? If one party can finish it, model a process.',
    },
    keywords: ['business interaction', 'インタラクション', '共同作業', '交渉', 'joint'],
  },
  {
    id: 'business-event',
    name: { ja: 'ビジネスイベント', en: 'Business Event' },
    layer: 'business',
    meaning: {
      ja: '業務上の出来事。注文の到着、月末の到来、契約の解約など、何かが起きた瞬間を表す。',
      en: 'Something that happens in the business: an order arrives, month-end comes, a contract is cancelled — a moment, not a duration.',
    },
    usage: {
      ja: 'プロセスの起点として置く。イベント駆動の設計を検討するとき、業務側のイベントを先に洗い出しておくと後の設計が速い。',
      en: 'Place it as a process trigger. If event-driven design is on the table, enumerating business events first makes the later design far quicker.',
    },
    confusedWith: {
      ja: 'プロセスとの違いは「長さがあるか」。イベントは瞬間で、所要時間を持たない。「審査する」はプロセス、「審査依頼が届いた」はイベント。',
      en: 'The difference from a process is duration. An event is instantaneous. "Assess the application" is a process; "an application arrived" is an event.',
    },
    keywords: ['business event', 'イベント', '事象', 'trigger', 'きっかけ'],
  },
  {
    id: 'business-service',
    name: { ja: 'ビジネスサービス', en: 'Business Service' },
    layer: 'business',
    meaning: {
      ja: '外部(顧客・他部門)に提供される、内部の作り方を隠した価値の単位。「口座開設」「与信照会」など、受け手が名前で呼ぶもの。',
      en: 'A unit of value offered outward — to customers or other units — that hides how it is produced. The thing the recipient names: "open an account".',
    },
    usage: {
      ja: 'サービスカタログの単位。ここを先に固めると、内部プロセスを作り替えても対外的な約束が変わらないことを示せる。',
      en: 'The unit of a service catalogue. Fix these first and you can rebuild the internals while proving the external promise is unchanged.',
    },
    confusedWith: {
      ja: 'プロセスとの区別が甘い図が非常に多い。プロセスは内部の作り方、サービスは外向きの約束。「請求処理プロセス」と「請求書発行サービス」を同一視すると、外注や自動化の議論で必ず破綻する。',
      en: 'Countless models blur this. The process is the internal making; the service is the outward promise. Treating "invoicing process" and "invoice issuance service" as one thing always breaks down once outsourcing or automation is discussed.',
    },
    keywords: ['business service', 'ビジネスサービス', 'サービス', 'サービスカタログ', 'offering'],
  },
  {
    id: 'business-object',
    name: { ja: 'ビジネスオブジェクト', en: 'Business Object' },
    layer: 'business',
    meaning: {
      ja: '業務上意味のある情報のかたまり。顧客、契約、注文など、業務担当者がその名前で会話するもの。',
      en: 'A meaningful chunk of business information — customer, contract, order — named the way business people say it.',
    },
    usage: {
      ja: '概念データモデルの単位。用語集(グロッサリ)と 1 対 1 に対応させると、部門ごとの用語のズレが一気に見える。',
      en: 'The unit of a conceptual data model. Line it up one-to-one with the glossary and cross-departmental term drift becomes visible at once.',
    },
    confusedWith: {
      ja: 'データオブジェクト(アプリケーション層)と混同しやすい。ビジネスオブジェクトは「業務の概念」、データオブジェクトは「システムが保持する形」。1 つの概念が 3 システムに別々の形で存在する、という重複はこの 2 つを分けて初めて見える。',
      en: 'Easily confused with the application-layer data object: the business object is the concept, the data object is the shape a system stores. Only by keeping them apart do you see one concept living in three systems in three shapes.',
    },
    keywords: ['business object', 'ビジネスオブジェクト', '概念', '情報', 'entity', 'エンティティ'],
  },
  {
    id: 'contract',
    name: { ja: '契約', en: 'Contract' },
    layer: 'business',
    meaning: {
      ja: '破ったときに誰かが責任を問われる種類のビジネスオブジェクト。SLA、利用規約、業務委託契約のように、拘束力を持つ取り決めを指す。',
      en: 'The kind of business object somebody is answerable for breaking — an SLA, terms of use, an outsourcing agreement. An arrangement with teeth.',
    },
    usage: {
      ja: 'サービスに紐づけると「約束のレベル」が図に載る。非機能要件の出所を辿るときに効く。',
      en: 'Attach it to a service and the promised level appears on the diagram — useful when tracing where a non-functional requirement came from.',
    },
    confusedWith: {
      ja: '普通のビジネスオブジェクトとの違いは「拘束力があるか」。社内標準の定義書は契約ではなく原則や標準として扱うほうが素直。',
      en: 'The difference from a plain business object is bindingness. An internal standards document is better handled as a principle or standard than as a contract.',
    },
    keywords: ['contract', '契約', 'sla', '規約', '合意'],
  },
  {
    id: 'representation',
    name: { ja: '表現形式', en: 'Representation' },
    layer: 'business',
    meaning: {
      ja: '同じ情報を人が実際に目にするときの「器」。帳票、画面、PDF、紙の申込書など、受け取った相手が手に取るもの。',
      en: 'The container information is actually looked at in — a form, a screen, a PDF, a paper application. The thing the recipient physically handles.',
    },
    usage: {
      ja: '「同じ情報が 5 種類の帳票で出ている」といった重複を暴くのに使う。帳票削減プロジェクトの初手として有効。',
      en: 'Use it to expose one piece of information printed on five different forms — a good opening move for form-reduction work.',
    },
    confusedWith: {
      ja: 'ビジネスオブジェクトとの違いは「中身か、見た目か」。契約書という紙は表現形式、契約という概念はビジネスオブジェクト。',
      en: 'Content versus appearance: the printed agreement is a representation, the concept of the contract is a business object.',
    },
    keywords: ['representation', '表現', '帳票', '様式', 'document', 'フォーム'],
  },
  {
    id: 'product',
    name: { ja: 'プロダクト', en: 'Product' },
    layer: 'business',
    meaning: {
      ja: '顧客が名前で買う単位。裏側では複数のサービスと取り決めが束ねられているが、買い手には 1 つに見える。値段が付くのはここ。',
      en: 'The unit a customer buys by name. Underneath, several services and agreements are tied together, but the buyer sees one thing — and it is the thing that carries a price.',
    },
    usage: {
      ja: '商品ラインナップとサービスの対応を示す。「この商品を廃止すると、どのサービスが残るか」に即答できるようになる。',
      en: 'Maps the product line onto services, so you can answer instantly which services survive if a product is retired.',
    },
    confusedWith: {
      ja: 'サービスとの違いは「売り物か、提供機能か」。1 プロダクトが複数サービスを束ね、同じサービスが複数プロダクトに再利用される。',
      en: 'Product is what is sold; service is what is delivered. One product bundles several services, and the same service is reused across products.',
    },
    keywords: ['product', 'プロダクト', '商品', '提供物', 'offering'],
  },

  // --- Application ------------------------------------------------------
  {
    id: 'application-component',
    name: { ja: 'アプリケーションコンポーネント', en: 'Application Component' },
    layer: 'application',
    meaning: {
      ja: '「これを捨てて別のものに差し替える」という会話が成り立つソフトウェアの単位。パッケージ製品、内製システム、マイクロサービスなど。',
      en: 'A unit of software for which the sentence "rip this out and put a different one in" makes sense: a packaged product, an in-house system, a microservice.',
    },
    usage: {
      ja: 'アプリケーションポートフォリオの単位。粒度は「契約・保守・更改の単位」に揃えると、そのまま投資判断に使える。',
      en: 'The unit of the application portfolio. Size it by what you contract, maintain, and refresh, and it feeds investment decisions directly.',
    },
    confusedWith: {
      ja: 'ノード(テクノロジー層)との混同が典型的な事故。コンポーネントは「業務のためのソフトウェア」、ノードは「それが載る計算資源」。データベースは要注意で、業務データを保持し業務機能を支えるなら DBMS はシステムソフトウェア(=ノード側)、その上の業務スキーマはデータオブジェクトになる。「Kubernetes」「EC2」「Oracle Database」はノード側、「受注管理システム」はコンポーネント側。',
      en: 'The classic accident is component versus node. A component is software that serves the business; a node is the compute it runs on. Databases catch people out: the DBMS itself is system software on the technology side, while the business schema on top is a data object. Kubernetes, EC2, and Oracle Database sit on the node side; "Order Management System" sits on the component side.',
    },
    keywords: ['application component', 'アプリケーションコンポーネント', 'システム', 'アプリ', 'component'],
  },
  {
    id: 'application-collaboration',
    name: { ja: 'アプリケーションコラボレーション', en: 'Application Collaboration' },
    layer: 'application',
    meaning: {
      ja: '複数のコンポーネントが組んで初めて成立するまとまり。分散トランザクションや連携基盤越しの協調など。',
      en: 'A grouping that only works when several components act together — distributed transactions, coordination across an integration bus.',
    },
    usage: {
      ja: '「単体では機能を提供できない」構造を明示する。障害時の影響範囲説明に使うと納得が早い。',
      en: 'Makes explicit that no single component delivers the function. It shortens the conversation about blast radius during incidents.',
    },
    confusedWith: {
      ja: '単なるグルーピングと混同しないこと。図の整理のために囲みたいだけなら Grouping を使い、実際に協調して振る舞う場合だけコラボレーションにする。',
      en: 'Do not use it as a visual box. If you merely want to group things, use a grouping; reserve collaboration for components that genuinely act in concert.',
    },
    keywords: ['application collaboration', 'アプリケーションコラボレーション', '連携', '協調'],
  },
  {
    id: 'application-interface',
    name: { ja: 'アプリケーションインターフェース', en: 'Application Interface' },
    layer: 'application',
    meaning: {
      ja: 'コンポーネントが外部に晒す接点。REST API、ファイル連携、メッセージキューのトピックなど。',
      en: 'The exposed point of contact of a component: a REST API, a file drop, a message-queue topic.',
    },
    usage: {
      ja: '統合方式の議論はここで行う。インターフェースを明示しない図は、結局「線が何本あるか」しか語れない。',
      en: 'Integration decisions belong here. A model without explicit interfaces can only tell you how many lines there are.',
    },
    confusedWith: {
      ja: 'アプリケーションサービスとの違いに注意。サービスは「何ができるか(機能的な約束)」、インターフェースは「どうやって呼ぶか(技術的な口)」。同じサービスを REST とファイル連携の 2 インターフェースで提供する、が正しい表現。',
      en: 'Watch the split from application service: the service is the functional promise, the interface is the technical mouth. Offering one service through both a REST and a file interface is the correct shape.',
    },
    keywords: ['application interface', 'api', 'インターフェース', '連携口', 'endpoint'],
  },
  {
    id: 'application-function',
    name: { ja: 'アプリケーション機能', en: 'Application Function' },
    layer: 'application',
    meaning: {
      ja: 'コンポーネントの内部的な振る舞いのまとまり。外に出す前の「中で何をしているか」。',
      en: 'An internal bundle of behaviour inside a component — what it does before anything is exposed.',
    },
    usage: {
      ja: '巨大なコンポーネントを分割検討するときに使う。機能単位で切り出せるかを議論する土台になる。',
      en: 'Use it when considering how to break up a monolith; it gives the decomposition discussion a concrete unit.',
    },
    confusedWith: {
      ja: 'アプリケーションサービスとの違いは「外から見えるか」。機能は内部、サービスは公開。両方を描くのは、外に出す単位と内部構造が一致しない場合だけでよい。',
      en: 'Function versus service is internal versus exposed. Draw both only when the exposed unit and the internal structure do not line up.',
    },
    keywords: ['application function', 'アプリケーション機能', '内部機能', 'function'],
  },
  {
    id: 'application-interaction',
    name: { ja: 'アプリケーションインタラクション', en: 'Application Interaction' },
    layer: 'application',
    meaning: {
      ja: '複数コンポーネントが共同で行う振る舞い。片方だけでは完了しない相互呼び出しを表す。',
      en: 'Behaviour that two or more components perform jointly — a mutual exchange that neither completes alone.',
    },
    usage: {
      ja: '使用頻度は低い。二相コミットや相互認証のように、本当に双方の動作が噛み合って初めて成立する場合に限る。',
      en: 'Rarely needed. Reserve it for cases like two-phase commit or mutual authentication where both sides must genuinely mesh.',
    },
    keywords: ['application interaction', 'インタラクション', '相互作用', '双方向'],
  },
  {
    id: 'application-process',
    name: { ja: 'アプリケーションプロセス', en: 'Application Process' },
    layer: 'application',
    meaning: {
      ja: 'システム内部で順序を持って進む処理の流れ。夜間バッチ、ワークフローエンジンの実行など。',
      en: 'A processing flow inside a system that has an order: a nightly batch, a workflow engine run.',
    },
    usage: {
      ja: 'バッチ依存関係の可視化に効く。「この夜間処理が遅れると翌朝どの業務が止まるか」を一枚で示せる。',
      en: 'Strong for batch dependency maps: which morning business stops if this nightly job runs late, on one page.',
    },
    confusedWith: {
      ja: 'アプリケーション機能との違いはビジネス層と同じ構図で、順序があるかどうか。順序に意味がないなら機能にする。',
      en: 'Same split as in the business layer: order or no order. If the sequence carries no meaning, model a function.',
    },
    keywords: ['application process', 'アプリケーションプロセス', 'バッチ', 'batch', '処理フロー'],
  },
  {
    id: 'application-event',
    name: { ja: 'アプリケーションイベント', en: 'Application Event' },
    layer: 'application',
    meaning: {
      ja: 'システム内部で発生する出来事。メッセージ受信、状態変化の通知、タイマー発火など。',
      en: 'Something that happens inside a system: a message arrives, a state change is published, a timer fires.',
    },
    usage: {
      ja: 'イベント駆動アーキテクチャの設計で、業務イベントとシステムイベントの対応を示すのに使う。',
      en: 'In event-driven design, use it to line system events up against the business events they correspond to.',
    },
    keywords: ['application event', 'イベント', 'メッセージ', 'event driven', 'pubsub'],
  },
  {
    id: 'application-service',
    name: { ja: 'アプリケーションサービス', en: 'Application Service' },
    layer: 'application',
    meaning: {
      ja: 'システムが外部(業務や他システム)に公開する機能的な約束。内部実装を隠す境界。',
      en: 'The functional promise a system publishes outward, to the business or to other systems. The boundary that hides the implementation.',
    },
    usage: {
      ja: '層と層をつなぐ唯一の正しい継ぎ目。ビジネスプロセスへはここから線を引く。ここを省くと、システム更改のたびに業務側の図まで書き直す羽目になる。',
      en: 'The only correct seam between layers — draw the line to the business process from here. Skip it and every system replacement forces a redraw of the business diagrams too.',
    },
    confusedWith: {
      ja: 'アプリケーション機能・インターフェースとの三者関係を押さえる。機能=中で何をするか、サービス=外への約束、インターフェース=呼び出し方。',
      en: 'Hold the trio straight: function is what happens inside, service is the outward promise, interface is how you call it.',
    },
    keywords: ['application service', 'アプリケーションサービス', 'サービス', '公開機能'],
  },
  {
    id: 'data-object',
    name: { ja: 'データオブジェクト', en: 'Data Object' },
    layer: 'application',
    meaning: {
      ja: 'システムが保持・処理するデータのまとまり。テーブル群、ドキュメント集合、メッセージスキーマなど。',
      en: 'A structured chunk of data a system holds or processes: a set of tables, a document collection, a message schema.',
    },
    usage: {
      ja: 'アクセス関係(作成・読取・更新・削除)と組にして描くと、そのままデータ所有権とマスタデータの議論になる。',
      en: 'Drawn with access relationships (create/read/update/delete) it turns directly into an ownership and master-data conversation.',
    },
    confusedWith: {
      ja: 'ビジネスオブジェクトは業務概念、データオブジェクトはシステム内の形、アーティファクト(テクノロジー層)は物理ファイル。「顧客」という概念が「CUSTOMER テーブル」として実現され、それが「customer.dmp」というファイルに出る、という三段構えで整理する。',
      en: 'Business object is the concept, data object is the shape inside a system, artifact is the physical file. Think of the concept "customer" realized as a CUSTOMER table and dumped as customer.dmp — three tiers.',
    },
    keywords: ['data object', 'データオブジェクト', 'データ', 'テーブル', 'schema', 'スキーマ'],
  },

  // --- Technology -------------------------------------------------------
  {
    id: 'node',
    name: { ja: 'ノード', en: 'Node' },
    layer: 'technology',
    meaning: {
      ja: '処理や保存を担う計算資源。サーバ、仮想マシン、コンテナ基盤、クラウドのマネージドサービスなど。',
      en: 'A compute resource that processes or stores: a server, a VM, a container platform, a managed cloud service.',
    },
    usage: {
      ja: '汎用の器として使ってよい。デバイスかシステムソフトウェアか判断が付かない段階では、まずノードで置いて後から詳細化するのが実務的。',
      en: 'It is fine as a generic container. When you cannot yet tell device from system software, put down a node and refine later.',
    },
    confusedWith: {
      ja: 'アプリケーションコンポーネントとの区別が最大の論点。判定法は「業務のために存在するか、それを動かすために存在するか」。会計システムはコンポーネント、それが載るアプリサーバはノード。SaaS は迷いどころだが、業務機能を提供している側面を描くならコンポーネント、稼働基盤としての側面を描くならノードにする(両方描いて実現関係で繋いでもよい)。',
      en: 'The big one is component versus node. Test: does it exist for the business, or to run something else? An accounting system is a component; the app server under it is a node. SaaS is genuinely ambiguous — model it as a component when you mean the business function, as a node when you mean the hosting, or draw both and link them with realization.',
    },
    keywords: ['node', 'ノード', 'サーバ', 'server', '基盤', 'vm', 'コンテナ'],
  },
  {
    id: 'device',
    name: { ja: 'デバイス', en: 'Device' },
    layer: 'technology',
    meaning: {
      ja: '物理的なハードウェア。ラック内の実機、端末、ネットワーク機器、センサーなど。',
      en: 'Physical hardware: a boxed machine in a rack, a terminal, a network appliance, a sensor.',
    },
    usage: {
      ja: 'オンプレやエッジ、店舗端末を扱うときに使う。フルクラウド案件では登場しないことも多く、無理に描く必要はない。',
      en: 'Use it for on-prem, edge, and store terminals. On all-cloud engagements it often never appears, and that is fine.',
    },
    confusedWith: {
      ja: 'ノードとの違いは「物理実体があるか」。仮想マシンはデバイスではなくノード。デバイスとシステムソフトウェアを組み合わせて 1 つのノードを構成する、という積み方が基本形。',
      en: 'Device versus node is physicality. A VM is a node, not a device. The standard shape is a device plus system software composing one node.',
    },
    keywords: ['device', 'デバイス', 'ハードウェア', '機器', '端末', 'hardware'],
  },
  {
    id: 'system-software',
    name: { ja: 'システムソフトウェア', en: 'System Software' },
    layer: 'technology',
    meaning: {
      ja: '業務そのものではなく、他のソフトを動かすためのソフト。OS、DBMS、Web サーバ、ランタイム、メッセージング基盤など。',
      en: 'Software that exists to run other software rather than to do the business: OS, DBMS, web server, runtime, messaging platform.',
    },
    usage: {
      ja: 'EOL 管理・バージョン統制の議論に直結する。サポート期限を属性に持たせると、更改計画の根拠がそのまま作れる。',
      en: 'It plugs straight into EOL and version governance. Tag support end dates and the refresh plan writes its own justification.',
    },
    confusedWith: {
      ja: 'アプリケーションコンポーネントとの線引きは「業務要件が変わったときに直すか」。業務要件で変わるならコンポーネント、変わらないならシステムソフトウェア。',
      en: 'The line against an application component: would a change in business requirements make you edit it? If yes it is a component; if no it is system software.',
    },
    keywords: ['system software', 'システムソフトウェア', 'os', 'ミドルウェア', 'middleware', 'dbms'],
  },
  {
    id: 'technology-collaboration',
    name: { ja: 'テクノロジーコラボレーション', en: 'Technology Collaboration' },
    layer: 'technology',
    meaning: {
      ja: '複数ノードが束になって成立するまとまり。クラスタ、冗長構成ペア、分散ストレージなど。',
      en: 'A grouping of nodes that only works as a set: a cluster, an active-standby pair, distributed storage.',
    },
    usage: {
      ja: '可用性の議論で効く。単体ノードでは提供できないサービスであることを明示できる。',
      en: 'Useful in availability discussions: it makes explicit that no single node can offer the service.',
    },
    keywords: ['technology collaboration', 'クラスタ', 'cluster', '冗長', 'ha'],
  },
  {
    id: 'technology-interface',
    name: { ja: 'テクノロジーインターフェース', en: 'Technology Interface' },
    layer: 'technology',
    meaning: {
      ja: 'ノードが外部に晒す接続点。ポート、プロトコルエンドポイント、管理コンソールなど。',
      en: 'The connection point a node exposes: a port, a protocol endpoint, a management console.',
    },
    usage: {
      ja: 'セキュリティ設計で効く。晒している口を列挙することが、そのまま攻撃面の整理になる。',
      en: 'Strong for security work: enumerating exposed mouths is the same exercise as mapping attack surface.',
    },
    keywords: ['technology interface', 'ポート', 'port', 'プロトコル', 'endpoint'],
  },
  {
    id: 'path',
    name: { ja: '経路', en: 'Path' },
    layer: 'technology',
    meaning: {
      ja: 'ノード同士が通信する論理的な繋がり。「A から B へ通信できる」という関係そのもの。',
      en: 'A logical link over which nodes communicate — the fact that A can reach B.',
    },
    usage: {
      ja: '論理的な到達性を描く。物理的にどの回線を通るかは通信ネットワーク側で表す。',
      en: 'Use it for logical reachability; leave which physical circuit it rides to the communication network.',
    },
    confusedWith: {
      ja: '通信ネットワークとの関係は「論理と物理」。1 本の経路が複数のネットワークに跨って実現されることがある。',
      en: 'Path versus communication network is logical versus physical. One path may be realized across several networks.',
    },
    keywords: ['path', '経路', '通信経路', 'link', '到達性'],
  },
  {
    id: 'communication-network',
    name: { ja: '通信ネットワーク', en: 'Communication Network' },
    layer: 'technology',
    meaning: {
      ja: '実際の通信を担うネットワーク。社内 LAN、専用線、VPN、インターネット、閉域網など。',
      en: 'The network that actually carries traffic: LAN, leased line, VPN, the internet, a private circuit.',
    },
    usage: {
      ja: 'ネットワークセグメントとして描くと、境界とゾーニングの議論にそのまま使える。',
      en: 'Drawn as segments, it feeds the boundary and zoning discussion directly.',
    },
    confusedWith: {
      ja: '経路との違いは上記。また物流の配送網(流通ネットワーク)とは別物なので、モノの流れはそちらを使う。',
      en: 'See path for the logical split. It is also distinct from a distribution network — physical goods flow belongs there.',
    },
    keywords: ['communication network', 'ネットワーク', 'lan', 'vpn', '回線', 'segment'],
  },
  {
    id: 'technology-function',
    name: { ja: 'テクノロジー機能', en: 'Technology Function' },
    layer: 'technology',
    meaning: {
      ja: 'ノードが内部で担う振る舞いのまとまり。認証処理、ログ収集、暗号化など。',
      en: 'An internal bundle of behaviour a node performs: authentication, log collection, encryption.',
    },
    usage: {
      ja: '基盤の共通機能を洗い出すのに使う。「各システムが個別に実装している認証」を見つける道具。',
      en: 'Use it to surface shared platform capabilities — the tool for finding authentication reimplemented in every system.',
    },
    keywords: ['technology function', '基盤機能', '共通機能', 'platform function'],
  },
  {
    id: 'technology-process',
    name: { ja: 'テクノロジープロセス', en: 'Technology Process' },
    layer: 'technology',
    meaning: {
      ja: '基盤側で順序を持って進む処理。バックアップ、パッチ適用、デプロイパイプラインなど。',
      en: 'An ordered flow on the platform side: backup, patching, a deployment pipeline.',
    },
    usage: {
      ja: '運用設計と接続するときに使う。運用手順を図に載せると、可用性の前提条件が明示される。',
      en: 'Use it when wiring into operations design; putting runbooks on the model exposes the assumptions behind availability.',
    },
    keywords: ['technology process', '運用', 'backup', 'deploy', 'パイプライン'],
  },
  {
    id: 'technology-interaction',
    name: { ja: 'テクノロジーインタラクション', en: 'Technology Interaction' },
    layer: 'technology',
    meaning: {
      ja: '複数ノードが共同で行う振る舞い。合意アルゴリズムやフェイルオーバーの協調動作など。',
      en: 'Behaviour performed jointly by several nodes — consensus algorithms, coordinated failover.',
    },
    usage: {
      ja: '使う場面は限られる。冗長構成の挙動を正確に説明する必要があるときだけで十分。',
      en: 'Rarely needed. Reach for it only when the exact behaviour of a redundant setup must be explained.',
    },
    keywords: ['technology interaction', 'フェイルオーバー', 'failover', '協調'],
  },
  {
    id: 'technology-event',
    name: { ja: 'テクノロジーイベント', en: 'Technology Event' },
    layer: 'technology',
    meaning: {
      ja: '基盤側で発生する出来事。ディスク枯渇、ノード障害、しきい値超過のアラートなど。',
      en: 'Something that happens on the platform: disk exhaustion, node failure, a threshold alert.',
    },
    usage: {
      ja: '監視設計と繋げる。イベントから業務影響までを線で辿れると、アラートの優先度付けが根拠を持つ。',
      en: 'Wire it to monitoring design. Tracing an event through to business impact gives alert prioritization a basis.',
    },
    keywords: ['technology event', 'アラート', 'alert', '障害', 'incident'],
  },
  {
    id: 'technology-service',
    name: { ja: 'テクノロジーサービス', en: 'Technology Service' },
    layer: 'technology',
    meaning: {
      ja: '基盤がアプリケーションに提供する能力。実行環境、ストレージ、認証、メッセージングなど。',
      en: 'What the platform offers to applications: runtime, storage, authentication, messaging.',
    },
    usage: {
      ja: 'アプリ層と基盤層の継ぎ目。ここを定義しておけば、基盤を入れ替えてもアプリ層の図は変わらないと説明できる。',
      en: 'The seam between application and platform. Define it and you can argue that swapping the platform leaves the application diagrams untouched.',
    },
    confusedWith: {
      ja: 'ノードとの関係は「提供者と提供物」。ノードがテクノロジーサービスを実現し、そのサービスがアプリケーションコンポーネントを支援する、が正しい線の張り方。',
      en: 'Node and service are provider and offering. Correct wiring: the node realizes the technology service, and that service serves the application component.',
    },
    keywords: ['technology service', '基盤サービス', 'iaas', 'paas', 'runtime'],
  },
  {
    id: 'artifact',
    name: { ja: 'アーティファクト', en: 'Artifact' },
    layer: 'technology',
    meaning: {
      ja: '実際にノード上に置かれる成果物ファイル。実行バイナリ、コンテナイメージ、設定ファイル、DB ダンプなど。',
      en: 'The file that actually sits on a node: an executable, a container image, a config file, a database dump.',
    },
    usage: {
      ja: '配置構成(デプロイメント図)を描くときの主役。アーティファクトからアプリケーションコンポーネントへ実現関係を張る(具体 → 抽象)と、リリース単位が明確になる。ノードとの間は割り当てで結ぶ。',
      en: 'The lead role in deployment views. Draw realization from the artifact up to the application component (concrete → abstract) and the release unit becomes unambiguous; tie it to its node with assignment.',
    },
    confusedWith: {
      ja: 'アプリケーションコンポーネントとの違いは「概念か、実体ファイルか」。「受注管理システム」はコンポーネント、「order-api:1.4.2 のイメージ」はアーティファクト。データオブジェクトとの違いは「論理データか、物理ファイルか」。',
      en: 'Component versus artifact is concept versus file on disk: "Order Management System" is a component, the image order-api:1.4.2 is an artifact. Against a data object it is logical data versus a physical file.',
    },
    keywords: ['artifact', 'アーティファクト', 'ファイル', 'イメージ', 'binary', 'deploy'],
  },

  // --- Physical ---------------------------------------------------------
  {
    id: 'equipment',
    name: { ja: '設備', en: 'Equipment' },
    layer: 'physical',
    meaning: {
      ja: '物理的な処理を行う機械。生産設備、検査装置、搬送機、車両など。',
      en: 'A machine that performs physical work: production equipment, inspection rigs, conveyors, vehicles.',
    },
    usage: {
      ja: '製造・物流案件で、設備とシステムの接続点を示す。IoT ゲートウェイ経由でどのデータが上がるかを描くと投資判断が具体になる。',
      en: 'In manufacturing and logistics, show where equipment meets systems. Drawing which data flows up through an IoT gateway makes the investment case concrete.',
    },
    confusedWith: {
      ja: 'デバイス(テクノロジー層)との違いは「情報処理が主目的か、物理作業が主目的か」。PLC やセンサーは境界的で、制御対象として扱うなら設備、IT 資産として管理するならデバイスに寄せる。',
      en: 'Against a technology device: is its purpose information processing or physical work? PLCs and sensors straddle the line — model them as equipment when you mean the controlled thing, as a device when you manage them as IT assets.',
    },
    keywords: ['equipment', '設備', '装置', '機械', 'machine', '製造'],
  },
  {
    id: 'facility',
    name: { ja: '施設', en: 'Facility' },
    layer: 'physical',
    meaning: {
      ja: '物理的な場所。工場、倉庫、店舗、データセンター、事業所など。',
      en: 'A physical place: a plant, a warehouse, a store, a data centre, an office.',
    },
    usage: {
      ja: '拠点別の展開計画やレイテンシ・法規制(データ所在地)の議論に使う。拠点統廃合の検討では必須。',
      en: 'Use it for site rollout plans, latency, and data-residency rules. Indispensable when consolidating sites.',
    },
    confusedWith: {
      ja: 'データセンターは施設だが、その中のラックやサーバはデバイス、載っているソフトはシステムソフトウェア。階層を混ぜないこと。',
      en: 'A data centre is a facility, the racks and servers inside are devices, and the software on them is system software. Do not collapse the tiers.',
    },
    keywords: ['facility', '施設', '拠点', '工場', 'データセンター', 'site'],
  },
  {
    id: 'distribution-network',
    name: { ja: '流通ネットワーク', en: 'Distribution Network' },
    layer: 'physical',
    meaning: {
      ja: '施設と施設を結ぶ運び道。配送ルート、鉄道、送電網、配管などを、リードタイムをぶら下げられる 1 要素にまとめたもの。',
      en: 'The carrying route between facilities — delivery lanes, rail, the grid, pipework — collapsed into one element you can hang lead times off.',
    },
    usage: {
      ja: 'サプライチェーンの図で、施設と施設の間を繋ぐ。リードタイムを属性に置くと、在庫方針の議論に直結する。',
      en: 'In supply-chain views it connects facilities. Tag lead times and it feeds inventory policy discussions directly.',
    },
    confusedWith: {
      ja: '通信ネットワークとは対になる概念。情報が流れるなら通信ネットワーク、モノが流れるなら流通ネットワーク。',
      en: 'The counterpart of the communication network: information flows on one, physical things on the other.',
    },
    keywords: ['distribution network', '流通', '物流', '配送', 'supply chain', 'サプライチェーン'],
  },
  {
    id: 'material',
    name: { ja: '材料', en: 'Material' },
    layer: 'physical',
    meaning: {
      ja: '物理的なモノそのもの。原材料、部品、仕掛品、完成品など。',
      en: 'The physical stuff itself: raw material, parts, work in progress, finished goods.',
    },
    usage: {
      ja: 'モノの流れを追うときにだけ使う。IT アーキテクチャの図に持ち込むと視覚的なノイズになりやすいので、専用のビューに分ける。',
      en: 'Use it only when tracking physical flow. Dropped into IT views it becomes noise — give it its own view.',
    },
    confusedWith: {
      ja: 'アーティファクトは情報の物理形(ファイル)、材料は物質そのもの。図面 PDF はアーティファクト、その図面が指す鋼板は材料。',
      en: 'An artifact is the physical form of information; material is physical substance. The drawing PDF is an artifact, the steel plate it describes is material.',
    },
    keywords: ['material', '材料', '部品', '在庫', 'goods', '原材料'],
  },

  // --- Motivation -------------------------------------------------------
  {
    id: 'stakeholder',
    name: { ja: 'ステークホルダー', en: 'Stakeholder' },
    layer: 'motivation',
    meaning: {
      ja: '結果に利害を持つ個人・集団・役割。承認する人、影響を受ける人、反対する人を含む。',
      en: 'A person, group, or role with a stake in the outcome — including whoever approves, whoever is affected, and whoever objects.',
    },
    usage: {
      ja: '関心事(concern)と必ず対で書く。関心事のないステークホルダーは図に載せても何も生まない。反対者を落とさないこと。',
      en: 'Always paired with a concern; a stakeholder with no concern adds nothing to the model. Never omit the objectors.',
    },
    confusedWith: {
      ja: 'ビジネスアクターとの違いは「関心を持つ立場か、業務を行う主体か」。同じ人物が両方に現れるのは正常で、目的が違えば別要素として置いてよい。',
      en: 'Against a business actor: one holds an interest, the other performs work. The same human appearing in both is normal and fine.',
    },
    keywords: ['stakeholder', 'ステークホルダー', '関係者', 'concern', '関心事'],
  },
  {
    id: 'driver',
    name: { ja: 'ドライバ', en: 'Driver' },
    layer: 'motivation',
    meaning: {
      ja: '組織を動かす内外の圧力や関心事。法規制、競合の動き、コスト圧力、人材不足など。',
      en: 'The internal or external pressure that moves the organization: regulation, competitor moves, cost pressure, talent shortage.',
    },
    usage: {
      ja: '「なぜ今なのか」への回答。ドライバが書けない施策は、たいてい急ぐ理由がない施策。',
      en: 'The answer to "why now". An initiative with no articulable driver usually has no reason to be urgent.',
    },
    confusedWith: {
      ja: '評価との違いは「事実か、判断か」。「個人情報保護規制がある」はドライバ、「当社は同意管理が不十分」は評価。',
      en: 'Driver versus assessment is fact versus judgement. "Privacy regulation exists" is a driver; "our consent management is inadequate" is an assessment.',
    },
    keywords: ['driver', 'ドライバ', '要因', '外圧', '規制', 'pressure'],
  },
  {
    id: 'assessment',
    name: { ja: '評価', en: 'Assessment' },
    layer: 'motivation',
    meaning: {
      ja: '「今のままだとまずい」「ここは強い」という、現状への見立て。何かのドライバに突き合わせて初めて言えることを書く。',
      en: 'The verdict on where you stand — "this is a weak spot", "this one we are good at". It only means anything once you hold it against a driver.',
    },
    usage: {
      ja: 'SWOT や現状分析の結果をここに置く。評価から目標へ線を引くと、目標が主観ではなく分析の帰結だと示せる。',
      en: 'Park SWOT and current-state analysis results here. Linking assessment to goal shows the goal is a conclusion, not an opinion.',
    },
    confusedWith: {
      ja: 'ドライバとの違いは上記。ギャップ(実装層)とも混同されるが、評価は「今の見立て」、ギャップは「目標像との具体的な差分」。',
      en: 'See driver for that split. It also blurs with gap: an assessment is how things look now, a gap is a concrete delta against a defined target.',
    },
    keywords: ['assessment', '評価', '現状分析', 'swot', '課題認識'],
  },
  {
    id: 'goal',
    name: { ja: '目標', en: 'Goal' },
    layer: 'motivation',
    meaning: {
      ja: '組織が到達したい状態。方向と水準を示すが、いつ誰がどうやるかは含まない。',
      en: 'A state the organization wants to reach. It carries direction and level, but not who, when, or how.',
    },
    usage: {
      ja: '必ず測定単位を付ける。「顧客対応を改善する」ではなく「一次回答時間を 24 時間以内にする」まで書いて初めて成果と繋がる。',
      en: 'Always attach a unit. Not "improve customer response" but "first response within 24 hours" — only then does it connect to an outcome.',
    },
    confusedWith: {
      ja: '目標・成果・要件の三つ巴が動機層最大の混乱源。目標は「到達したい状態(まだ未達)」、成果は「実際に得られた/得られる結果」、要件は「そのためにシステムや組織が満たすべき条件」。「解約率を 5% 下げる」は目標、「解約率が 5% 下がった」は成果、「解約予兆をダッシュボードで通知できること」は要件。時制と主語で見分ける。',
      en: 'Goal, outcome, and requirement form the biggest tangle in this layer. A goal is a desired state not yet reached; an outcome is a result actually achieved or achievable; a requirement is a condition a system or organization must satisfy to get there. "Cut churn by five points" is a goal, "churn fell five points" is an outcome, "the dashboard must alert on churn signals" is a requirement. Tense and subject give it away.',
    },
    keywords: ['goal', '目標', 'kpi', '目的', 'objective'],
  },
  {
    id: 'outcome',
    name: { ja: '成果', en: 'Outcome' },
    layer: 'motivation',
    meaning: {
      ja: '実際に得られる結果。目標に対して「達成された状態」を具体的に表したもの。',
      en: 'A result that actually materializes — the concrete achieved form of a goal.',
    },
    usage: {
      ja: '施策の評価軸として使う。作業パッケージから成果へ線を引くと、「この投資で何が変わるのか」に一枚で答えられる。',
      en: 'Use it as the yardstick for initiatives. Linking work packages to outcomes answers "what changes because of this spend" on one page.',
    },
    confusedWith: {
      ja: '目標との違いは目標の項を参照。実務では「目標を細かく書きすぎて成果と区別が付かない」ことが多い。迷ったら、経営が掲げるものを目標、施策の完了判定に使うものを成果にする。',
      en: 'See goal. In practice people write goals so finely that outcomes become indistinguishable. When in doubt, what leadership proclaims is a goal; what you use to declare an initiative finished is an outcome.',
    },
    keywords: ['outcome', '成果', '結果', 'benefit', '効果'],
  },
  {
    id: 'principle',
    name: { ja: '原則', en: 'Principle' },
    layer: 'motivation',
    meaning: {
      ja: '設計や意思決定において常に守る方針。個別案件を越えて適用される判断の基準。',
      en: 'A standing rule for design and decision-making, applied across engagements rather than to one project.',
    },
    usage: {
      ja: '「理由」と「そう決めた結果どんな制約を受け入れるか」までセットで書く。この 2 つがない原則はスローガンで、実際の判断には使われない。',
      en: 'Write the rationale and the consequence you accept alongside it. Without those two, a principle is a slogan nobody applies.',
    },
    confusedWith: {
      ja: '要件・制約との違いは適用範囲。原則は組織全体に効き続けるもの、要件は個別案件で満たすもの、制約は選べない外部条件。「クラウドを第一選択とする」は原則、「本システムは AWS 上に構築する」は要件または制約。',
      en: 'Scope is what separates them: a principle applies organization-wide and permanently, a requirement applies to this engagement, a constraint is an external condition you cannot choose. "Cloud first" is a principle; "this system runs on AWS" is a requirement or a constraint.',
    },
    keywords: ['principle', '原則', 'アーキテクチャ原則', 'policy', '方針'],
  },
  {
    id: 'requirement',
    name: { ja: '要件', en: 'Requirement' },
    layer: 'motivation',
    meaning: {
      ja: '目標を達成するために、システムや組織が満たさなければならない条件。',
      en: 'A condition a system or an organization must satisfy in order to reach a goal.',
    },
    usage: {
      ja: 'アプリケーション/テクノロジー要素から要件へ実現関係を張る(向きは具体 → 抽象。要件が矢印の先)。これが動機層を使う最大の実利で、「この機能は誰の要望か」に即答できるようになる。',
      en: 'Draw realization from application and technology elements up to the requirement — concrete to abstract, with the requirement at the arrowhead. That wiring is the biggest practical payoff of this layer: you can answer "who asked for this feature" on the spot.',
    },
    confusedWith: {
      ja: '目標との違いは目標の項を、原則・制約との違いは原則の項を参照。要件が目標のまま書かれている図(「使いやすくする」)は、実現関係を張れないので必ず破綻する。',
      en: 'See goal and principle for the splits. A model whose requirements are really goals ("make it easy to use") always breaks, because nothing can realize them.',
    },
    keywords: ['requirement', '要件', '要求', 'must', '仕様'],
  },
  {
    id: 'constraint',
    name: { ja: '制約', en: 'Constraint' },
    layer: 'motivation',
    meaning: {
      ja: '実現方法を限定する条件。予算上限、法規制、既存契約、稼働できる時間帯など。',
      en: 'A condition that narrows how something may be realized: budget ceiling, regulation, an existing contract, an allowed maintenance window.',
    },
    usage: {
      ja: '早期に書き出すほど価値がある。制約を先に置くと、実現不可能な案を検討する時間を丸ごと節約できる。',
      en: 'The earlier you list them the better. Constraints on the table save the whole cost of exploring impossible options.',
    },
    confusedWith: {
      ja: '要件との違いは「選べるか」。交渉で外せるなら要件、外せないなら制約。実務では「制約だと思っていたら交渉可能だった」ケースが多いので、出所を必ず記録する。',
      en: 'Requirement versus constraint is negotiability. If it can be argued away it is a requirement; if not, a constraint. In practice many supposed constraints turn out negotiable, so always record where each one came from.',
    },
    keywords: ['constraint', '制約', '制限', '前提', 'limitation'],
  },
  {
    id: 'meaning',
    name: { ja: '意味', en: 'Meaning' },
    layer: 'motivation',
    meaning: {
      ja: 'ある要素が受け手にとってどう解釈されるか。同じ通知が、顧客には安心にも不安にも受け取られるといった違いを表す。',
      en: 'How an element is interpreted by whoever receives it — the same notification landing as reassurance for one audience and alarm for another.',
    },
    usage: {
      ja: '顧客体験や社内浸透を扱うときに使う。使用頻度は低いが、伝わり方が争点になる案件では効く。',
      en: 'Reach for it when customer experience or internal adoption is the issue. Rarely used, but valuable when perception is the battleground.',
    },
    confusedWith: {
      ja: '価値との違いは「解釈か、重要さか」。意味は受け手の理解、価値は受け手にとっての有用さ。',
      en: 'Meaning is interpretation; value is worth. One is how it is understood, the other is how much it matters.',
    },
    keywords: ['meaning', '意味', '解釈', '認識', 'interpretation'],
  },
  {
    id: 'value',
    name: { ja: '価値', en: 'Value' },
    layer: 'motivation',
    meaning: {
      ja: '「それは誰にとって、どれだけ嬉しいのか」を書き留めるための要素。金額で書けるなら金額、書けないなら言葉で構わない。',
      en: 'The place to record who ends up better off, and by how much. Put a number on it if you have one; words are acceptable if you do not.',
    },
    usage: {
      ja: 'サービスやプロダクトに付けて、「誰にとっていくらの価値か」を明示する。投資判断の説明で使うと納得度が上がる。',
      en: 'Attach it to services and products to state whose value and how much. It measurably improves buy-in when justifying investment.',
    },
    confusedWith: {
      ja: '成果との違いは「継続的に生まれるものか、一度達成する結果か」。価値は提供され続け、成果は達成される。',
      en: 'Value versus outcome is ongoing versus achieved. Value keeps being delivered; an outcome is reached.',
    },
    keywords: ['value', '価値', '効用', 'benefit', 'roi'],
  },

  // --- Implementation ---------------------------------------------------
  {
    id: 'work-package',
    name: { ja: '作業パッケージ', en: 'Work Package' },
    layer: 'implementation',
    meaning: {
      ja: '予算・オーナー・期限を 1 セットで背負わせられる作業のかたまり。実務ではプロジェクトそのもの、または大きなプロジェクトの中の一区画にあたる。',
      en: 'The chunk of work you can hang a budget, an owner, and a deadline on as one set. In practice that is a project, or one compartment inside a big one.',
    },
    usage: {
      ja: '予算・オーナー・期間を持てる粒度にする。ギャップから作業パッケージへ線を引けば、各投資に発生理由が付く。',
      en: 'Size it so it can carry a budget, an owner, and dates. Linking gaps to work packages gives every investment a stated reason.',
    },
    confusedWith: {
      ja: '行動方針(戦略層)との違いは「方針か、実行単位か」。またビジネスプロセスとも混同されやすいが、作業パッケージは一度きりの取り組みで、繰り返し回る業務ではない。',
      en: 'Against a course of action it is direction versus execution unit. It also blurs with business process — but a work package is a one-off effort, not recurring operations.',
    },
    keywords: ['work package', '作業パッケージ', 'プロジェクト', 'project', '施策'],
  },
  {
    id: 'deliverable',
    name: { ja: '成果物', en: 'Deliverable' },
    layer: 'implementation',
    meaning: {
      ja: '作業パッケージが「これを出したら終わり」と指させる受け渡し物。文書、稼働したシステム、移行済みデータなど。',
      en: 'The handover a work package can point at to declare itself finished: a document, a running system, migrated data.',
    },
    usage: {
      ja: '完了判定の対象。「その作業パッケージは何が出来たら終わりか」を成果物で定義すると、終わらないプロジェクトが減る。',
      en: 'The object of the done test. Defining what a work package produces is the cheapest cure for projects that never end.',
    },
    confusedWith: {
      ja: 'アーティファクト(テクノロジー層)との違いは「計画上の受け渡し物か、稼働環境上のファイルか」。設計書は成果物、デプロイされたイメージはアーティファクト。',
      en: 'Against a technology artifact: a deliverable is a planned handover, an artifact is a file in the running environment. A design document is a deliverable; a deployed image is an artifact.',
    },
    keywords: ['deliverable', '成果物', '納品物', 'output'],
  },
  {
    id: 'implementation-event',
    name: { ja: '実装イベント', en: 'Implementation Event' },
    layer: 'implementation',
    meaning: {
      ja: '移行・実装の過程で起きる節目。カットオーバー、承認、旧システム停止など。',
      en: 'A milestone during implementation or migration: cutover, sign-off, decommissioning of the legacy system.',
    },
    usage: {
      ja: 'プラトーとプラトーの境目に置く。「いつ何が切り替わるか」を明示すると、関係部署との調整が具体的になる。',
      en: 'Place it at plateau boundaries. Making the switch points explicit turns cross-team coordination from vague to concrete.',
    },
    keywords: ['implementation event', 'マイルストーン', 'milestone', 'カットオーバー', 'cutover'],
  },
  {
    id: 'plateau',
    name: { ja: 'プラトー', en: 'Plateau' },
    layer: 'implementation',
    meaning: {
      ja: '現行と目標の間に置く、名前の付いた中継地点。「ここで一度手を止めても、この姿のまま運用していける」と言える区切りを切り出したもの。',
      en: 'A named waypoint between today and the target: the shape of the estate at a point where you could stop building, run what you have, and still be fine.',
    },
    usage: {
      ja: '2〜4 個に絞る。各プラトーは「その時点で実際に動いている姿」で描き、工程名(要件定義フェーズ)ではなく状態名(旧新並行稼働)を付ける。',
      en: 'Keep to two to four. Draw each as what is actually running at that point, and name it as a state ("legacy and new running in parallel"), not as a project phase.',
    },
    confusedWith: {
      ja: '作業パッケージとの違いは「状態か、作業か」。プラトーは静止画、作業パッケージはそこへ至る動き。移行計画では両方が要る。',
      en: 'Plateau versus work package is state versus effort. The plateau is the still frame; the work package is the motion that gets you there. A migration plan needs both.',
    },
    keywords: ['plateau', 'プラトー', '中間状態', '移行状態', 'transition'],
  },
  {
    id: 'gap',
    name: { ja: 'ギャップ', en: 'Gap' },
    layer: 'implementation',
    meaning: {
      ja: 'ある中継地点から次へ進むために手を入れなければならない箇所。足りないので作るものと、余っているので捨てるものの両方を書く。',
      en: 'Whatever has to be touched to get from one waypoint to the next — both what must be built because it is missing and what must be thrown away because it is surplus.',
    },
    usage: {
      ja: '「増える側」だけでなく「なくなる側」も必ず書く。廃止を書かない移行計画はコストが下がらず、経営の承認が得られない。',
      en: 'Always record the retirement side, not just the additions. A migration plan without decommissioning never reduces cost and never gets approved.',
    },
    confusedWith: {
      ja: '評価(動機層)との違いは「主観的な見立てか、目標像との具体的な差か」。評価は目標がなくても書けるが、ギャップは目標像がなければ書けない。',
      en: 'Against a motivation assessment: an assessment is a judgement you can make without a target, a gap cannot exist until a target is defined.',
    },
    keywords: ['gap', 'ギャップ', '差分', '不足', '廃止'],
  },
];

// ---------------------------------------------------------------------------
// 関係 / Relationships
// ---------------------------------------------------------------------------

export const ARCHIMATE_RELATIONSHIPS: ArchiMateRelationship[] = [
  {
    id: 'composition',
    name: { ja: '構成(コンポジション)', en: 'Composition' },
    meaning: {
      ja: '全体が部分を「所有」している関係。部分は 1 つの全体にしか属さず、全体が消えれば部分も消える。',
      en: 'A whole owns its parts. A part belongs to exactly one whole, and it disappears when the whole does.',
    },
    usage: {
      ja: '分解構造を描く基本。「この部品を他でも共有しているか」を自問して、共有しているなら集約に変える。',
      en: 'The default for decomposition. Ask whether the part is shared elsewhere; if it is, switch to aggregation.',
    },
    category: 'structural',
    keywords: ['composition', '構成', 'コンポジション', '包含', '分解'],
  },
  {
    id: 'aggregation',
    name: { ja: '集約(アグリゲーション)', en: 'Aggregation' },
    meaning: {
      ja: '全体が部分を「まとめている」関係。部分は独立して存在でき、複数の全体に属せる。',
      en: 'A whole gathers parts that can exist independently and can belong to several wholes at once.',
    },
    usage: {
      ja: '共有される部品や、複数のグループに属する要素に使う。迷ったら構成より集約のほうが安全(誤りが少ない)。',
      en: 'Use it for shared parts and elements that sit in more than one grouping. When in doubt, aggregation is the safer choice.',
    },
    category: 'structural',
    keywords: ['aggregation', '集約', 'アグリゲーション', 'グループ'],
  },
  {
    id: 'assignment',
    name: { ja: '割り当て(アサインメント)', en: 'Assignment' },
    meaning: {
      ja: '実行の担い手と、実行される振る舞いを結ぶ関係。誰が/何がそれを行うのかを示す。',
      en: 'Ties a performer to the behaviour it performs — who or what actually does it.',
    },
    usage: {
      ja: 'ロールからプロセスへ、ノードからシステムソフトウェアへ、コンポーネントからアプリケーション機能へ。この線がない振る舞いは「誰もやらない仕事」として浮く。',
      en: 'Role to process, node to system software, component to application function. Behaviour with no assignment stands out as work nobody performs.',
    },
    category: 'structural',
    keywords: ['assignment', '割り当て', 'アサイン', '担当', '実行'],
  },
  {
    id: 'realization',
    name: { ja: '実現(リアライゼーション)', en: 'Realization' },
    meaning: {
      ja: '抽象的なものを、より具体的なものが「成り立たせている」関係。中身が約束を満たしていることを示す。',
      en: 'Something concrete makes something abstract actually exist — the implementation meets the promise.',
    },
    usage: {
      ja: '向きを間違えると図が丸ごと嘘になる。矢印は必ず「具体 → 抽象」、つまり実現する側を始点にする。アプリケーション機能 → アプリケーションサービス、アーティファクト → アプリケーションコンポーネント、データオブジェクト → ビジネスオブジェクト、そして実装要素 → 要件 → 目標。トレーサビリティの背骨なので、レビューではまずこの向きだけを見るとよい。',
      en: 'Get the direction wrong and the whole model lies. The arrow always runs concrete → abstract, starting at the thing doing the realizing: application function → application service, artifact → application component, data object → business object, and implementation element → requirement → goal. It is the backbone of traceability, so checking arrow direction alone is a worthwhile first review pass.',
    },
    category: 'structural',
    keywords: ['realization', '実現', 'リアライゼーション', 'トレーサビリティ', '具体化'],
  },
  {
    id: 'serving',
    name: { ja: '利用提供(サービング)', en: 'Serving' },
    meaning: {
      ja: '「こちらが止まると、あちらの仕事が成り立たない」という依存を表す線。矢印は提供する側から使う側へ向ける。',
      en: 'The line for "if this stops, that stops working". The arrow points from the side that provides to the side that depends on it.',
    },
    usage: {
      ja: '層をまたぐ主役の関係。アプリケーションサービスがビジネスプロセスを支援する、テクノロジーサービスがコンポーネントを支援する、という形が基本。',
      en: 'The main cross-layer relationship: an application service serves a business process, a technology service serves a component.',
    },
    category: 'dependency',
    keywords: ['serving', 'サービング', '利用', '提供', '支援', 'used by'],
  },
  {
    id: 'access',
    name: { ja: 'アクセス', en: 'Access' },
    meaning: {
      ja: '振る舞いがデータや情報に触れる関係。読む・書く・作る・消すのいずれかを示す。',
      en: 'Behaviour touching data or information — reading, writing, creating, or deleting it.',
    },
    usage: {
      ja: '必ず種別(読取/書込)を明示する。書込元が 2 つ以上あるデータは、その時点でマスタ不在の疑いがある。',
      en: 'Always state the kind. Any data with two or more writers is an immediate suspect for having no owner.',
    },
    category: 'dependency',
    keywords: ['access', 'アクセス', '読取', '書込', 'crud', 'データ操作'],
  },
  {
    id: 'influence',
    name: { ja: '影響(インフルエンス)', en: 'Influence' },
    meaning: {
      ja: '一方が他方の実現を後押しする、または妨げる関係。強さや符号(+/-)を持たせられる。',
      en: 'One element helps or hinders another from being achieved. It can carry a sign and a strength.',
    },
    usage: {
      ja: '動機層専用と考えてよい。目標同士のトレードオフ(コスト削減 vs 可用性向上)を可視化するのに最適。',
      en: 'Treat it as motivation-layer only. It is the best tool for showing trade-offs between goals, such as cost cuts versus availability.',
    },
    category: 'dependency',
    keywords: ['influence', '影響', 'トレードオフ', '促進', '阻害'],
  },
  {
    id: 'triggering',
    name: { ja: 'トリガー', en: 'Triggering' },
    meaning: {
      ja: '前の振る舞いが終わると次の振る舞いが始まる、時間的な順序関係。',
      en: 'A temporal ordering: when the first behaviour finishes, the next one starts.',
    },
    usage: {
      ja: 'プロセスの流れを描く主役。イベント → プロセス → プロセス、と繋いでいく。',
      en: 'The workhorse of process flow: event to process to process.',
    },
    category: 'dynamic',
    keywords: ['triggering', 'トリガー', '順序', 'フロー', '起動'],
  },
  {
    id: 'flow',
    name: { ja: 'フロー', en: 'Flow' },
    meaning: {
      ja: '振る舞いの間で情報やモノが受け渡される関係。何が流れるかをラベルに書く。',
      en: 'Information or things being handed from one behaviour to another. Label it with what moves.',
    },
    usage: {
      ja: 'トリガーとの違いは「順番か、中身か」。順番だけならトリガー、データが渡るならフロー。両方成り立つ場合は 2 本引かず、議論の焦点に合わせて選ぶ。',
      en: 'Trigger is sequence, flow is content. If only order matters use triggering; if something is handed over use flow. When both hold, pick the one matching the discussion instead of drawing two lines.',
    },
    category: 'dynamic',
    keywords: ['flow', 'フロー', 'データフロー', '受け渡し', '情報伝達'],
  },
  {
    id: 'specialization',
    name: { ja: '特化(スペシャライゼーション)', en: 'Specialization' },
    meaning: {
      ja: '「型」と「その型に当てはまる具体例」を結ぶ線。参照モデルや業界標準の型を、自社の実在する要素に落とすときに引く。',
      en: 'The line between a type and something that counts as an instance of it — the one you draw when dropping a reference-model type onto a real element of your own.',
    },
    usage: {
      ja: '参照モデルや業界標準の型を、自社の具体要素で特化するときに使う。使いすぎると図が読めなくなるので、型と実体を分けたい場面に限る。',
      en: 'Use it when specializing a reference model or industry type into your own concrete elements. Overuse makes diagrams unreadable, so reserve it for genuine type/instance separation.',
    },
    category: 'other',
    keywords: ['specialization', '特化', '継承', '種別', 'is-a'],
  },
  {
    id: 'association',
    name: { ja: '関連(アソシエーション)', en: 'Association' },
    meaning: {
      ja: '関係の中身をまだ決めきれていないときに引く線。ラベルを書かない限り、読み手には何も伝わらない。',
      en: 'The line you draw when you have not yet pinned down what the connection actually is. Without a label on it, the reader learns nothing.',
    },
    usage: {
      ja: '逃げ道として便利だが、多用は設計が詰まっていない兆候。関連が全体の 2 割を超えたら、モデルを見直す合図。',
      en: 'A handy escape hatch, but heavy use signals unfinished thinking. If associations exceed roughly a fifth of your lines, the model needs rework.',
    },
    category: 'dependency',
    keywords: ['association', '関連', 'アソシエーション', '関係', 'その他'],
  },
];

// ---------------------------------------------------------------------------
// ADM フェーズとの対応 / TOGAF ADM mapping
// ---------------------------------------------------------------------------

export const TOGAF_ARCHIMATE_MAPPING: TogafArchiMateMapping[] = [
  {
    phaseId: 'preliminary',
    layers: ['motivation', 'strategy'],
    elementIds: ['stakeholder', 'driver', 'principle', 'capability'],
    guidance: {
      ja: 'この段階ではまだ業務もシステムも描かない。描くのは「誰が何を気にしていて、我々はどんな判断基準で進めるか」だけ。原則を要素として置き、根拠となるドライバへ線を引いておくと、後のフェーズで「なぜその方針なのか」に毎回答えずに済む。組織のケイパビリティマップの骨格(第一階層 10 個程度)もここで置いておくとフェーズ A が速い。',
      en: 'Do not model business or systems yet. Model only who cares about what, and the criteria you will decide by. Put principles down as elements and link them to their driving pressures; later phases then stop re-litigating why. Sketching the top tier of the capability map — around ten items — here also accelerates Phase A.',
    },
  },
  {
    phaseId: 'a',
    layers: ['motivation', 'strategy', 'business'],
    elementIds: ['stakeholder', 'driver', 'assessment', 'goal', 'outcome', 'capability', 'value-stream', 'business-service'],
    guidance: {
      ja: 'アーキテクチャビジョンは 1 枚の動機層図に集約できる。ステークホルダー → ドライバ → 評価 → 目標 → 成果 の連鎖を描き、その目標がどのケイパビリティの強化で達成されるかを線で示す。ビジネス層は「対象範囲を示すためのサービス数個」だけに留め、詳細に入らないこと。ここで詳細に入るとフェーズ B が始まらなくなる。',
      en: 'The architecture vision fits on one motivation diagram: stakeholder to driver to assessment to goal to outcome, then a line showing which capability strengthening delivers each goal. Keep the business layer to a handful of services that mark the scope. Going deep here is what stops Phase B from ever starting.',
    },
  },
  {
    phaseId: 'b',
    layers: ['business', 'motivation', 'strategy'],
    elementIds: [
      'business-actor',
      'business-role',
      'business-process',
      'business-function',
      'business-service',
      'business-object',
      'business-event',
      'business-interface',
      'product',
      'value-stream',
    ],
    guidance: {
      ja: 'ビジネスアーキテクチャは「機能分解図(ビジネス機能)」「業務フロー(ビジネスプロセス)」「サービスカタログ(ビジネスサービス)」の 3 枚に整理すると迷わない。ベースラインとターゲットを同じ要素セットで 2 枚描き、差分を後のギャップ要素にする。ここでシステム名が図に混入していないかを必ず点検すること。混入していたら、それはアプリケーション層の作業を前倒ししている。',
      en: 'Three diagrams keep business architecture on track: a functional decomposition, a process flow, and a service catalogue. Draw baseline and target with the same element set so the delta becomes gap elements later. Audit for system names leaking in — if they have, you are doing Phase C work early.',
    },
  },
  {
    phaseId: 'c',
    layers: ['application', 'business'],
    elementIds: [
      'application-component',
      'application-service',
      'application-interface',
      'application-function',
      'application-process',
      'data-object',
      'business-object',
      'business-process',
    ],
    guidance: {
      ja: 'このフェーズはデータとアプリケーションの 2 本立て。データ側はデータオブジェクトからビジネスオブジェクトへ実現関係を張り(具体 → 抽象)、どの概念がどのシステムに何個あるかを見せる(ここで重複が必ず出る)。アプリ側はコンポーネント → アプリケーションサービス → ビジネスプロセス の 3 段で描く。コンポーネントから業務プロセスへ直接線を引かないこと。サービスを挟まないと、システム更改のたびに業務側の図まで作り直しになる。',
      en: 'Two strands: data and application. On the data side, draw realization from each data object up to the business object it stands for, and show how many copies of each concept live in how many systems — duplication always surfaces. On the application side, draw component to application service to business process. Never wire a component straight to a process; without the service in between, every system replacement forces a redraw of the business views.',
    },
  },
  {
    phaseId: 'd',
    layers: ['technology', 'physical', 'application'],
    elementIds: [
      'node',
      'device',
      'system-software',
      'technology-service',
      'technology-interface',
      'path',
      'communication-network',
      'artifact',
      'facility',
      'equipment',
    ],
    guidance: {
      ja: '基盤は「テクノロジーサービス」を先に定義してから中身を描くと崩れない。ノードがサービスを実現し、そのサービスがアプリケーションコンポーネントを支援する、という 3 段が基本形。配置構成はアーティファクトを使って別ビューにする。システムソフトウェアにサポート期限を書いておくと、そのまま更改ロードマップの根拠になる。OT/IoT があるときだけ物理層(設備・施設)を足す。',
      en: 'Define technology services first, then fill in what is under them. The standard shape is node realizes service, service serves application component. Keep deployment in its own view built from artifacts. Recording support end dates on system software turns straight into the refresh roadmap justification. Add the physical layer only when OT or IoT is in scope.',
    },
  },
  {
    phaseId: 'e',
    layers: ['implementation', 'motivation'],
    elementIds: ['gap', 'work-package', 'deliverable', 'plateau', 'course-of-action', 'outcome'],
    guidance: {
      ja: 'B〜D の差分をギャップ要素として一箇所に集め、それを束ねて作業パッケージにする。ギャップ 1 個に作業パッケージ 1 個を対応させないこと(数が爆発する)。束ね方の軸は「同じ担当組織」「同じシステム」「同じ時期」のいずれかにすると現実的な計画になる。各作業パッケージから成果へ線を引き、投資と効果の対応を 1 枚で見せられる形にする。',
      en: 'Collect the deltas from Phases B–D as gap elements in one place, then bundle them into work packages. Do not map one gap to one work package — the count explodes. Bundle by owning team, by system, or by timing to get a plan people can actually run. Link each work package to an outcome so investment and effect fit on one page.',
    },
  },
  {
    phaseId: 'f',
    layers: ['implementation'],
    elementIds: ['plateau', 'gap', 'work-package', 'implementation-event', 'deliverable'],
    guidance: {
      ja: '移行計画はプラトーで表現する。プラトーは 2〜4 個に絞り、それぞれ「その時点で動いている姿」を描く。プラトー間には実装イベント(カットオーバー、旧停止)を置く。プラトー間のギャップが、その区間で実行される作業パッケージと 1 対 1 で対応していれば計画として成立している。対応が付かない作業パッケージは、実は要らないか、時期が違う。',
      en: 'Express migration as plateaus — two to four of them, each drawn as what is actually running at that moment, with implementation events (cutover, decommission) on the boundaries. The plan holds together when the gaps between plateaus line up one-to-one with the work packages running in that interval. A work package with no such match is either unnecessary or scheduled wrong.',
    },
  },
  {
    phaseId: 'g',
    layers: ['implementation', 'motivation', 'application'],
    elementIds: ['work-package', 'deliverable', 'requirement', 'constraint', 'principle', 'application-component'],
    guidance: {
      ja: 'ここで使うのは新しい図ではなく、既に描いた図との照合。実装されたものを既存要素にマッピングし、目標像との差(逸脱)を可視化する。実装要素から要件・原則への実現関係が切れている箇所が、そのまま「合意なしに変わった部分」。逸脱は消さずに残し、許容するのか是正するのかを決めた記録として使う。',
      en: 'This phase needs no new diagram — it needs a comparison with the ones you have. Map what was built onto existing elements and expose the drift from the target. Wherever the realization links running up from built elements to requirements and principles are broken, something changed without agreement. Keep the deviations in the model as the record of what was accepted versus what will be corrected.',
    },
  },
  {
    phaseId: 'h',
    layers: ['motivation', 'implementation', 'business'],
    elementIds: ['driver', 'assessment', 'goal', 'gap', 'plateau', 'business-service'],
    guidance: {
      ja: '変更管理では「モデルのどこから直すか」を決める。ドライバが変わったなら動機層から、業務が変わったならビジネス層から、基盤更改だけならテクノロジー層のみ、と影響範囲を先に切る。到達済みのプラトーを新しいベースラインとして固定し、そこから次のサイクルを始めるのが最も事故が少ない。モデル全体を一度に作り直そうとしないこと。',
      en: 'Change management is about deciding where in the model to start editing. If a driver changed, start at motivation; if the business changed, at the business layer; if it is only a platform refresh, technology alone. Fixing the reached plateau as the new baseline and starting the next cycle from there is the lowest-risk move. Do not attempt a wholesale rebuild.',
    },
  },
  {
    phaseId: 'requirements-management',
    layers: ['motivation'],
    elementIds: ['requirement', 'constraint', 'goal', 'outcome', 'principle', 'stakeholder'],
    guidance: {
      ja: '要件は全フェーズを貫くので、要件要素は「専用の 1 ビュー」に集約し、各フェーズの図からは参照する形にする。実現する要素 → 要件、の向き(具体 → 抽象)で実現関係を必ず張ること。この線があると「この機能は誰が求めたか」「この要件はどこで実装されたか」の双方向に即答できる。逆にこの線がないモデルは、変更の影響範囲を人間の記憶に頼ることになる。',
      en: 'Requirements cut across every phase, so keep them in one dedicated view and reference it from the phase diagrams. Always draw realization from whatever satisfies a requirement up to the requirement itself — concrete to abstract, never the reverse. With those links you can answer both "who asked for this feature" and "where was this requirement implemented" instantly; without them, impact analysis runs on human memory.',
    },
  },
];

// ---------------------------------------------------------------------------
// 参照ヘルパ / Lookup helpers
// ---------------------------------------------------------------------------

/** 要素を ID で引く / Find an element by id. */
export function findArchiMateElement(id: string): ArchiMateElement | undefined {
  const key = id.trim().toLowerCase();
  return ARCHIMATE_ELEMENTS.find((e) => e.id === key);
}

/** 層を ID で引く / Find a layer by id. */
export function findArchiMateLayer(id: string): ArchiMateLayer | undefined {
  const key = id.trim().toLowerCase();
  return ARCHIMATE_LAYERS.find((l) => l.id === key);
}

/** 関係を ID で引く / Find a relationship by id. */
export function findArchiMateRelationship(id: string): ArchiMateRelationship | undefined {
  const key = id.trim().toLowerCase();
  return ARCHIMATE_RELATIONSHIPS.find((r) => r.id === key);
}

/** 層に属する要素を返す / All elements belonging to a layer. */
export function elementsByLayer(layer: ArchiMateLayerId): ArchiMateElement[] {
  return ARCHIMATE_ELEMENTS.filter((e) => e.layer === layer);
}

/** ADM フェーズ ID から対応表を引く / Find the mapping row for an ADM phase. */
export function findArchiMateMapping(phaseId: string): TogafArchiMateMapping | undefined {
  const key = phaseId.trim().toLowerCase();
  return TOGAF_ARCHIMATE_MAPPING.find((m) => m.phaseId === key);
}

/**
 * キーワードが対象文に含まれるか。ASCII は単語境界、日本語は部分一致。
 * 知識ベース本体(index.ts の matchesKeyword)との循環 import を避けるため同等ロジックをここに置く。
 */
function archiMateMatches(haystackLower: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (k.length === 0) return false;
  // eslint-disable-next-line no-control-regex
  if (!/^[\x00-\x7F]+$/.test(k)) return haystackLower.includes(k);
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(haystackLower);
}

/**
 * 要素をキーワードで検索する / Keyword search over elements.
 *
 * 単に「当たった要素を全部返す」と 1 文字クエリでほぼ全件が並んでしまい、
 * 呼び出し側(ツール)の出力が読めなくなる。ID・名称・キーワードの一致を重く、
 * 本文の一致を軽く採点し、スコア順に並べて返す。同点は定義順(層の並び順)を保つ。
 */
export function searchArchiMateElements(query: string, limit?: number): ArchiMateElement[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const terms = Array.from(new Set([q, ...q.split(/\s+/).filter((t) => t.length > 0)]));

  const scored: { element: ArchiMateElement; score: number; order: number }[] = [];
  ARCHIMATE_ELEMENTS.forEach((e, order) => {
    const nameLower = `${e.name.ja} ${e.name.en}`.toLowerCase();
    const keywordsLower = e.keywords.map((k) => k.toLowerCase());
    const body = [
      e.meaning.ja, e.meaning.en, e.usage.ja, e.usage.en,
      e.confusedWith?.ja ?? '', e.confusedWith?.en ?? '',
    ].join(' ').toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (e.id === term) score += 12;
      if (keywordsLower.some((k) => k === term)) score += 8;
      else if (keywordsLower.some((k) => k.includes(term) || term.includes(k))) score += 4;
      if (archiMateMatches(nameLower, term)) score += 6;
      if (archiMateMatches(body, term)) score += 2;
    }
    if (score > 0) scored.push({ element: e, score, order });
  });

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  const ranked = scored.map((s) => s.element);
  return typeof limit === 'number' && limit > 0 ? ranked.slice(0, limit) : ranked;
}
