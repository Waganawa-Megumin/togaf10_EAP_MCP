/**
 * ADM 技法の知識ベース / ADM techniques knowledge base.
 * 独自の要約・実務解説。原文の転載はしない。
 */

import type { Technique } from './types.js';

export const TECHNIQUES: Technique[] = [
  {
    id: 'gap-analysis',
    name: { ja: 'ギャップ分析', en: 'Gap Analysis' },
    summary: {
      ja: '現行(ベースライン)と目標(ターゲット)を同じ切り口で並べ、「足りないもの」「不要になるもの」を機械的に洗い出す技法。ADM の B〜D で繰り返し使い、E で作業パッケージの原料になる。',
      en: 'Lay the baseline and the target side by side using the same dimensions, and mechanically surface what is missing and what becomes obsolete. Used repeatedly in Phases B–D; the raw material for work packages in Phase E.',
    },
    whenToUse: [
      { ja: 'B/C/D の各アーキテクチャで、目標像を描き終えた直後', en: 'Right after the target has been described in each of Phases B, C, and D' },
      { ja: '複数の改善案のうち、どれが本当に差分を埋めるのか検証したいとき', en: 'When you need to verify which of several proposals actually closes the delta' },
      { ja: '「現行のまま何もしない」場合の不足を経営層に示したいとき', en: 'When you need to show executives what is missing if nothing is done' },
    ],
    steps: [
      { ja: '現行側の構成要素を行、目標側を列にしたマトリクスを作る', en: 'Build a matrix with baseline elements as rows and target elements as columns' },
      { ja: '列に「新規(New)」の行、行に「廃止(Eliminated)」の列を追加する', en: 'Add a "New" row and an "Eliminated" column to catch both directions' },
      { ja: '交点に対応関係を記入する(そのまま流用/改修/置換)', en: 'Fill the intersections: carried over, modified, or replaced' },
      { ja: '「新規」行と「廃止」列に残った項目がギャップそのもの', en: 'What remains in the New row and the Eliminated column is the gap itself' },
      { ja: '各ギャップに影響度と概算規模を付ける', en: 'Attach impact and rough size to each gap' },
    ],
    pitfalls: [
      { ja: '「廃止」側を書かない。増える話ばかりになり、コスト削減の根拠が消える。', en: 'Skipping the elimination side. Everything becomes additive and the cost-reduction case evaporates.' },
      { ja: '現行と目標で粒度が揃っていないと、マトリクスが埋まらず作業が止まる。', en: 'If baseline and target are described at different granularity, the matrix cannot be filled and the work stalls.' },
      { ja: 'ギャップを列挙して満足してしまう。ギャップは「束ねて初めて」計画になる。', en: 'Stopping at the list. Gaps only become a plan once they are bundled.' },
    ],
    phaseIds: ['b', 'c', 'd', 'e', 'f'],
    keywords: ['gap', 'ギャップ', 'ギャップ分析', 'gap analysis', 'baseline', 'target', '差分', '現行', '目標'],
  },
  {
    id: 'business-scenarios',
    name: { ja: 'ビジネスシナリオ', en: 'Business Scenarios' },
    summary: {
      ja: '「誰が、どこで、何に困っていて、どうなれば解決なのか」を具体的な物語として書き、そこから要件を導出する技法。抽象的な要求(「DX を進めたい」)を検証可能な要件に落とすのに使う。',
      en: 'Write a concrete story — who, where, what problem, what counts as solved — and derive requirements from it. The tool for turning vague asks ("we want to do DX") into testable requirements.',
    },
    whenToUse: [
      { ja: 'フェーズ A で、依頼の背景が抽象的なとき', en: 'In Phase A, when the request arrives as an abstraction' },
      { ja: 'ステークホルダー間で「解決すべき問題」の認識がずれているとき', en: 'When stakeholders disagree on what problem is being solved' },
      { ja: '要件が機能一覧として渡され、目的が説明されていないとき', en: 'When requirements arrive as a feature list with no stated purpose' },
    ],
    steps: [
      { ja: '問題を、業務・場所・時間の文脈込みで記述する', en: 'Describe the problem with its business, location, and timing context' },
      { ja: '登場人物(人間・システム)とその役割を洗い出す', en: 'Identify the actors — human and system — and their roles' },
      { ja: '現状のやり取りを時系列で書く', en: 'Write the current interaction as a sequence' },
      { ja: '解決後のやり取りを同じ形式で書く', en: 'Write the post-solution interaction in the same form' },
      { ja: '2 つの差から要件を抽出し、測定可能な成功条件を付ける', en: 'Extract requirements from the difference and attach measurable success criteria' },
    ],
    pitfalls: [
      { ja: 'シナリオに解決策(製品名)を書き込んでしまい、選択肢を先に潰す。', en: 'Writing the solution (a product name) into the scenario, killing the option space before analysis.' },
      { ja: '理想的な登場人物しか出さない。例外系・悪意ある利用者を入れないと非機能要件が出てこない。', en: 'Only casting well-behaved actors. Without exception paths and hostile users, non-functional requirements never surface.' },
      { ja: '成功条件が「満足度が上がる」で止まる。数値と測定方法まで書く。', en: 'Stopping at "satisfaction improves". Write the number and how it will be measured.' },
    ],
    phaseIds: ['a', 'b', 'requirements-management'],
    keywords: ['business scenario', 'ビジネスシナリオ', 'シナリオ', '要件抽出', 'requirement elicitation', 'ユースケース', '課題'],
  },
  {
    id: 'stakeholder-management',
    name: { ja: 'ステークホルダー管理', en: 'Stakeholder Management' },
    summary: {
      ja: '関係者を洗い出し、影響力と関心度で分類し、それぞれの関心事に応じたビュー(見せ方)と関与方法を決める技法。EA プロジェクトの成否は技術ではなくここで決まることが多い。',
      en: 'Identify everyone involved, classify them by power and interest, and decide which view to show each of them and how to engage. EA projects are more often decided here than on technical merit.',
    },
    whenToUse: [
      { ja: 'フェーズ A の最初期(作業範囲記述書を書く前)', en: 'At the very start of Phase A, before writing the Statement of Architecture Work' },
      { ja: '意思決定が進まない、承認が降りないとき', en: 'When decisions stall or approvals do not come' },
      { ja: '組織変更・人事異動でキーパーソンが替わったとき', en: 'When a reorg or personnel change replaces a key person' },
    ],
    steps: [
      { ja: '関係者を役割・部門横断で洗い出す(反対者も必ず入れる)', en: 'List stakeholders across roles and units — including the opponents' },
      { ja: '各人の関心事(concerns)を具体的に書く', en: 'Write each one\'s concerns concretely' },
      { ja: '影響力 × 関心度でマトリクスに配置する', en: 'Plot them on a power/interest matrix' },
      { ja: '象限ごとに関与方針を決める(密に関与/満足を維持/情報提供/監視)', en: 'Set an engagement approach per quadrant: manage closely, keep satisfied, keep informed, monitor' },
      { ja: '関心事ごとに、どのビュー・どの成果物で答えるかを対応付ける', en: 'Map each concern to the view or deliverable that will answer it' },
      { ja: 'コミュニケーション計画に落とし、定期的に見直す', en: 'Turn it into a communications plan and revisit it regularly' },
    ],
    pitfalls: [
      { ja: '役職で分類して満足する。重要なのは肩書きではなく「何を心配しているか」。', en: 'Classifying by job title. What matters is not the title but what the person is worried about.' },
      { ja: '反対者を外す。反対者こそ最も具体的なリスクを教えてくれる。', en: 'Excluding opponents. They are the ones who describe your risks most precisely.' },
      { ja: '全員に同じ資料を配る。経営層に 80 ページの定義書を送っても読まれない。', en: 'Sending everyone the same document. An 80-page definition document does not get read by executives.' },
      { ja: '一度作って更新しない。人が替われば関心事も変わる。', en: 'Building it once and never updating it. People change, and so do the concerns.' },
    ],
    phaseIds: ['preliminary', 'a', 'b', 'c', 'd', 'g', 'requirements-management'],
    keywords: ['stakeholder', 'ステークホルダー', '関係者', 'concerns', '関心事', 'power interest', '影響力', 'communication', 'コミュニケーション', '合意形成', '調整'],
  },
  {
    id: 'architecture-principles-technique',
    name: { ja: 'アーキテクチャ原則の策定', en: 'Architecture Principles' },
    summary: {
      ja: '個別の判断を一貫させるための、組織として合意した判断基準を定義する技法。原則は「名称・記述・根拠・含意」の 4 点セットで書く。含意(何を諦めるか)がない原則は機能しない。',
      en: 'Define agreed decision criteria so individual judgements stay consistent. Each principle is written as four parts: name, statement, rationale, and implications. A principle without implications — without a stated cost — does nothing.',
    },
    whenToUse: [
      { ja: '予備フェーズでの EA 立ち上げ時', en: 'When standing up the EA practice in the Preliminary Phase' },
      { ja: '案件ごとに判断がぶれ、同じ議論を繰り返しているとき', en: 'When the same argument recurs because judgements differ project by project' },
      { ja: '技術選定で「好み」の議論が終わらないとき', en: 'When technology selection debates never resolve beyond personal preference' },
    ],
    steps: [
      { ja: '経営戦略と既存規程から原則の候補を引き出す', en: 'Draw candidate principles from corporate strategy and existing policy' },
      { ja: '各候補を 4 点セット(名称/記述/根拠/含意)で記述する', en: 'Write each as the four-part set: name, statement, rationale, implications' },
      { ja: '「含意」に、その原則を守ることで生じる不便・コストを正直に書く', en: 'In implications, honestly record the inconvenience and cost of honouring it' },
      { ja: '原則同士の衝突を洗い出し、優先順位を決める', en: 'Surface conflicts between principles and set precedence' },
      { ja: '経営層の承認を得て公開し、レビューの判断基準として使う', en: 'Get executive approval, publish, and use them as the criteria in reviews' },
    ],
    pitfalls: [
      { ja: '反対できない標語(「品質を重視する」)を並べる。判断に使えない原則は存在しないのと同じ。', en: 'Listing slogans nobody could disagree with ("we value quality"). A principle that cannot decide anything does not exist.' },
      { ja: '数が多すぎて誰も覚えていない。', en: 'Having so many that nobody remembers them.' },
      { ja: '原則同士の優先順位を決めていないため、衝突時にその場の力関係で決まる。', en: 'Leaving precedence undefined, so conflicts get settled by whoever is more powerful in the room.' },
    ],
    phaseIds: ['preliminary', 'a', 'g'],
    keywords: ['principle', '原則', 'アーキテクチャ原則', 'architecture principles', '判断基準', 'rationale', '根拠', '含意', 'implications'],
  },
  {
    id: 'risk-management',
    name: { ja: 'リスク管理', en: 'Risk Management' },
    summary: {
      ja: 'アーキテクチャ作業と変革に伴うリスクを、影響度と発生可能性で評価し、対策前(初期リスク)と対策後(残存リスク)の 2 段階で管理する技法。残存リスクの受容は必ず記名で行う。',
      en: 'Assess the risks of the architecture work and the transformation by impact and frequency, and manage them in two stages: initial risk before mitigation and residual risk after. Acceptance of residual risk is always signed by a named person.',
    },
    whenToUse: [
      { ja: 'フェーズ A の初期リスク評価', en: 'The initial risk assessment in Phase A' },
      { ja: 'フェーズ E/F で移行計画のリスクを見積もるとき', en: 'When sizing the risk of the migration plan in Phases E and F' },
      { ja: '大規模移行・レガシー刷新など不確実性が高い案件全般', en: 'Any high-uncertainty engagement such as a large migration or legacy renewal' },
    ],
    steps: [
      { ja: 'リスクを事象として書く(「〜が原因で〜が起きる」の形)', en: 'State each risk as an event: "because X, Y happens"' },
      { ja: '影響度(致命的/重大/中/軽微)と発生可能性を評価する', en: 'Rate impact (catastrophic, critical, marginal, negligible) and frequency' },
      { ja: '掛け合わせて初期リスクレベルを決める', en: 'Combine them into an initial risk level' },
      { ja: '緩和策を定義し、残存リスクを再評価する', en: 'Define mitigations and re-assess the residual risk' },
      { ja: '受容できない残存リスクは、対策を追加するか作業範囲を変える', en: 'Where residual risk is unacceptable, add mitigation or change the scope' },
      { ja: '受容するリスクは、受容者を記名して文書化する', en: 'For risks you accept, document them with the name of the person accepting' },
    ],
    pitfalls: [
      { ja: '「リスク: 遅延」のような曖昧な書き方。原因と結果を書かないと対策が立たない。', en: 'Writing "risk: delay". Without cause and effect there is no mitigation to design.' },
      { ja: '残存リスクを評価しないまま緩和策を並べる。', en: 'Listing mitigations without re-assessing what remains.' },
      { ja: '受容者が「組織」になっている。組織は責任を取らない。個人名を書く。', en: 'Naming "the organization" as the acceptor. Organizations do not take responsibility; write a person\'s name.' },
    ],
    phaseIds: ['a', 'd', 'e', 'f', 'g', 'h'],
    keywords: ['risk', 'リスク', 'リスク管理', 'risk management', 'residual', '残存リスク', 'mitigation', '緩和策', '影響度', '発生可能性'],
  },
  {
    id: 'business-transformation-readiness',
    name: { ja: 'ビジネス変革準備度評価', en: 'Business Transformation Readiness Assessment' },
    summary: {
      ja: '組織が変革を受け止められる状態にあるかを、経営の意思・予算・体制・スキル・過去の実績などの因子で評価する技法。技術的に正しい計画が現場で死ぬ理由を、着手前に特定する。',
      en: 'Assess whether the organization can actually absorb the change, across factors such as executive will, funding, capacity, skills, and track record. It identifies, before you start, why a technically correct plan will die on the floor.',
    },
    whenToUse: [
      { ja: 'フェーズ A で作業範囲を確定する前', en: 'In Phase A, before fixing the scope of work' },
      { ja: 'フェーズ E で移行の刻み方を決めるとき', en: 'In Phase E, when deciding how finely to phase the migration' },
      { ja: '過去に同種のプロジェクトが失敗している組織', en: 'In an organization where similar projects have failed before' },
    ],
    steps: [
      { ja: '評価因子を選ぶ(経営の意思、予算、体制、スキル、変革実績、業務部門の受容度など)', en: 'Choose the factors: executive will, funding, capacity, skills, track record, business acceptance' },
      { ja: '因子ごとに現状を評価し、目標水準との差を出す', en: 'Rate each factor today and against the level the plan requires' },
      { ja: '差が大きい因子を「変革リスク」としてリスク登録簿に転記する', en: 'Move the widest gaps into the risk register as transformation risks' },
      { ja: '因子を改善する施策(教育、体制強化、パイロット)をロードマップに組み込む', en: 'Build remedies — training, staffing, a pilot — into the roadmap' },
    ],
    pitfalls: [
      { ja: '評価結果を経営層に見せずに握り潰す。準備度が低いという事実こそ最重要の報告事項。', en: 'Burying the result instead of showing executives. Low readiness is the single most important thing to report.' },
      { ja: 'スキル不足を「教育で解決」と一行で片付ける。工数と期間を計画に入れる。', en: 'Dismissing a skills gap with "we will train them". Put the effort and elapsed time into the plan.' },
      { ja: '評価を一度きりにする。準備度は変革の途中で下がることがある。', en: 'Assessing once. Readiness can fall during the transformation.' },
    ],
    phaseIds: ['a', 'b', 'e', 'h'],
    keywords: ['readiness', '準備度', '変革', 'transformation', 'change readiness', '組織', 'culture', '文化', 'skill', 'スキル'],
  },
  {
    id: 'capability-based-planning',
    name: { ja: '能力ベース計画', en: 'Capability-Based Planning' },
    summary: {
      ja: '「どのシステムを作るか」ではなく「事業としてどの能力を、いつまでに、どの水準にするか」を軸に計画を立てる技法。組織・プロセス・人・技術を横断して投資を束ねられる。',
      en: 'Plan around "which business capability, to what level, by when" instead of "which system to build". It lets you bundle investment across organization, process, people, and technology.',
    },
    whenToUse: [
      { ja: '複数部門・複数システムにまたがる変革の計画時(フェーズ B/E)', en: 'Planning change that spans units and systems, in Phases B and E' },
      { ja: 'システム単位の計画では投資対効果を説明できないとき', en: 'When a system-by-system plan cannot explain the return on investment' },
      { ja: '経営層と IT の会話がかみ合わないとき', en: 'When executives and IT are talking past each other' },
    ],
    steps: [
      { ja: 'ビジネス能力を階層で定義する(通常 2〜3 階層)', en: 'Define business capabilities in a hierarchy, usually two or three levels' },
      { ja: '各能力の現在水準と目標水準を評価する', en: 'Rate the current and target level of each capability' },
      { ja: '戦略への寄与度で能力に優先順位を付ける(ヒートマップ化)', en: 'Prioritize capabilities by contribution to strategy — a heat map works well' },
      { ja: '能力向上に必要な要素(人・プロセス・情報・技術)を洗い出す', en: 'Identify what each uplift needs: people, process, information, technology' },
      { ja: '能力単位で投資増分(capability increment)を定義し、ロードマップに並べる', en: 'Define capability increments and lay them out on the roadmap' },
    ],
    pitfalls: [
      { ja: '能力マップが組織図のコピーになっている。組織が変わると全部作り直しになる。', en: 'Producing a capability map that is really a copy of the org chart. It has to be rebuilt at every reorg.' },
      { ja: '階層を深く作りすぎる。4 階層以上は運用されない。', en: 'Decomposing too deeply. Beyond three levels nobody maintains it.' },
      { ja: '能力の水準評価が主観のみ。評価基準を先に定義する。', en: 'Rating levels purely subjectively. Define the rating scale first.' },
    ],
    phaseIds: ['b', 'c', 'e', 'f'],
    keywords: ['capability', '能力', 'ケイパビリティ', 'capability based planning', '能力ベース', 'heatmap', 'ヒートマップ', 'increment', '投資'],
  },
  {
    id: 'migration-planning-techniques',
    name: { ja: '移行計画技法', en: 'Migration Planning Techniques' },
    summary: {
      ja: '実装の順序と刻み方を決めるための一連の技法。実装因子表、統合ギャップ一覧、アーキテクチャ定義の増分表、事業価値評価などを使い、「何を先にやるか」を根拠付きで決める。',
      en: 'A family of techniques for deciding sequence and increments: the implementation factor catalog, the consolidated gaps list, the architecture definition increments table, and business value assessment. Together they justify what goes first.',
    },
    whenToUse: [
      { ja: 'フェーズ E/F でロードマップと移行計画を作るとき', en: 'When building the roadmap and migration plan in Phases E and F' },
      { ja: '依存関係が複雑で、着手順が決まらないとき', en: 'When dependencies are tangled and the start order will not settle' },
      { ja: '限られた予算の中で優先順位を説明する必要があるとき', en: 'When you must justify priorities against a limited budget' },
    ],
    steps: [
      { ja: '実装に影響する因子(制約、期日、依存、リスク)を一覧化する', en: 'Catalog the factors that affect implementation: constraints, deadlines, dependencies, risks' },
      { ja: '統合ギャップ一覧を作り、作業パッケージ候補に束ねる', en: 'Consolidate the gaps and bundle them into candidate work packages' },
      { ja: '各パッケージを事業価値 × 実現容易性で評価する', en: 'Score each package on business value against ease of delivery' },
      { ja: '依存関係を踏まえ、増分(移行アーキテクチャ)ごとに何が完成するか表にする', en: 'Respecting dependencies, tabulate what each increment (transition architecture) completes' },
      { ja: '各増分の完了時点で得られる便益を明記する', en: 'State the benefit realized at the end of each increment' },
    ],
    pitfalls: [
      { ja: '技術的な依存関係だけで順序を決める。予算サイクルと人員の空きが実際の制約。', en: 'Sequencing on technical dependencies alone. Budget cycles and people\'s availability are the real constraints.' },
      { ja: '「基盤を全部作ってからアプリ」の順序にして、2 年間何も見えない計画にする。', en: 'Ordering it "platform first, applications later" and producing a plan that shows nothing for two years.' },
      { ja: '増分の便益を書かないため、途中で予算を切られる。', en: 'Omitting the benefit of each increment, which is exactly why funding gets cut midway.' },
    ],
    phaseIds: ['e', 'f'],
    keywords: ['migration', '移行', '移行計画', 'sequencing', '順序', 'increment', '増分', 'transition', 'business value', '事業価値', '優先順位'],
  },
  {
    id: 'interoperability-requirements',
    name: { ja: '相互運用性要件', en: 'Interoperability Requirements' },
    summary: {
      ja: '「どの情報が、どの組織/システム間で、どの程度シームレスに流れるべきか」を段階で定義する技法。相互運用性の目標水準を先に決めることで、統合方式の議論が主観から抜け出せる。',
      en: 'Define, in degrees, what information should flow between which organizations and systems and how seamlessly. Setting the target level of interoperability first is what lifts the integration debate out of opinion.',
    },
    whenToUse: [
      { ja: 'フェーズ C/D で連携方式を決めるとき', en: 'When deciding integration approaches in Phases C and D' },
      { ja: 'M&A や部門統合でシステムを繋ぐ必要があるとき', en: 'When systems must be connected after an acquisition or a merger of units' },
      { ja: '外部パートナー・行政システムとの連携要件があるとき', en: 'When there are integration requirements with external partners or government systems' },
    ],
    steps: [
      { ja: '相互運用性の段階を定義する(手動連携 / ファイル共有 / データ共有 / 意味レベルの共有)', en: 'Define the levels: manual, shared files, shared data, shared semantics' },
      { ja: '情報の流れごとに目標段階を決める', en: 'Set a target level for each information flow' },
      { ja: '現状の段階との差を洗い出す', en: 'Identify the gap from the current level' },
      { ja: '段階を上げるために必要な標準(データ定義、API 仕様、コード体系)を決める', en: 'Decide the standards needed to raise the level: data definitions, API specs, code systems' },
      { ja: '相互運用性要件をアーキテクチャ要件仕様に登録する', en: 'Register the interoperability requirements in the Architecture Requirements Specification' },
    ],
    pitfalls: [
      { ja: '全連携を最高段階にしようとする。コストが跳ね上がる。必要な所だけ上げる。', en: 'Pushing every interface to the highest level. Cost explodes; raise only where it pays.' },
      { ja: '技術的な接続(API がある)を相互運用性と混同する。意味が揃っていなければ繋がっていない。', en: 'Confusing technical connectivity with interoperability. If the semantics do not match, it is not connected.' },
      { ja: 'コード体系・マスタの統一を後回しにする。ここが最大の隠れコスト。', en: 'Deferring code systems and master data alignment — the single largest hidden cost.' },
    ],
    phaseIds: ['c', 'd', 'e'],
    keywords: ['interoperability', '相互運用性', '連携', 'integration', 'api', 'データ連携', 'm&a', '統合', 'マスタ'],
  },
  {
    id: 'architecture-governance',
    name: { ja: 'アーキテクチャガバナンス', en: 'Architecture Governance' },
    summary: {
      ja: 'アーキテクチャに関する意思決定・統制・説明責任の仕組み。委員会(アーキテクチャボード)、レビュー、適合性評価、例外管理、リポジトリ管理をセットで運用する。',
      en: 'The machinery of decision rights, control, and accountability for architecture: an architecture board, reviews, conformance assessment, exception handling, and repository management, operated as one set.',
    },
    whenToUse: [
      { ja: '予備フェーズでの枠組み定義時', en: 'When defining the framework in the Preliminary Phase' },
      { ja: 'フェーズ G の実装ガバナンス運用時', en: 'When operating implementation governance in Phase G' },
      { ja: 'アーキテクチャが守られず形骸化しているとき', en: 'When the architecture is being ignored and has become paperwork' },
    ],
    steps: [
      { ja: 'アーキテクチャボードの構成・権限・招集頻度を定義する', en: 'Define the board: membership, authority, and cadence' },
      { ja: 'レビューの対象と通過基準(ゲート)を決める', en: 'Decide what gets reviewed and the criteria for passing each gate' },
      { ja: '適合性の水準を定義する(準拠/一部準拠/非準拠/非適合)', en: 'Define conformance levels: conformant, partially conformant, non-conformant, irreconcilable' },
      { ja: '例外申請プロセスと有効期限のルールを作る', en: 'Create the exception process with expiry rules' },
      { ja: '決定事項と例外を台帳で管理し、定期的に棚卸しする', en: 'Track decisions and exceptions in registers and review them on a cadence' },
    ],
    pitfalls: [
      { ja: 'ボードに決定権がない。助言機関にすると誰も議題を持ち込まなくなる。', en: 'A board with no decision rights. Once it is merely advisory, nobody brings it anything.' },
      { ja: 'レビューのタイミングが遅すぎる。実装完了後のレビューは指摘しても直せない。', en: 'Reviewing too late. Findings after implementation cannot be acted on.' },
      { ja: '例外を出さない運用にすると、現場は申請せずに黙って逸脱する。', en: 'Refusing to grant exceptions at all just means teams deviate silently instead of asking.' },
    ],
    phaseIds: ['preliminary', 'g', 'h'],
    keywords: ['governance', 'ガバナンス', 'architecture board', 'アーキテクチャボード', '委員会', 'compliance', '適合性', '例外', 'exception', '統制'],
  },
  {
    id: 'architecture-maturity',
    name: { ja: 'アーキテクチャ成熟度評価', en: 'Architecture Maturity Assessment' },
    summary: {
      ja: 'EA の実践能力そのものを段階評価し、改善の道筋を描く技法。成果物の質ではなく、プロセス・体制・定着度を測る。EA 組織自身の投資を正当化する材料になる。',
      en: 'Rate the EA practice itself on a maturity scale and chart a path to improve it. It measures process, organization, and adoption rather than the quality of any one deliverable — and it is the material that justifies investment in the EA function.',
    },
    whenToUse: [
      { ja: 'EA 活動を立ち上げる前後(予備フェーズ)', en: 'Around the launch of the EA practice, in the Preliminary Phase' },
      { ja: 'EA 組織の予算・人員を確保する説明が必要なとき', en: 'When you need to justify budget or headcount for the EA function' },
      { ja: '年次で EA 活動を振り返るとき(フェーズ H)', en: 'At the annual review of the EA practice, in Phase H' },
    ],
    steps: [
      { ja: '評価領域を選ぶ(プロセス、体制、成果物、ツール、定着度、経営の関与)', en: 'Choose the assessment areas: process, organization, deliverables, tooling, adoption, executive involvement' },
      { ja: '各領域を段階(初期/反復可能/定義済/管理された/最適化)で評価する', en: 'Rate each area on a scale: initial, repeatable, defined, managed, optimizing' },
      { ja: '目標段階を決める(全領域で最高を目指さない)', en: 'Set the target level — not the top level everywhere' },
      { ja: '差の大きい領域に対する改善施策を計画する', en: 'Plan improvements where the gap is widest' },
      { ja: '定期的に再評価し、推移を示す', en: 'Re-assess on a cadence and show the trend' },
    ],
    pitfalls: [
      { ja: '成熟度を上げること自体が目的化する。事業成果と結び付けて語る。', en: 'Letting maturity become the goal itself. Always tie it back to business outcomes.' },
      { ja: '自己評価のみで甘くなる。利用部門にも評価してもらう。', en: 'Self-assessment alone is generous. Have the consuming teams rate you too.' },
      { ja: '全領域を一律に上げようとする。必要な領域だけ上げれば十分。', en: 'Trying to raise every area uniformly. Raising the areas that matter is enough.' },
    ],
    phaseIds: ['preliminary', 'h'],
    keywords: ['maturity', '成熟度', 'assessment', '評価', 'capability maturity', 'ea 組織', '改善'],
  },
];

export function findTechnique(id: string): Technique | undefined {
  const key = id.trim().toLowerCase();
  return (
    TECHNIQUES.find((t) => t.id === key) ??
    TECHNIQUES.find((t) => t.name.en.toLowerCase() === key || t.name.ja === id.trim())
  );
}
